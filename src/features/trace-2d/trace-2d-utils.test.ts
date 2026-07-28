import { describe, expect, it } from 'vitest'
import { verticalSliceTrace } from '../../content/traces/vertical-slice-trace'
import {
  createStepSummary,
  formatTensorShape,
  getAttentionChecks,
  getAttentionCells,
  getAttentionHeadRows,
  getEmbeddingSample,
  getResidualMlpChecks,
  getTrace2DStage,
  getVectorStats,
  resolveStepTensors,
} from './trace-2d-utils'

describe('二维 Trace 数据工具', () => {
  it('把十四种算子分为七个可视阶段', () => {
    expect(getTrace2DStage('tokenize')).toBe('token')
    expect(getTrace2DStage('embed')).toBe('embedding')
    expect(getTrace2DStage('add-position-embedding')).toBe('embedding')
    expect(getTrace2DStage('layer-normalize')).toBe('normalization')
    expect(getTrace2DStage('project-qkv')).toBe('qkv')
    expect(getTrace2DStage('apply-causal-mask')).toBe('attention')
    expect(getTrace2DStage('weighted-sum')).toBe('attention')
    expect(getTrace2DStage('add-attention-residual')).toBe('feed-forward')
    expect(getTrace2DStage('normalize-feed-forward')).toBe('feed-forward')
    expect(getTrace2DStage('feed-forward')).toBe('feed-forward')
    expect(getTrace2DStage('add-mlp-residual')).toBe('feed-forward')
    expect(getTrace2DStage('project-logits')).toBe('output')
    expect(getTrace2DStage('softmax')).toBe('output')
    expect(getTrace2DStage('sample-token')).toBe('output')
  })

  it('解析当前步骤的输入与输出 Tensor', () => {
    const tensors = resolveStepTensors(verticalSliceTrace, verticalSliceTrace.steps[4])

    expect(tensors.inputs.map((tensor) => tensor.name)).toEqual(['normalized_hidden'])
    expect(tensors.outputs.map((tensor) => tensor.name)).toEqual(['query', 'key', 'value'])
    expect(formatTensorShape(tensors.outputs[0])).toBe('[1, 2, 6, 4]')
    expect(formatTensorShape(null)).toBe('—')
  })

  it('计算 LayerNorm 前后的均值与方差', () => {
    const before = getEmbeddingSample(verticalSliceTrace, 0, 'embedding')
    const after = getEmbeddingSample(verticalSliceTrace, 0, 'normalized')

    expect(Math.abs(getVectorStats(before).mean)).toBeGreaterThan(0.01)
    expect(getVectorStats(after).mean).toBeCloseTo(0, 3)
    expect(getVectorStats(after).variance).toBeCloseTo(1, 2)
  })

  it('按 Head 读取真实注意力矩阵并标记因果掩码', () => {
    const head0 = getAttentionCells(verticalSliceTrace, 0)
    const head1 = getAttentionCells(verticalSliceTrace, 1)

    expect(head0).toHaveLength(36)
    expect(head0.find((cell) => cell.row === 1 && cell.column === 0)?.value).toBe(0.42)
    expect(head1.find((cell) => cell.row === 1 && cell.column === 0)?.value).toBe(0.65)
    expect(head0.find((cell) => cell.row === 0 && cell.column === 1)?.masked).toBe(true)
    expect(getAttentionCells(verticalSliceTrace, 99)).toEqual([])
  })

  it('对比同一查询行的多个 Head 并验证 Softmax 与拼接形状', () => {
    const rows = getAttentionHeadRows(verticalSliceTrace, 5)
    const checks = getAttentionChecks(verticalSliceTrace)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      sum: 1,
      dominantColumn: 5,
      dominantValue: 0.33,
    })
    expect(rows[1]).toMatchObject({
      sum: 1,
      dominantColumn: 4,
      dominantValue: 0.42,
    })
    expect(getAttentionHeadRows(verticalSliceTrace, 99)).toEqual([])
    expect(checks).toMatchObject({
      causalMaskValid: true,
      normalizedRowCount: 12,
      totalRowCount: 12,
      headOutputShape: [1, 2, 6, 4],
      concatenatedShape: [1, 6, 8],
      concatenationValid: true,
    })
  })

  it('提取每个 Token 对应的完整 Embedding 样本', () => {
    expect(getEmbeddingSample(verticalSliceTrace, 0)).toHaveLength(8)
    expect(getEmbeddingSample(verticalSliceTrace, 5)).toHaveLength(8)
    expect(getEmbeddingSample(verticalSliceTrace, 0, 'token-embedding')).toHaveLength(8)
    expect(getEmbeddingSample(verticalSliceTrace, 0, 'position-embedding')).toHaveLength(8)
    expect(getEmbeddingSample(verticalSliceTrace, -1)).toEqual([])
    expect(getEmbeddingSample(verticalSliceTrace, 99)).toEqual([])
  })

  it('验证两条残差、LayerNorm 顺序和 MLP 扩维链路', () => {
    const checks = getResidualMlpChecks(verticalSliceTrace)

    expect(checks).toEqual({
      hiddenShape: [1, 6, 8],
      intermediateShape: [1, 6, 32],
      attentionResidualValid: true,
      normalizationValid: true,
      activationValid: true,
      blockResidualValid: true,
    })
  })

  it('为全部 TraceStep 生成中文文字替代', () => {
    const summaries = verticalSliceTrace.steps.map((step) =>
      createStepSummary(verticalSliceTrace, step, 0),
    )

    expect(summaries).toHaveLength(14)
    expect(summaries.every((summary) => summary.length > 20)).toBe(true)
    expect(summaries[2]).toContain('逐项相加')
    expect(summaries[3]).toContain('零均值')
    expect(summaries[5]).toContain('因果掩码')
    expect(summaries[7]).toContain('旁路')
    expect(summaries[9]).toContain('32 维')
    expect(summaries[10]).toContain('Block 输出')
    expect(summaries.at(-1)).toContain('Token ID 为 12')
  })
})
