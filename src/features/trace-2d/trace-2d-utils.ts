import type {
  ModelTrace,
  TensorRole,
  TensorSummary,
  TraceOperation,
  TraceStep,
} from '../../domain/trace/trace'

export type Trace2DStage =
  | 'token'
  | 'embedding'
  | 'normalization'
  | 'qkv'
  | 'attention'
  | 'feed-forward'
  | 'output'

export type EmbeddingTensorRole = Extract<
  TensorRole,
  'token-embedding' | 'position-embedding' | 'embedding' | 'normalized'
>

export interface AttentionCell {
  readonly row: number
  readonly column: number
  readonly value: number
  readonly masked: boolean
}

export interface AttentionHeadRow {
  readonly headIndex: number
  readonly rowIndex: number
  readonly weights: readonly number[]
  readonly sum: number
  readonly dominantColumn: number
  readonly dominantValue: number
}

export interface AttentionChecks {
  readonly maskShape: readonly number[]
  readonly causalMaskValid: boolean
  readonly weightsShape: readonly number[]
  readonly normalizedRowCount: number
  readonly totalRowCount: number
  readonly headOutputShape: readonly number[]
  readonly concatenatedShape: readonly number[]
  readonly concatenationValid: boolean
}

export interface ResidualMlpChecks {
  readonly hiddenShape: readonly number[]
  readonly intermediateShape: readonly number[]
  readonly attentionResidualValid: boolean
  readonly normalizationValid: boolean
  readonly activationValid: boolean
  readonly blockResidualValid: boolean
}

export function getTrace2DStage(operation: TraceOperation): Trace2DStage {
  if (operation === 'tokenize') return 'token'
  if (operation === 'embed' || operation === 'add-position-embedding') {
    return 'embedding'
  }
  if (operation === 'layer-normalize') return 'normalization'
  if (operation === 'project-qkv') return 'qkv'
  if (operation === 'apply-causal-mask' || operation === 'weighted-sum') {
    return 'attention'
  }
  if (
    operation === 'add-attention-residual' ||
    operation === 'normalize-feed-forward' ||
    operation === 'feed-forward' ||
    operation === 'add-mlp-residual'
  ) {
    return 'feed-forward'
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

export function getAttentionHeadRows(
  trace: ModelTrace,
  rowIndex: number,
): readonly AttentionHeadRow[] {
  const tokenCount = trace.input.tokens.length
  if (rowIndex < 0 || rowIndex >= tokenCount) return []

  return Array.from({ length: trace.model.heads }, (_, headIndex) => {
    const weights = getAttentionCells(trace, headIndex)
      .filter((cell) => cell.row === rowIndex)
      .map((cell) => cell.value)
    const dominantValue = weights.length > 0 ? Math.max(...weights) : 0
    return {
      headIndex,
      rowIndex,
      weights,
      sum: weights.reduce((total, value) => total + value, 0),
      dominantColumn: weights.length > 0 ? weights.indexOf(dominantValue) : -1,
      dominantValue,
    }
  })
}

export function getAttentionChecks(trace: ModelTrace): AttentionChecks {
  const tokenCount = trace.input.tokens.length
  const headSize = trace.model.hiddenSize / trace.model.heads
  const mask = Object.values(trace.tensors).find(
    (tensor) => tensor.role === 'attention-mask',
  )
  const weights = Object.values(trace.tensors).find(
    (tensor) => tensor.role === 'attention-weights',
  )
  const headOutput = Object.values(trace.tensors).find(
    (tensor) => tensor.role === 'attention-head-output',
  )
  const concatenated = Object.values(trace.tensors).find(
    (tensor) => tensor.role === 'attention-concatenated',
  )
  const expectedMaskShape = [tokenCount, tokenCount]
  const expectedWeightsShape = [1, trace.model.heads, tokenCount, tokenCount]
  const expectedHeadOutputShape = [1, trace.model.heads, tokenCount, headSize]
  const expectedConcatenatedShape = [1, tokenCount, trace.model.hiddenSize]
  const maskShapeValid = mask?.shape.join(',') === expectedMaskShape.join(',')
  const causalMaskValid = Boolean(
    maskShapeValid &&
      mask?.values.every((value, index) => {
        const row = Math.floor(index / tokenCount)
        const column = index % tokenCount
        return value === (column <= row ? 1 : 0)
      }),
  )

  let normalizedRowCount = 0
  const totalRowCount = trace.model.heads * tokenCount
  if (weights?.shape.join(',') === expectedWeightsShape.join(',')) {
    for (let headIndex = 0; headIndex < trace.model.heads; headIndex += 1) {
      for (let rowIndex = 0; rowIndex < tokenCount; rowIndex += 1) {
        const offset = (headIndex * tokenCount + rowIndex) * tokenCount
        const sum = weights.values
          .slice(offset, offset + tokenCount)
          .reduce((total, value) => total + value, 0)
        if (Math.abs(sum - 1) <= 1e-4) normalizedRowCount += 1
      }
    }
  }

  const outputShapesValid =
    headOutput?.shape.join(',') === expectedHeadOutputShape.join(',') &&
    concatenated?.shape.join(',') === expectedConcatenatedShape.join(',')
  const concatenationValid = Boolean(
    outputShapesValid &&
      concatenated?.values.every((value, targetIndex) => {
        const tokenIndex = Math.floor(targetIndex / trace.model.hiddenSize)
        const hiddenDimension = targetIndex % trace.model.hiddenSize
        const headIndex = Math.floor(hiddenDimension / headSize)
        const dimension = hiddenDimension % headSize
        const sourceIndex =
          (headIndex * tokenCount + tokenIndex) * headSize + dimension
        return Math.abs(value - (headOutput?.values[sourceIndex] ?? Number.NaN)) <= 1e-4
      }),
  )

  return {
    maskShape: mask?.shape ?? [],
    causalMaskValid,
    weightsShape: weights?.shape ?? [],
    normalizedRowCount,
    totalRowCount,
    headOutputShape: headOutput?.shape ?? [],
    concatenatedShape: concatenated?.shape ?? [],
    concatenationValid,
  }
}

function geluValue(value: number) {
  const curved = Math.sqrt(2 / Math.PI) * (value + 0.044715 * value ** 3)
  return 0.5 * value * (1 + Math.tanh(curved))
}

export function getResidualMlpChecks(trace: ModelTrace): ResidualMlpChecks {
  const tensorByRole = (role: TensorRole) =>
    Object.values(trace.tensors).find((tensor) => tensor.role === role)
  const hiddenShape = [1, trace.input.tokens.length, trace.model.hiddenSize]
  const intermediateShape = [
    1,
    trace.input.tokens.length,
    trace.model.hiddenSize * 4,
  ]
  const blockInput = tensorByRole('block-input')
  const attentionOutput = tensorByRole('attention-output')
  const attentionResidual = tensorByRole('attention-residual')
  const normalized = tensorByRole('feed-forward-normalized')
  const expanded = tensorByRole('mlp-expanded')
  const activated = tensorByRole('mlp-activated')
  const mlpOutput = tensorByRole('mlp-output')
  const blockOutput = tensorByRole('block-output')
  const sameShape = (shape: readonly number[] | undefined, expected: readonly number[]) =>
    shape?.join(',') === expected.join(',')
  const attentionResidualValid = Boolean(
    sameShape(attentionResidual?.shape, hiddenShape) &&
      attentionResidual?.values.every(
        (value, index) =>
          Math.abs(
            value -
              ((blockInput?.values[index] ?? Number.NaN) +
                (attentionOutput?.values[index] ?? Number.NaN)),
          ) <= 1e-4,
      ),
  )
  let normalizationValid = sameShape(normalized?.shape, hiddenShape)
  if (normalizationValid && normalized) {
    for (let tokenIndex = 0; tokenIndex < trace.input.tokens.length; tokenIndex += 1) {
      const start = tokenIndex * trace.model.hiddenSize
      const values = normalized.values.slice(start, start + trace.model.hiddenSize)
      const stats = getVectorStats(values)
      if (Math.abs(stats.mean) > 0.002 || Math.abs(stats.variance - 1) > 0.01) {
        normalizationValid = false
        break
      }
    }
  }
  const activationValid = Boolean(
    sameShape(expanded?.shape, intermediateShape) &&
      sameShape(activated?.shape, intermediateShape) &&
      activated?.values.every(
        (value, index) =>
          Math.abs(value - geluValue(expanded?.values[index] ?? Number.NaN)) <= 1e-4,
      ),
  )
  const blockResidualValid = Boolean(
    sameShape(mlpOutput?.shape, hiddenShape) &&
      sameShape(blockOutput?.shape, hiddenShape) &&
      blockOutput?.values.every(
        (value, index) =>
          Math.abs(
            value -
              ((attentionResidual?.values[index] ?? Number.NaN) +
                (mlpOutput?.values[index] ?? Number.NaN)),
          ) <= 1e-4,
      ),
  )

  return {
    hiddenShape,
    intermediateShape,
    attentionResidualValid,
    normalizationValid,
    activationValid,
    blockResidualValid,
  }
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

export function getVectorStats(values: readonly number[]) {
  if (values.length === 0) return { mean: 0, variance: 0, standardDeviation: 0 }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce(
    (sum, value) => sum + (value - mean) ** 2,
    0,
  ) / values.length
  return { mean, variance, standardDeviation: Math.sqrt(variance) }
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
    case 'layer-normalize':
      return `LayerNorm 分别归一化 ${tokenCount} 个 Token 的 ${trace.model.hiddenSize} 个隐藏维度，使每个位置接近零均值和单位方差，形状保持不变。`
    case 'project-qkv':
      return `归一化后的隐藏向量被投影为 Q、K、V，并拆成 ${trace.model.heads} 个 Attention Head；每个 Head 的维度为 ${trace.model.hiddenSize / trace.model.heads}。`
    case 'apply-causal-mask':
      return `正在查看 Attention Head ${selectedHeadIndex + 1}。矩阵上三角被因果掩码遮住，当前位置不能读取未来 Token。`
    case 'weighted-sum':
      return `正在查看 Attention Head ${selectedHeadIndex + 1}。各 Head 分别汇总 V，再把 ${trace.model.heads} 个 ${trace.model.hiddenSize / trace.model.heads} 维结果拼接回 ${trace.model.hiddenSize} 维隐藏向量。`
    case 'add-attention-residual':
      return `Attention 输出与子层输入逐项相加，形状保持 [1, ${tokenCount}, ${trace.model.hiddenSize}]；这条旁路让原始 Token 信息不必完全依赖 Attention 重建。`
    case 'normalize-feed-forward':
      return `第二次 LayerNorm 位于 Attention 残差之后、MLP 之前；它稳定每个 Token 的 ${trace.model.hiddenSize} 个隐藏维度，但不改变形状。`
    case 'feed-forward':
      return `每个 Token 独立经过同一组 MLP：${trace.model.hiddenSize} 维先扩展到 ${trace.model.hiddenSize * 4} 维，经 GELU 筛选后再压回 ${trace.model.hiddenSize} 维。`
    case 'add-mlp-residual':
      return `MLP 输出与 Attention 残差逐项相加，得到形状为 [1, ${tokenCount}, ${trace.model.hiddenSize}] 的完整 Transformer Block 输出。`
    case 'project-logits':
      return `最后位置被投影到 ${trace.model.vocabularySize} 个词表候选，产生尚未归一化的 Logit。`
    case 'softmax':
      return `Softmax 把词表分数变为总和为 1 的概率；当前最高候选为“${trace.output.candidates[0]?.token}”。`
    case 'sample-token':
      return `教学轨迹从候选概率中选出“${trace.output.sampledToken}”，Token ID 为 ${trace.output.sampledTokenId}。`
  }
}
