import { describe, expect, it } from 'vitest'
import { verticalSliceTrace } from '../../content/traces/vertical-slice-trace'
import {
  createStepSummary,
  formatTensorShape,
  getAttentionCells,
  getEmbeddingSample,
  getTrace2DStage,
  resolveStepTensors,
} from './trace-2d-utils'

describe('二维 Trace 数据工具', () => {
  it('把九种算子分为五个可视阶段', () => {
    expect(getTrace2DStage('tokenize')).toBe('token')
    expect(getTrace2DStage('embed')).toBe('embedding')
    expect(getTrace2DStage('add-position-embedding')).toBe('embedding')
    expect(getTrace2DStage('project-qkv')).toBe('qkv')
    expect(getTrace2DStage('apply-causal-mask')).toBe('attention')
    expect(getTrace2DStage('weighted-sum')).toBe('attention')
    expect(getTrace2DStage('project-logits')).toBe('output')
    expect(getTrace2DStage('softmax')).toBe('output')
    expect(getTrace2DStage('sample-token')).toBe('output')
  })

  it('解析当前步骤的输入与输出 Tensor', () => {
    const tensors = resolveStepTensors(verticalSliceTrace, verticalSliceTrace.steps[3])

    expect(tensors.inputs.map((tensor) => tensor.name)).toEqual(['hidden_input'])
    expect(tensors.outputs.map((tensor) => tensor.name)).toEqual(['query', 'key', 'value'])
    expect(formatTensorShape(tensors.outputs[0])).toBe('[1, 2, 6, 4]')
    expect(formatTensorShape(null)).toBe('—')
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

  it('提取每个 Token 对应的完整 Embedding 样本', () => {
    expect(getEmbeddingSample(verticalSliceTrace, 0)).toHaveLength(8)
    expect(getEmbeddingSample(verticalSliceTrace, 5)).toHaveLength(8)
    expect(getEmbeddingSample(verticalSliceTrace, 0, 'token-embedding')).toHaveLength(8)
    expect(getEmbeddingSample(verticalSliceTrace, 0, 'position-embedding')).toHaveLength(8)
    expect(getEmbeddingSample(verticalSliceTrace, -1)).toEqual([])
    expect(getEmbeddingSample(verticalSliceTrace, 99)).toEqual([])
  })

  it('为全部 TraceStep 生成中文文字替代', () => {
    const summaries = verticalSliceTrace.steps.map((step) =>
      createStepSummary(verticalSliceTrace, step, 0),
    )

    expect(summaries).toHaveLength(9)
    expect(summaries.every((summary) => summary.length > 20)).toBe(true)
    expect(summaries[2]).toContain('逐项相加')
    expect(summaries[4]).toContain('因果掩码')
    expect(summaries.at(-1)).toContain('Token ID 为 12')
  })
})
