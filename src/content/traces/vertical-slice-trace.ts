import {
  TRACE_SCHEMA_VERSION,
  type ModelTrace,
  type TensorSummary,
  type TraceEntity,
} from '../../domain/trace/trace'
import { softmaxLogits } from '../../domain/sampling/sampling'

const tokens = ['The', ' sky', ' is', ' deep', ' and', ' blue'] as const
const tokenIds = [4, 7, 2, 9, 5, 11] as const

function deterministicValues(length: number, phase: number) {
  return Array.from({ length }, (_, index) =>
    Number((Math.sin((index + 1) * phase) * 0.42).toFixed(4)),
  )
}

function sinusoidalPositionValues(tokenCount: number, hiddenSize: number) {
  return Array.from({ length: tokenCount * hiddenSize }, (_, index) => {
    const position = Math.floor(index / hiddenSize)
    const dimension = index % hiddenSize
    const frequency = 10_000 ** ((2 * Math.floor(dimension / 2)) / hiddenSize)
    const value = dimension % 2 === 0
      ? Math.sin(position / frequency)
      : Math.cos(position / frequency)
    return Number((value * 0.28).toFixed(4))
  })
}

function addVectors(left: readonly number[], right: readonly number[]) {
  return left.map((value, index) => Number((value + (right[index] ?? 0)).toFixed(4)))
}

function layerNormalize(values: readonly number[], tokenCount: number, hiddenSize: number) {
  return Array.from({ length: tokenCount }, (_, tokenIndex) => {
    const start = tokenIndex * hiddenSize
    const sample = values.slice(start, start + hiddenSize)
    const mean = sample.reduce((sum, value) => sum + value, 0) / hiddenSize
    const variance = sample.reduce(
      (sum, value) => sum + (value - mean) ** 2,
      0,
    ) / hiddenSize
    const scale = Math.sqrt(variance + 1e-5)
    return sample.map((value) => Number(((value - mean) / scale).toFixed(4)))
  }).flat()
}

function concatenateHeadOutputs(
  values: readonly number[],
  headCount: number,
  tokenCount: number,
  headSize: number,
) {
  return Array.from({ length: tokenCount }, (_, tokenIndex) =>
    Array.from({ length: headCount }, (_, headIndex) => {
      const start = (headIndex * tokenCount + tokenIndex) * headSize
      return values.slice(start, start + headSize)
    }).flat(),
  ).flat()
}

function projectTokenVectors(
  values: readonly number[],
  tokenCount: number,
  inputSize: number,
  outputSize: number,
  phase: number,
) {
  return Array.from({ length: tokenCount }, (_, tokenIndex) =>
    Array.from({ length: outputSize }, (_, outputIndex) => {
      const offset = tokenIndex * inputSize
      const projected = Array.from({ length: inputSize }, (_, inputIndex) => {
        const weight = Math.sin((inputIndex + 1) * (outputIndex + 1) * phase) * 0.17
        return (values[offset + inputIndex] ?? 0) * weight
      }).reduce((sum, value) => sum + value, 0)
      return Number(projected.toFixed(4))
    }),
  ).flat()
}

function gelu(values: readonly number[]) {
  return values.map((value) => {
    const curved = Math.sqrt(2 / Math.PI) * (value + 0.044715 * value ** 3)
    return Number((0.5 * value * (1 + Math.tanh(curved))).toFixed(4))
  })
}

function tensorStats(values: readonly number[]) {
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)),
  }
}

function tensor(
  value: Omit<TensorSummary, 'sampleMethod'> & {
    readonly sampleMethod?: TensorSummary['sampleMethod']
  },
): TensorSummary {
  return { ...value, sampleMethod: value.sampleMethod ?? 'full' }
}

const tokenEmbeddingValues = deterministicValues(tokens.length * 8, 0.73)
const positionEmbeddingValues = sinusoidalPositionValues(tokens.length, 8)
const hiddenInputValues = addVectors(tokenEmbeddingValues, positionEmbeddingValues)
const normalizedValues = layerNormalize(hiddenInputValues, tokens.length, 8)

const tokenEntities = Object.fromEntries(
  tokens.map((token, index) => {
    const id = `token:${index}`
    const entity: TraceEntity = {
      id,
      kind: 'token',
      label: token.trim(),
      description: `输入序列中的第 ${index + 1} 个 Token。`,
      tokenIndex: index,
    }
    return [id, entity]
  }),
)

const causalMask = Array.from({ length: tokens.length ** 2 }, (_, index) => {
  const row = Math.floor(index / tokens.length)
  const column = index % tokens.length
  return column <= row ? 1 : 0
})

const head0 = [
  [1, 0, 0, 0, 0, 0],
  [0.42, 0.58, 0, 0, 0, 0],
  [0.2, 0.35, 0.45, 0, 0, 0],
  [0.12, 0.23, 0.27, 0.38, 0, 0],
  [0.08, 0.15, 0.18, 0.24, 0.35, 0],
  [0.05, 0.09, 0.13, 0.18, 0.22, 0.33],
]
const head1 = [
  [1, 0, 0, 0, 0, 0],
  [0.65, 0.35, 0, 0, 0, 0],
  [0.15, 0.55, 0.3, 0, 0, 0],
  [0.1, 0.15, 0.55, 0.2, 0, 0],
  [0.05, 0.1, 0.15, 0.5, 0.2, 0],
  [0.04, 0.08, 0.12, 0.16, 0.42, 0.18],
]
const attentionHeadOutputValues = deterministicValues(48, 1.61)
const attentionOutputValues = concatenateHeadOutputs(
  attentionHeadOutputValues,
  2,
  tokens.length,
  4,
)
const attentionResidualValues = addVectors(hiddenInputValues, attentionOutputValues)
const feedForwardNormalizedValues = layerNormalize(
  attentionResidualValues,
  tokens.length,
  8,
)
const mlpExpandedValues = projectTokenVectors(
  feedForwardNormalizedValues,
  tokens.length,
  8,
  32,
  0.37,
)
const mlpActivatedValues = gelu(mlpExpandedValues)
const mlpOutputValues = projectTokenVectors(
  mlpActivatedValues,
  tokens.length,
  32,
  8,
  0.19,
)
const blockOutputValues = addVectors(attentionResidualValues, mlpOutputValues)

const vocabulary = [
  ' a',
  ' bright',
  ' is',
  ' very',
  'The',
  ' and',
  ' calm',
  ' sky',
  ' blue',
  ' above',
  ' today',
  ' horizon',
  '.',
  ',',
  ' night',
  '!',
] as const
const logits = [
  -1.2, -1.1, -0.75, -0.7, -0.48, -0.31, -0.12, -0.08, 0.11, 0.38,
  0.62, 0.96, 1.21, 0.81, -0.05, -0.26,
] as const
const probabilities = softmaxLogits(logits)
const outputEntities = Object.fromEntries(
  vocabulary.map((token, tokenId) => {
    const id = `output-token:${tokenId}`
    const entity: TraceEntity = {
      id,
      kind: 'output-token',
      label: token.trim(),
      description: `教学词表中的候选 Token，ID 为 ${tokenId}。`,
    }
    return [id, entity]
  }),
)

export const verticalSliceTrace = {
  schemaVersion: TRACE_SCHEMA_VERSION,
  source: 'preset',
  metadata: {
    id: 'preset:blue-sky-v1',
    title: '蓝色天空：一次微型预测',
    description: '使用教学小模型展示 Token、Attention 与下一个 Token。',
    locale: 'zh-CN',
  },
  model: {
    id: 'layerscape:micro-transformer-v1',
    displayName: 'LayerScape Micro Transformer',
    layers: 1,
    heads: 2,
    hiddenSize: 8,
    vocabularySize: 16,
  },
  input: {
    text: 'The sky is deep and blue',
    tokenIds,
    tokens,
  },
  entities: {
    ...tokenEntities,
    ...outputEntities,
    'operation:tokenize': {
      id: 'operation:tokenize',
      kind: 'operation',
      label: 'Tokenization',
      description: '把文本切分为 Token 并映射到数字 ID。',
    },
    'operation:embedding': {
      id: 'operation:embedding',
      kind: 'operation',
      label: 'Token Embedding',
      description: '为每个 Token 查找一组隐藏向量。',
    },
    'operation:position-embedding': {
      id: 'operation:position-embedding',
      kind: 'operation',
      label: 'Position Embedding',
      description: '把每个 Token 的顺序信息逐项加入 Token 向量。',
    },
    'operation:layernorm': {
      id: 'operation:layernorm',
      kind: 'operation',
      label: 'LayerNorm',
      description: '把每个 Token 的数值分布调整到稳定尺度。',
    },
    'operation:qkv': {
      id: 'operation:qkv',
      kind: 'operation',
      label: 'Q/K/V Projection',
      description: '把隐藏向量投影为查询、索引和内容。',
    },
    'operation:attention': {
      id: 'operation:attention',
      kind: 'operation',
      label: 'Masked Self-Attention',
      description: '在因果约束下计算 Token 之间的信息权重。',
    },
    'head:0': {
      id: 'head:0',
      kind: 'attention-head',
      label: 'Attention Head 1',
      description: '在四维子空间中形成第一组因果注意力分布。',
      parentId: 'operation:attention',
      layerIndex: 0,
      headIndex: 0,
    },
    'head:1': {
      id: 'head:1',
      kind: 'attention-head',
      label: 'Attention Head 2',
      description: '在另一组四维子空间中形成可对比的注意力分布。',
      parentId: 'operation:attention',
      layerIndex: 0,
      headIndex: 1,
    },
    'operation:residual-attention': {
      id: 'operation:residual-attention',
      kind: 'operation',
      label: 'Attention Residual',
      description: '把 Attention 输出加回进入子层前的隐藏向量。',
    },
    'operation:mlp-layernorm': {
      id: 'operation:mlp-layernorm',
      kind: 'operation',
      label: 'MLP LayerNorm',
      description: '在进入前馈网络前稳定每个 Token 的隐藏向量。',
    },
    'operation:mlp': {
      id: 'operation:mlp',
      kind: 'operation',
      label: 'Feed-Forward MLP',
      description: '把八维隐藏向量扩展到三十二维、激活后再投影回八维。',
    },
    'operation:residual-mlp': {
      id: 'operation:residual-mlp',
      kind: 'operation',
      label: 'MLP Residual',
      description: '把 MLP 结果加回残差主路，形成 Transformer Block 输出。',
    },
    'operation:output': {
      id: 'operation:output',
      kind: 'operation',
      label: 'Output Projection',
      description: '把隐藏状态投影为词表分数并转换为概率。',
    },
  },
  tensors: {
    'tensor:token-ids': tensor({
      id: 'tensor:token-ids',
      role: 'token-ids',
      name: 'input_ids',
      dtype: 'int32',
      shape: [1, 6],
      values: tokenIds,
      min: 2,
      max: 11,
      mean: 6.33,
    }),
    'tensor:token-embedding': tensor({
      id: 'tensor:token-embedding',
      role: 'token-embedding',
      name: 'token_embedding',
      dtype: 'float32',
      shape: [1, 6, 8],
      values: tokenEmbeddingValues,
      ...tensorStats(tokenEmbeddingValues),
    }),
    'tensor:position-embedding': tensor({
      id: 'tensor:position-embedding',
      role: 'position-embedding',
      name: 'position_embedding',
      dtype: 'float32',
      shape: [1, 6, 8],
      values: positionEmbeddingValues,
      ...tensorStats(positionEmbeddingValues),
    }),
    'tensor:embedding': tensor({
      id: 'tensor:embedding',
      role: 'embedding',
      name: 'hidden_input',
      dtype: 'float32',
      shape: [1, 6, 8],
      values: hiddenInputValues,
      ...tensorStats(hiddenInputValues),
    }),
    'tensor:block-input': tensor({
      id: 'tensor:block-input',
      role: 'block-input',
      name: 'block_input',
      dtype: 'float32',
      shape: [1, 6, 8],
      values: hiddenInputValues,
      ...tensorStats(hiddenInputValues),
    }),
    'tensor:normalized': tensor({
      id: 'tensor:normalized',
      role: 'normalized',
      name: 'normalized_hidden',
      dtype: 'float32',
      shape: [1, 6, 8],
      values: normalizedValues,
      ...tensorStats(normalizedValues),
    }),
    'tensor:q': tensor({
      id: 'tensor:q',
      role: 'query',
      name: 'query',
      dtype: 'float32',
      shape: [1, 2, 6, 4],
      values: deterministicValues(48, 0.91),
    }),
    'tensor:k': tensor({
      id: 'tensor:k',
      role: 'key',
      name: 'key',
      dtype: 'float32',
      shape: [1, 2, 6, 4],
      values: deterministicValues(48, 1.13),
    }),
    'tensor:v': tensor({
      id: 'tensor:v',
      role: 'value',
      name: 'value',
      dtype: 'float32',
      shape: [1, 2, 6, 4],
      values: deterministicValues(48, 1.37),
    }),
    'tensor:causal-mask': tensor({
      id: 'tensor:causal-mask',
      role: 'attention-mask',
      name: 'causal_mask',
      dtype: 'bool',
      shape: [6, 6],
      values: causalMask,
      min: 0,
      max: 1,
      mean: 0.5833,
    }),
    'tensor:attention-weights': tensor({
      id: 'tensor:attention-weights',
      role: 'attention-weights',
      name: 'attention_weights',
      dtype: 'float32',
      shape: [1, 2, 6, 6],
      values: [...head0.flat(), ...head1.flat()],
      min: 0,
      max: 1,
      mean: 0.1667,
    }),
    'tensor:attention-head-output': tensor({
      id: 'tensor:attention-head-output',
      role: 'attention-head-output',
      name: 'head_output',
      dtype: 'float32',
      shape: [1, 2, 6, 4],
      values: attentionHeadOutputValues,
    }),
    'tensor:attention-output': tensor({
      id: 'tensor:attention-output',
      role: 'attention-output',
      name: 'attention_output',
      dtype: 'float32',
      shape: [1, 6, 8],
      values: attentionOutputValues,
    }),
    'tensor:attention-concatenated': tensor({
      id: 'tensor:attention-concatenated',
      role: 'attention-concatenated',
      name: 'attention_concatenated',
      dtype: 'float32',
      shape: [1, 6, 8],
      values: attentionOutputValues,
    }),
    'tensor:attention-residual': tensor({
      id: 'tensor:attention-residual',
      role: 'attention-residual',
      name: 'attention_residual',
      dtype: 'float32',
      shape: [1, 6, 8],
      values: attentionResidualValues,
      ...tensorStats(attentionResidualValues),
    }),
    'tensor:feed-forward-normalized': tensor({
      id: 'tensor:feed-forward-normalized',
      role: 'feed-forward-normalized',
      name: 'mlp_normalized',
      dtype: 'float32',
      shape: [1, 6, 8],
      values: feedForwardNormalizedValues,
      ...tensorStats(feedForwardNormalizedValues),
    }),
    'tensor:mlp-expanded': tensor({
      id: 'tensor:mlp-expanded',
      role: 'mlp-expanded',
      name: 'mlp_expanded',
      dtype: 'float32',
      shape: [1, 6, 32],
      values: mlpExpandedValues,
      ...tensorStats(mlpExpandedValues),
    }),
    'tensor:mlp-activated': tensor({
      id: 'tensor:mlp-activated',
      role: 'mlp-activated',
      name: 'mlp_gelu',
      dtype: 'float32',
      shape: [1, 6, 32],
      values: mlpActivatedValues,
      ...tensorStats(mlpActivatedValues),
    }),
    'tensor:mlp-output': tensor({
      id: 'tensor:mlp-output',
      role: 'mlp-output',
      name: 'mlp_output',
      dtype: 'float32',
      shape: [1, 6, 8],
      values: mlpOutputValues,
      ...tensorStats(mlpOutputValues),
    }),
    'tensor:block-output': tensor({
      id: 'tensor:block-output',
      role: 'block-output',
      name: 'block_output',
      dtype: 'float32',
      shape: [1, 6, 8],
      values: blockOutputValues,
      ...tensorStats(blockOutputValues),
    }),
    'tensor:logits': tensor({
      id: 'tensor:logits',
      role: 'logits',
      name: 'logits',
      dtype: 'float32',
      shape: [1, 16],
      values: logits,
      min: -1.2,
      max: 1.21,
      mean: -0.06,
    }),
    'tensor:probabilities': tensor({
      id: 'tensor:probabilities',
      role: 'probabilities',
      name: 'probabilities',
      dtype: 'float32',
      shape: [1, 16],
      values: probabilities,
      min: Math.min(...probabilities),
      max: Math.max(...probabilities),
      mean: 0.0625,
    }),
  },
  steps: [
    {
      id: 'step:tokenize',
      phase: 'token',
      operation: 'tokenize',
      title: '把句子切成 Token',
      description: '文本被拆成六个可编号的 Token。',
      entityIds: ['operation:tokenize', ...tokens.map((_, index) => `token:${index}`)],
      inputTensorIds: [],
      outputTensorIds: ['tensor:token-ids'],
      durationMs: 900,
    },
    {
      id: 'step:embedding',
      phase: 'embedding',
      operation: 'embed',
      title: '查找 Token 向量',
      description: '每个 Token ID 被映射成八维隐藏向量。',
      entityIds: ['operation:embedding', ...tokens.map((_, index) => `token:${index}`)],
      inputTensorIds: ['tensor:token-ids'],
      outputTensorIds: ['tensor:token-embedding'],
      durationMs: 900,
    },
    {
      id: 'step:position-embedding',
      phase: 'embedding',
      operation: 'add-position-embedding',
      title: '加入 Token 的位置信息',
      description: '位置向量与 Token 向量逐项相加，让模型区分相同 Token 的先后顺序。',
      entityIds: [
        'operation:position-embedding',
        ...tokens.map((_, index) => `token:${index}`),
      ],
      inputTensorIds: ['tensor:token-embedding', 'tensor:position-embedding'],
      outputTensorIds: ['tensor:embedding'],
      durationMs: 1100,
    },
    {
      id: 'step:layernorm',
      phase: 'embedding',
      operation: 'layer-normalize',
      title: '稳定每个 Token 的数值尺度',
      description: 'LayerNorm 分别把每个 Token 调整为接近零均值和单位方差。',
      entityIds: ['operation:layernorm', ...tokens.map((_, index) => `token:${index}`)],
      inputTensorIds: ['tensor:embedding'],
      outputTensorIds: ['tensor:normalized'],
      durationMs: 1000,
    },
    {
      id: 'step:qkv',
      phase: 'attention',
      operation: 'project-qkv',
      title: '生成 Q、K、V',
      description: '同一组隐藏向量被投影成查询、索引和内容。',
      entityIds: ['operation:qkv', 'head:0', 'head:1'],
      inputTensorIds: ['tensor:normalized'],
      outputTensorIds: ['tensor:q', 'tensor:k', 'tensor:v'],
      durationMs: 1100,
    },
    {
      id: 'step:causal-mask',
      phase: 'attention',
      operation: 'apply-causal-mask',
      title: '遮住未来 Token',
      description: '当前位置只能读取自己和已经出现的 Token。',
      entityIds: ['operation:attention', 'head:0', 'head:1'],
      inputTensorIds: ['tensor:q', 'tensor:k', 'tensor:causal-mask'],
      outputTensorIds: ['tensor:attention-weights'],
      durationMs: 1200,
    },
    {
      id: 'step:attention-output',
      phase: 'attention',
      operation: 'weighted-sum',
      title: '按权重收集信息',
      description: 'Attention 权重决定每个 Token 从过去位置取回多少内容。',
      entityIds: ['operation:attention', 'head:0', 'head:1'],
      inputTensorIds: ['tensor:attention-weights', 'tensor:v'],
      outputTensorIds: ['tensor:attention-head-output', 'tensor:attention-output'],
      durationMs: 1200,
    },
    {
      id: 'step:attention-residual',
      phase: 'feed-forward',
      operation: 'add-attention-residual',
      title: '把 Attention 结果送回主路',
      description: 'Attention 输出与进入子层前的隐藏向量逐项相加，保留原始信息。',
      entityIds: ['operation:residual-attention'],
      inputTensorIds: ['tensor:embedding', 'tensor:attention-output'],
      outputTensorIds: ['tensor:attention-residual'],
      durationMs: 1000,
    },
    {
      id: 'step:mlp-layernorm',
      phase: 'feed-forward',
      operation: 'normalize-feed-forward',
      title: '进入 MLP 前再次归一化',
      description: '第二次 LayerNorm 位于残差相加之后、前馈网络之前。',
      entityIds: ['operation:mlp-layernorm'],
      inputTensorIds: ['tensor:attention-residual'],
      outputTensorIds: ['tensor:feed-forward-normalized'],
      durationMs: 900,
    },
    {
      id: 'step:mlp',
      phase: 'feed-forward',
      operation: 'feed-forward',
      title: '先扩维，再筛选信息',
      description: 'MLP 把每个 Token 从八维扩展到三十二维，经过 GELU 后再压回八维。',
      entityIds: ['operation:mlp'],
      inputTensorIds: ['tensor:feed-forward-normalized'],
      outputTensorIds: ['tensor:mlp-expanded', 'tensor:mlp-activated', 'tensor:mlp-output'],
      durationMs: 1200,
    },
    {
      id: 'step:mlp-residual',
      phase: 'feed-forward',
      operation: 'add-mlp-residual',
      title: '把 MLP 结果加回主路',
      description: '前馈结果与 Attention 残差逐项相加，得到完整 Block 输出。',
      entityIds: ['operation:residual-mlp'],
      inputTensorIds: ['tensor:attention-residual', 'tensor:mlp-output'],
      outputTensorIds: ['tensor:block-output'],
      durationMs: 1000,
    },
    {
      id: 'step:logits',
      phase: 'output',
      operation: 'project-logits',
      title: '生成词表分数',
      description: '最后一个位置的隐藏向量被投影为十六个候选分数。',
      entityIds: ['operation:output'],
      inputTensorIds: ['tensor:block-output'],
      outputTensorIds: ['tensor:logits'],
      durationMs: 900,
    },
    {
      id: 'step:softmax',
      phase: 'output',
      operation: 'softmax',
      title: '把分数变成概率',
      description: 'Softmax 把候选分数压缩为总和等于一的概率。',
      entityIds: ['operation:output'],
      inputTensorIds: ['tensor:logits'],
      outputTensorIds: ['tensor:probabilities'],
      durationMs: 900,
    },
    {
      id: 'step:sample',
      phase: 'output',
      operation: 'sample-token',
      title: '选出下一个 Token',
      description: '教学轨迹从候选概率中选择句号作为下一个 Token。',
      entityIds: ['operation:output', 'output-token:12'],
      inputTensorIds: ['tensor:probabilities'],
      outputTensorIds: [],
      durationMs: 1000,
    },
  ],
  output: {
    logitsTensorId: 'tensor:logits',
    probabilitiesTensorId: 'tensor:probabilities',
    sampledTokenId: 12,
    sampledToken: '.',
    defaultSampling: { temperature: 1, topK: 5, topP: 0.9, seed: 7 },
    candidates: vocabulary.map((token, tokenId) => ({
      tokenId,
      token,
      logit: logits[tokenId]!,
      probability: probabilities[tokenId]!,
    })),
  },
} satisfies ModelTrace
