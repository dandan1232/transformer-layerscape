import type {
  ModelTrace,
  TensorRole,
  TensorSummary,
  TraceOperation,
  TraceStep,
} from '../../domain/trace/trace'

export type Trace2DStage = 'token' | 'embedding' | 'qkv' | 'attention' | 'output'

export type EmbeddingTensorRole = Extract<
  TensorRole,
  'token-embedding' | 'position-embedding' | 'embedding'
>

export interface AttentionCell {
  readonly row: number
  readonly column: number
  readonly value: number
  readonly masked: boolean
}

export function getTrace2DStage(operation: TraceOperation): Trace2DStage {
  if (operation === 'tokenize') return 'token'
  if (operation === 'embed' || operation === 'add-position-embedding') {
    return 'embedding'
  }
  if (operation === 'project-qkv') return 'qkv'
  if (operation === 'apply-causal-mask' || operation === 'weighted-sum') {
    return 'attention'
  }
  return 'output'
}

export function formatTensorShape(tensor: TensorSummary | null | undefined): string {
  return tensor ? `[${tensor.shape.join(', ')}]` : '—'
}

export function resolveStepTensors(trace: ModelTrace, step: TraceStep) {
  return {
    inputs: step.inputTensorIds.flatMap((id) => {
      const tensor = trace.tensors[id]
      return tensor ? [tensor] : []
    }),
    outputs: step.outputTensorIds.flatMap((id) => {
      const tensor = trace.tensors[id]
      return tensor ? [tensor] : []
    }),
  }
}

export function getAttentionCells(
  trace: ModelTrace,
  headIndex: number,
): readonly AttentionCell[] {
  const tensor = Object.values(trace.tensors).find(
    (candidate) => candidate.role === 'attention-weights',
  )
  const tokenCount = trace.input.tokens.length
  if (!tensor || headIndex < 0 || headIndex >= trace.model.heads) return []

  const cellsPerHead = tokenCount * tokenCount
  const offset = headIndex * cellsPerHead
  return Array.from({ length: cellsPerHead }, (_, index) => {
    const row = Math.floor(index / tokenCount)
    const column = index % tokenCount
    return {
      row,
      column,
      value: tensor.values[offset + index] ?? 0,
      masked: column > row,
    }
  })
}

export function getEmbeddingSample(
  trace: ModelTrace,
  tokenIndex: number,
  role: EmbeddingTensorRole = 'embedding',
): readonly number[] {
  const tensor = Object.values(trace.tensors).find(
    (candidate) => candidate.role === role,
  )
  if (!tensor || tokenIndex < 0 || tokenIndex >= trace.input.tokens.length) return []
  const hiddenSize = trace.model.hiddenSize
  const offset = tokenIndex * hiddenSize
  return tensor.values.slice(offset, offset + hiddenSize)
}

export function createStepSummary(
  trace: ModelTrace,
  step: TraceStep,
  selectedHeadIndex: number,
): string {
  const tokenCount = trace.input.tokens.length
  switch (step.operation) {
    case 'tokenize':
      return `输入句子被切成 ${tokenCount} 个 Token，并映射为 ID：${trace.input.tokenIds.join('、')}。`
    case 'embed':
      return `${tokenCount} 个 Token 分别查表得到 ${trace.model.hiddenSize} 维向量，输出形状为 [1, ${tokenCount}, ${trace.model.hiddenSize}]。`
    case 'add-position-embedding':
      return `Token 向量与位置向量逐项相加，把内容和顺序合并为 [1, ${tokenCount}, ${trace.model.hiddenSize}]，张量形状保持不变。`
    case 'project-qkv':
      return `隐藏向量被投影为 Q、K、V，并拆成 ${trace.model.heads} 个 Attention Head；每个 Head 的维度为 ${trace.model.hiddenSize / trace.model.heads}。`
    case 'apply-causal-mask':
      return `正在查看 Attention Head ${selectedHeadIndex + 1}。矩阵上三角被因果掩码遮住，当前位置不能读取未来 Token。`
    case 'weighted-sum':
      return `正在查看 Attention Head ${selectedHeadIndex + 1}。每一行权重和为 1，用于加权汇总过去位置的 V。`
    case 'project-logits':
      return `最后位置被投影到 ${trace.model.vocabularySize} 个词表候选，产生尚未归一化的 Logit。`
    case 'softmax':
      return `Softmax 把词表分数变为总和为 1 的概率；当前最高候选为“${trace.output.candidates[0]?.token}”。`
    case 'sample-token':
      return `教学轨迹从候选概率中选出“${trace.output.sampledToken}”，Token ID 为 ${trace.output.sampledTokenId}。`
  }
}
