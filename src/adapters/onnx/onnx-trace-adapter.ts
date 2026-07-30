import type {
  ModelTrace,
  TensorSummary,
  TraceAdapter,
  TraceEntity,
  TraceLoadOptions,
  TraceOperation,
  TracePhase,
  TraceStep,
} from '../../domain/trace/trace'
import { TRACE_SCHEMA_VERSION } from '../../domain/trace/trace'
import { validateModelTrace } from '../../domain/trace/trace-validator'
import {
  DISTILGPT2_MODEL_SPEC,
  type Distilgpt2ModelSpec,
} from '../../platform/model-runtime/distilgpt2-inference'
import type {
  ModelWorkerRequestOptions,
} from '../../platform/model-runtime/model-worker-client'
import type {
  RunInferencePayload,
  WorkerInferencePayload,
  WorkerTensorPayload,
} from '../../platform/model-runtime/worker-protocol'

export interface OnnxInferenceClient {
  runInference(
    payload: RunInferencePayload,
    options?: Omit<ModelWorkerRequestOptions, 'onProgress'>,
  ): Promise<WorkerInferencePayload>
}

export class OnnxTraceAdapterError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OnnxTraceAdapterError'
  }
}

function tensorValues(tensor: WorkerTensorPayload): readonly number[] {
  const bytesPerValue = tensor.dtype === 'bool' ? 1 : 4
  if (tensor.data.byteLength !== tensor.length * bytesPerValue) {
    throw new OnnxTraceAdapterError(
      `${tensor.id} Buffer 为 ${tensor.data.byteLength} 字节，期望 ${tensor.length * bytesPerValue}。`,
    )
  }
  if (tensor.dtype === 'float32') return [...new Float32Array(tensor.data)]
  if (tensor.dtype === 'int32') return [...new Int32Array(tensor.data)]
  return [...new Uint8Array(tensor.data)]
}

function adaptTensor(tensor: WorkerTensorPayload): TensorSummary {
  return {
    id: tensor.id,
    role: tensor.role,
    name: tensor.name,
    dtype: tensor.dtype,
    shape: [...tensor.shape],
    values: tensorValues(tensor),
    sampleMethod: tensor.sampleMethod,
    ...(tensor.min === undefined ? {} : { min: tensor.min }),
    ...(tensor.max === undefined ? {} : { max: tensor.max }),
    ...(tensor.mean === undefined ? {} : { mean: tensor.mean }),
  }
}

const operations = [
  ['tokenize', 'Tokenize', '把输入文本拆成模型实际使用的 Token。'],
  ['embedding', 'Embedding', '查找 Token 与位置向量。'],
  ['position-embedding', 'Position Embedding', '把 Token 与位置向量相加。'],
  ['layernorm', 'LayerNorm', '归一化当前 Transformer Block 的输入。'],
  ['qkv', 'Q / K / V', '生成多头注意力使用的查询、键和值。'],
  ['attention', 'Causal Attention', '应用因果遮罩并按权重汇总信息。'],
  ['residual-attention', 'Attention Residual', '把 Attention 投影结果加回当前 Block 输入。'],
  ['mlp-layernorm', 'MLP LayerNorm', '在前馈网络前再次归一化。'],
  ['mlp', 'Feed-Forward MLP', '扩维、GELU 激活并投影回隐藏维度。'],
  ['residual-mlp', 'MLP Residual', '把 MLP 输出加回残差主路。'],
  ['output', 'Output Projection', '经过剩余层后生成完整词表分数与概率。'],
] as const

function createEntities(
  payload: WorkerInferencePayload,
  model: Distilgpt2ModelSpec,
  selectedLayerIndex: number,
) {
  const entities: Record<string, TraceEntity> = {}
  payload.input.tokens.forEach((token, tokenIndex) => {
    const id = `token:${tokenIndex}`
    entities[id] = {
      id,
      kind: 'token',
      label: token.trim() || `空白 Token ${tokenIndex + 1}`,
      description: `真实 Token ID ${payload.input.tokenIds[tokenIndex]}。`,
      tokenIndex,
    }
  })
  for (const [idSuffix, label, description] of operations) {
    const id = `operation:${idSuffix}`
    entities[id] = { id, kind: 'operation', label, description, layerIndex: selectedLayerIndex }
  }
  for (let headIndex = 0; headIndex < model.heads; headIndex += 1) {
    const id = `head:${headIndex}`
    entities[id] = {
      id,
      kind: 'attention-head',
      label: `Head ${headIndex + 1}`,
      parentId: 'operation:attention',
      layerIndex: selectedLayerIndex,
      headIndex,
    }
  }
  const outputId = `output-token:${payload.output.sampledTokenId}`
  entities[outputId] = {
    id: outputId,
    kind: 'output-token',
    label: payload.output.sampledToken.trim() || `Token ${payload.output.sampledTokenId}`,
    description: '按当前采样参数从真实模型词表中选出的下一个 Token。',
  }
  return entities
}

interface StepDefinition {
  readonly id: string
  readonly phase: TracePhase
  readonly operation: TraceOperation
  readonly title: string
  readonly description: string
  readonly entityIds: readonly string[]
  readonly inputs: readonly string[]
  readonly outputs: readonly string[]
}

function createSteps(
  payload: WorkerInferencePayload,
  model: Distilgpt2ModelSpec,
  selectedLayerIndex: number,
): readonly TraceStep[] {
  const tokenIds = payload.input.tokens.map((_, index) => `token:${index}`)
  const headIds = Array.from({ length: model.heads }, (_, index) => `head:${index}`)
  const layer = selectedLayerIndex + 1
  const definitions: readonly StepDefinition[] = [
    { id: 'tokenize', phase: 'token', operation: 'tokenize', title: '真实分词', description: 'GPT-2 Byte-level BPE 把输入转为实际 Token ID。', entityIds: ['operation:tokenize', ...tokenIds], inputs: [], outputs: ['tensor:token-ids'] },
    { id: 'embedding', phase: 'embedding', operation: 'embed', title: '查找 Token 向量', description: '从真实词嵌入矩阵读取每个 Token 的 768 维向量。', entityIds: ['operation:embedding', ...tokenIds], inputs: ['tensor:token-ids'], outputs: ['tensor:token-embedding'] },
    { id: 'position-embedding', phase: 'embedding', operation: 'add-position-embedding', title: '加入位置向量', description: '真实 Token 与学习到的位置向量逐项相加。', entityIds: ['operation:position-embedding', ...tokenIds], inputs: ['tensor:token-embedding', 'tensor:position-embedding'], outputs: ['tensor:embedding'] },
    { id: 'layernorm', phase: 'embedding', operation: 'layer-normalize', title: `归一化第 ${layer} 层输入`, description: `展示 DistilGPT-2 第 ${layer} 个 Block 的真实输入与第一层 LayerNorm 输出。`, entityIds: ['operation:layernorm', ...tokenIds], inputs: ['tensor:block-input'], outputs: ['tensor:normalized'] },
    { id: 'qkv', phase: 'attention', operation: 'project-qkv', title: '生成 Q、K、V', description: `读取第 ${layer} 层全部 ${model.heads} 个 Head 的真实 Q/K/V。`, entityIds: ['operation:qkv', ...headIds], inputs: ['tensor:normalized'], outputs: ['tensor:q', 'tensor:k', 'tensor:v'] },
    { id: 'causal-mask', phase: 'attention', operation: 'apply-causal-mask', title: '应用因果遮罩', description: '每个位置只能关注自己和已经出现的 Token。', entityIds: ['operation:attention', ...headIds], inputs: ['tensor:q', 'tensor:k', 'tensor:causal-mask'], outputs: ['tensor:attention-weights'] },
    { id: 'attention-output', phase: 'attention', operation: 'weighted-sum', title: '汇总并投影 Attention', description: '保留各 Head 输出、多头拼接结果和 c_proj 投影后的真实输出。', entityIds: ['operation:attention', ...headIds], inputs: ['tensor:attention-weights', 'tensor:v'], outputs: ['tensor:attention-head-output', 'tensor:attention-concatenated', 'tensor:attention-output'] },
    { id: 'attention-residual', phase: 'feed-forward', operation: 'add-attention-residual', title: 'Attention 残差相加', description: '把 c_proj 投影结果加回当前 Block 输入。', entityIds: ['operation:residual-attention'], inputs: ['tensor:block-input', 'tensor:attention-output'], outputs: ['tensor:attention-residual'] },
    { id: 'mlp-layernorm', phase: 'feed-forward', operation: 'normalize-feed-forward', title: '进入 MLP 前归一化', description: '读取第二个学习型 LayerNorm 的真实输出。', entityIds: ['operation:mlp-layernorm'], inputs: ['tensor:attention-residual'], outputs: ['tensor:feed-forward-normalized'] },
    { id: 'mlp', phase: 'feed-forward', operation: 'feed-forward', title: '运行真实 MLP', description: '把隐藏向量扩展四倍、经过 GELU，再投影回 768 维。', entityIds: ['operation:mlp'], inputs: ['tensor:feed-forward-normalized'], outputs: ['tensor:mlp-expanded', 'tensor:mlp-activated', 'tensor:mlp-output'] },
    { id: 'mlp-residual', phase: 'feed-forward', operation: 'add-mlp-residual', title: '形成 Block 输出', description: 'MLP 输出与 Attention 残差相加，得到所选 Block 的真实输出。', entityIds: ['operation:residual-mlp'], inputs: ['tensor:attention-residual', 'tensor:mlp-output'], outputs: ['tensor:block-output'] },
    { id: 'logits', phase: 'output', operation: 'project-logits', title: '生成完整词表分数', description: '所选层之后的 Block 与最终归一化继续运行，再生成 50,257 个真实 Logit。', entityIds: ['operation:output'], inputs: ['tensor:block-output'], outputs: ['tensor:logits'] },
    { id: 'softmax', phase: 'output', operation: 'softmax', title: '把分数变成概率', description: 'Softmax 把最后位置的完整词表分数转换为概率。', entityIds: ['operation:output'], inputs: ['tensor:logits'], outputs: ['tensor:probabilities'] },
    { id: 'sample', phase: 'output', operation: 'sample-token', title: '选出下一个 Token', description: '按 Temperature、Top-k、Top-p 与 Seed 可复现地采样。', entityIds: ['operation:output', `output-token:${payload.output.sampledTokenId}`], inputs: ['tensor:probabilities'], outputs: [] },
  ]
  const durationMs = Math.max(1, Math.round(payload.inferenceMilliseconds / definitions.length))
  return definitions.map((step) => ({
    id: `step:${step.id}`,
    phase: step.phase,
    operation: step.operation,
    title: step.title,
    description: step.description,
    entityIds: step.entityIds,
    inputTensorIds: step.inputs,
    outputTensorIds: step.outputs,
    durationMs,
  }))
}

export function adaptOnnxInferenceToModelTrace(
  payload: WorkerInferencePayload,
  request: RunInferencePayload,
  model: Distilgpt2ModelSpec = DISTILGPT2_MODEL_SPEC,
): ModelTrace {
  if (payload.modelId !== model.id) {
    throw new OnnxTraceAdapterError(`Worker 返回模型 ${payload.modelId}，期望 ${model.id}。`)
  }
  if (payload.input.text !== request.text) {
    throw new OnnxTraceAdapterError('Worker 返回的输入文本与请求不一致。')
  }
  const tensors = Object.fromEntries(payload.tensors.map((tensor) => [tensor.id, adaptTensor(tensor)]))
  const trace: ModelTrace = {
    schemaVersion: TRACE_SCHEMA_VERSION,
    source: 'onnx',
    metadata: {
      id: `${model.id}-layer-${request.selectedLayerIndex + 1}`,
      title: `${model.displayName} 第 ${request.selectedLayerIndex + 1} 层真实轨迹`,
      description: `由浏览器 ${payload.executionProvider.toUpperCase()} 推理生成，耗时 ${payload.inferenceMilliseconds.toFixed(1)}ms。`,
      locale: 'zh-CN',
    },
    model: {
      id: model.id,
      displayName: model.displayName,
      layers: model.layers,
      heads: model.heads,
      hiddenSize: model.hiddenSize,
      vocabularySize: model.vocabularySize,
    },
    input: {
      text: payload.input.text,
      tokenIds: [...payload.input.tokenIds],
      tokens: [...payload.input.tokens],
    },
    entities: createEntities(payload, model, request.selectedLayerIndex),
    tensors,
    steps: createSteps(payload, model, request.selectedLayerIndex),
    output: {
      logitsTensorId: 'tensor:logits',
      probabilitiesTensorId: 'tensor:probabilities',
      sampledTokenId: payload.output.sampledTokenId,
      sampledToken: payload.output.sampledToken,
      defaultSampling: request.sampling,
      candidates: payload.output.candidates,
    },
  }
  validateModelTrace(trace)
  return trace
}

export class OnnxTraceAdapter implements TraceAdapter {
  private readonly client: OnnxInferenceClient
  private readonly request: RunInferencePayload
  private readonly model: Distilgpt2ModelSpec

  constructor(
    client: OnnxInferenceClient,
    request: RunInferencePayload,
    model: Distilgpt2ModelSpec = DISTILGPT2_MODEL_SPEC,
  ) {
    this.client = client
    this.request = request
    this.model = model
  }

  async load(options: TraceLoadOptions = {}): Promise<ModelTrace> {
    if (options.signal?.aborted) {
      throw new DOMException('真实模型轨迹加载已取消。', 'AbortError')
    }
    const payload = await this.client.runInference(this.request, { signal: options.signal })
    if (options.signal?.aborted) {
      throw new DOMException('真实模型轨迹加载已取消。', 'AbortError')
    }
    return adaptOnnxInferenceToModelTrace(payload, this.request, this.model)
  }
}
