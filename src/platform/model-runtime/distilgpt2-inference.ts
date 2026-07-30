import {
  runSamplingExperiment,
  softmaxLogits,
  type SamplingParameters,
} from '../../domain/sampling/sampling'
import type { TensorDType, TensorRole, TraceCandidate } from '../../domain/trace/trace'
import {
  createWorkerTensorPayload,
  type WorkerInferencePayload,
  type WorkerTensorPayload,
} from './worker-protocol'

export interface Distilgpt2ModelSpec {
  readonly id: string
  readonly displayName: string
  readonly layers: number
  readonly heads: number
  readonly hiddenSize: number
  readonly vocabularySize: number
}

export const DISTILGPT2_MODEL_SPEC: Distilgpt2ModelSpec = {
  id: 'distilgpt2',
  displayName: 'DistilGPT-2',
  layers: 6,
  heads: 12,
  hiddenSize: 768,
  vocabularySize: 50_257,
}

export interface RuntimeInferenceTensor {
  readonly dims: readonly number[]
  readonly data: unknown
}

export interface RuntimeTokenizedInput {
  readonly tokenIds: readonly number[]
  readonly tokens: readonly string[]
}

export interface RuntimeInferenceTokenizer {
  tokenize(text: string): RuntimeTokenizedInput
  decodeToken(tokenId: number): string
}

interface SemanticTensorDefinition {
  readonly id: string
  readonly role: TensorRole
  readonly name: string
  readonly dtype?: TensorDType
  readonly shape: readonly number[]
  readonly values: Float32Array<ArrayBuffer> | Int32Array<ArrayBuffer> | Uint8Array<ArrayBuffer>
}

function product(shape: readonly number[]) {
  return shape.reduce((result, value) => result * value, 1)
}

function sameShape(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function readFloatOutput(
  outputs: Readonly<Record<string, RuntimeInferenceTensor>>,
  name: string,
  expectedShape: readonly number[],
): Float32Array<ArrayBuffer> {
  const tensor = outputs[name]
  if (!tensor) throw new Error(`真实模型缺少输出 ${name}。`)
  if (!sameShape(tensor.dims, expectedShape)) {
    throw new Error(`${name} Shape 为 [${tensor.dims.join(', ')}]，期望 [${expectedShape.join(', ')}]。`)
  }
  if (!(tensor.data instanceof Float32Array) || tensor.data.length !== product(expectedShape)) {
    throw new Error(`${name} 必须是完整 Float32 Tensor。`)
  }
  return Float32Array.from(tensor.data)
}

function summarize(values: ArrayLike<number>) {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let total = 0
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index])
    min = Math.min(min, value)
    max = Math.max(max, value)
    total += value
  }
  return {
    min: values.length > 0 ? min : undefined,
    max: values.length > 0 ? max : undefined,
    mean: values.length > 0 ? total / values.length : undefined,
  }
}

function semanticTensor(definition: SemanticTensorDefinition): WorkerTensorPayload {
  return createWorkerTensorPayload({
    id: definition.id,
    role: definition.role,
    name: definition.name,
    dtype: definition.dtype ?? 'float32',
    shape: definition.shape,
    sampleMethod: 'full',
    ...summarize(definition.values),
  }, definition.values)
}

function concatenateHeads(
  values: Float32Array<ArrayBuffer>,
  tokenCount: number,
  heads: number,
  headSize: number,
) {
  const result = new Float32Array(tokenCount * heads * headSize)
  for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex += 1) {
    for (let headIndex = 0; headIndex < heads; headIndex += 1) {
      for (let dimension = 0; dimension < headSize; dimension += 1) {
        const sourceIndex = (headIndex * tokenCount + tokenIndex) * headSize + dimension
        const targetIndex = tokenIndex * heads * headSize + headIndex * headSize + dimension
        result[targetIndex] = values[sourceIndex] ?? 0
      }
    }
  }
  return result
}

function causalMask(tokenCount: number) {
  return Uint8Array.from({ length: tokenCount * tokenCount }, (_, index) => {
    const row = Math.floor(index / tokenCount)
    return index % tokenCount <= row ? 1 : 0
  })
}

function displayToken(tokenizer: RuntimeInferenceTokenizer, tokenId: number) {
  const decoded = tokenizer.decodeToken(tokenId)
  if (decoded.trim().length > 0) return decoded
  if (decoded.length === 0) return `[Token ${tokenId}]`
  const codePoints = [...decoded]
    .map((value) => `U+${value.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' ')
  return `[Whitespace ${codePoints}]`
}

export function createDistilgpt2InferencePayload(options: {
  readonly text: string
  readonly tokenized: RuntimeTokenizedInput
  readonly tokenizer: RuntimeInferenceTokenizer
  readonly outputs: Readonly<Record<string, RuntimeInferenceTensor>>
  readonly selectedLayerIndex: number
  readonly sampling: SamplingParameters
  readonly inferenceMilliseconds: number
  readonly model?: Distilgpt2ModelSpec
}): WorkerInferencePayload {
  const model = options.model ?? DISTILGPT2_MODEL_SPEC
  const tokenCount = options.tokenized.tokenIds.length
  const layerIndex = options.selectedLayerIndex
  if (tokenCount < 1 || tokenCount > 12) throw new Error('真实模型输入必须包含 1 到 12 个 Token。')
  if (options.tokenized.tokens.length !== tokenCount) throw new Error('Token 文本与 ID 数量不一致。')
  if (!Number.isInteger(layerIndex) || layerIndex < 0 || layerIndex >= model.layers) {
    throw new Error(`Layer ${layerIndex} 超出真实模型范围。`)
  }

  const hiddenShape = [1, tokenCount, model.hiddenSize]
  const headSize = model.hiddenSize / model.heads
  const headShape = [1, model.heads, tokenCount, headSize]
  const weightsShape = [1, model.heads, tokenCount, tokenCount]
  const intermediateShape = [1, tokenCount, model.hiddenSize * 4]
  const layerPrefix = `trace.layer.${layerIndex}`
  const blockInputName = layerIndex === 0
    ? 'trace.embedding.sum'
    : `trace.layer.${layerIndex - 1}.blockOutput`

  const tokenEmbedding = readFloatOutput(options.outputs, 'trace.embedding.token', hiddenShape)
  const positionEmbedding = readFloatOutput(options.outputs, 'trace.embedding.position', hiddenShape)
  const embedding = readFloatOutput(options.outputs, 'trace.embedding.sum', hiddenShape)
  const blockInput = readFloatOutput(options.outputs, blockInputName, hiddenShape)
  const normalized = readFloatOutput(options.outputs, `${layerPrefix}.layerNorm1`, hiddenShape)
  const query = readFloatOutput(options.outputs, `${layerPrefix}.query`, headShape)
  const key = readFloatOutput(options.outputs, `present.${layerIndex}.key`, headShape)
  const value = readFloatOutput(options.outputs, `present.${layerIndex}.value`, headShape)
  const attentionWeights = readFloatOutput(
    options.outputs, `${layerPrefix}.attentionWeights`, weightsShape,
  )
  const attentionHeadOutput = readFloatOutput(
    options.outputs, `${layerPrefix}.attentionHeadOutput`, headShape,
  )
  const attentionConcatenated = concatenateHeads(
    attentionHeadOutput, tokenCount, model.heads, headSize,
  )
  const attentionOutput = readFloatOutput(
    options.outputs, `${layerPrefix}.attentionProjected`, hiddenShape,
  )
  const attentionResidual = readFloatOutput(
    options.outputs, `${layerPrefix}.attentionResidual`, hiddenShape,
  )
  const feedForwardNormalized = readFloatOutput(
    options.outputs, `${layerPrefix}.layerNorm2`, hiddenShape,
  )
  const mlpExpanded = readFloatOutput(
    options.outputs, `${layerPrefix}.mlpHidden`, intermediateShape,
  )
  const mlpActivated = readFloatOutput(
    options.outputs, `${layerPrefix}.mlpActivated`, intermediateShape,
  )
  const mlpOutput = readFloatOutput(options.outputs, `${layerPrefix}.mlpProjected`, hiddenShape)
  const blockOutput = readFloatOutput(options.outputs, `${layerPrefix}.blockOutput`, hiddenShape)
  const fullLogits = readFloatOutput(
    options.outputs, 'logits', [1, tokenCount, model.vocabularySize],
  )
  const logits = fullLogits.slice((tokenCount - 1) * model.vocabularySize)
  const logitValues = [...logits]
  const probabilities = Float32Array.from(softmaxLogits(logitValues))
  const candidates: TraceCandidate[] = Array.from(
    { length: model.vocabularySize },
    (_, tokenId) => ({
      tokenId,
      token: displayToken(options.tokenizer, tokenId),
      logit: logitValues[tokenId] ?? 0,
      probability: probabilities[tokenId] ?? 0,
    }),
  )
  const sampledCandidate = runSamplingExperiment(candidates, options.sampling).sampledCandidate
  if (!sampledCandidate) throw new Error('真实模型未能选出下一个 Token。')

  const tensors = [
    semanticTensor({
      id: 'tensor:token-ids', role: 'token-ids', name: 'input_ids', dtype: 'int32',
      shape: [1, tokenCount], values: Int32Array.from(options.tokenized.tokenIds),
    }),
    semanticTensor({ id: 'tensor:token-embedding', role: 'token-embedding', name: 'token_embedding', shape: hiddenShape, values: tokenEmbedding }),
    semanticTensor({ id: 'tensor:position-embedding', role: 'position-embedding', name: 'position_embedding', shape: hiddenShape, values: positionEmbedding }),
    semanticTensor({ id: 'tensor:embedding', role: 'embedding', name: 'embedding_sum', shape: hiddenShape, values: embedding }),
    semanticTensor({ id: 'tensor:block-input', role: 'block-input', name: `layer_${layerIndex}_input`, shape: hiddenShape, values: blockInput }),
    semanticTensor({ id: 'tensor:normalized', role: 'normalized', name: `layer_${layerIndex}_normalized`, shape: hiddenShape, values: normalized }),
    semanticTensor({ id: 'tensor:q', role: 'query', name: `layer_${layerIndex}_query`, shape: headShape, values: query }),
    semanticTensor({ id: 'tensor:k', role: 'key', name: `layer_${layerIndex}_key`, shape: headShape, values: key }),
    semanticTensor({ id: 'tensor:v', role: 'value', name: `layer_${layerIndex}_value`, shape: headShape, values: value }),
    semanticTensor({ id: 'tensor:causal-mask', role: 'attention-mask', name: 'causal_mask', dtype: 'bool', shape: [tokenCount, tokenCount], values: causalMask(tokenCount) }),
    semanticTensor({ id: 'tensor:attention-weights', role: 'attention-weights', name: `layer_${layerIndex}_attention_weights`, shape: weightsShape, values: attentionWeights }),
    semanticTensor({ id: 'tensor:attention-head-output', role: 'attention-head-output', name: `layer_${layerIndex}_head_output`, shape: headShape, values: attentionHeadOutput }),
    semanticTensor({ id: 'tensor:attention-concatenated', role: 'attention-concatenated', name: `layer_${layerIndex}_attention_concatenated`, shape: hiddenShape, values: attentionConcatenated }),
    semanticTensor({ id: 'tensor:attention-output', role: 'attention-output', name: `layer_${layerIndex}_attention_projected`, shape: hiddenShape, values: attentionOutput }),
    semanticTensor({ id: 'tensor:attention-residual', role: 'attention-residual', name: `layer_${layerIndex}_attention_residual`, shape: hiddenShape, values: attentionResidual }),
    semanticTensor({ id: 'tensor:feed-forward-normalized', role: 'feed-forward-normalized', name: `layer_${layerIndex}_mlp_normalized`, shape: hiddenShape, values: feedForwardNormalized }),
    semanticTensor({ id: 'tensor:mlp-expanded', role: 'mlp-expanded', name: `layer_${layerIndex}_mlp_expanded`, shape: intermediateShape, values: mlpExpanded }),
    semanticTensor({ id: 'tensor:mlp-activated', role: 'mlp-activated', name: `layer_${layerIndex}_mlp_gelu`, shape: intermediateShape, values: mlpActivated }),
    semanticTensor({ id: 'tensor:mlp-output', role: 'mlp-output', name: `layer_${layerIndex}_mlp_output`, shape: hiddenShape, values: mlpOutput }),
    semanticTensor({ id: 'tensor:block-output', role: 'block-output', name: `layer_${layerIndex}_block_output`, shape: hiddenShape, values: blockOutput }),
    semanticTensor({ id: 'tensor:logits', role: 'logits', name: 'next_token_logits', shape: [1, model.vocabularySize], values: logits }),
    semanticTensor({ id: 'tensor:probabilities', role: 'probabilities', name: 'next_token_probabilities', shape: [1, model.vocabularySize], values: probabilities }),
  ]

  return {
    modelId: model.id,
    executionProvider: 'wasm',
    input: {
      text: options.text,
      tokenIds: [...options.tokenized.tokenIds],
      tokens: [...options.tokenized.tokens],
    },
    output: {
      sampledTokenId: sampledCandidate.tokenId,
      sampledToken: sampledCandidate.token,
      candidates,
    },
    tensors,
    inferenceMilliseconds: options.inferenceMilliseconds,
  }
}
