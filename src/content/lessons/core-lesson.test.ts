import { describe, expect, it } from 'vitest'
import type { ModelTrace } from '../../domain/trace/trace'
import { validateLesson } from '../../domain/lesson/lesson-validator'
import { navigateToLessonStep } from '../../features/lesson-panel/lesson-navigation'
import { createExplorerStore } from '../../store/explorer-store'
import { verticalSliceTrace } from '../traces/vertical-slice-trace'
import { coreLesson, createCoreLesson } from './core-lesson'

function realLessonTrace(tokenCount: number): ModelTrace {
  return {
    ...verticalSliceTrace,
    source: 'onnx',
    model: { ...verticalSliceTrace.model, layers: 6, hiddenSize: 768, heads: 12, vocabularySize: 50257 },
    input: {
      text: 'The sky is blue',
      tokens: Array.from({ length: tokenCount }, (_, index) => `token ${index}`),
      tokenIds: Array.from({ length: tokenCount }, (_, index) => index),
    },
    tensors: {
      ...verticalSliceTrace.tensors,
      'tensor:q': { ...verticalSliceTrace.tensors['tensor:q'], shape: [1, 12, tokenCount, 64] },
      'tensor:mlp-expanded': { ...verticalSliceTrace.tensors['tensor:mlp-expanded'], shape: [1, tokenCount, 3072] },
    },
    entities: {
      ...verticalSliceTrace.entities,
      'operation:layernorm': { ...verticalSliceTrace.entities['operation:layernorm'], layerIndex: 2 },
      'output-token:77': { id: 'output-token:77', kind: 'output-token', label: 'today' },
    },
    output: {
      ...verticalSliceTrace.output,
      sampledTokenId: 77,
      sampledToken: ' today',
      defaultSampling: { temperature: 0.7, topK: 8, topP: 0.8, seed: 42 },
    },
  }
}

describe('随模型轨迹更新的中文课程', () => {
  it.each([1, 4, 12])('按 %i 个 Token 和真实模型维度生成讲解、形状与伪代码', (tokenCount) => {
    const trace = realLessonTrace(tokenCount)
    const lesson = createCoreLesson(trace)
    const steps = lesson.chapters.flatMap((chapter) => chapter.steps)
    const step = (id: string) => steps.find((entry) => entry.id === `lesson-step:${id}`)!

    expect(() => validateLesson(lesson, trace)).not.toThrow()
    expect(step('tokenize').plainExplanation).toContain(`切成 ${tokenCount} 个 Token`)
    expect(step('embedding').deepDive.tensorShape?.expression).toBe(`[batch, token, hidden] = [1, ${tokenCount}, 768]`)
    expect(step('qkv').deepDive.tensorShape?.expression).toBe(`[batch, head, token, head_size] = [1, 12, ${tokenCount}, 64]`)
    expect(step('causal-mask').deepDive.tensorShape?.expression).toBe(`Mask [${tokenCount}, ${tokenCount}] → Weights [1, 12, ${tokenCount}, ${tokenCount}]`)
    expect(step('attention-output').title).toBe('让 12 个 Head 分工再合并')
    expect(step('mlp').plainExplanation).toContain('768 维向量扩展到 3072 维')
    expect(step('mlp').deepDive.pseudocode).toContain('mlp_output = linear_down(activated)  # 3072D -> 768D')
    expect(step('logits').deepDive.tensorShape?.expression).toBe('[batch, vocabulary] = [1, 50257]')
    expect(step('logits').plainExplanation).toContain('所选第 3 层之后的 Block')
    expect(step('logits').plainExplanation).toContain('最终 LayerNorm')
    expect(step('position-embedding').deepDive.explanation).toContain('由训练得到')
    expect(step('layernorm').deepDive.explanation).toContain('输出不一定是零均值')
    expect(step('layernorm').deepDive.pseudocode).toContain('normalized = gamma * normalized + beta')
    expect(step('attention-output').deepDive.pseudocode).toContain('attention_output = attention_output @ W_O + b_O')
  })

  it('采样说明对应轨迹默认参数，导航选择真实输出实体', () => {
    const trace = realLessonTrace(4)
    const lesson = createCoreLesson(trace)
    const sample = lesson.chapters.at(-1)!.steps.at(-1)!
    expect(sample.plainExplanation).toContain('本次轨迹默认参数为 Temperature 0.7、Top-k 8、Top-p 0.8、Seed 42')
    expect(sample.plainExplanation).toContain('结果是“today”')
    expect(sample.plainExplanation).toContain('改变参数后的实验结果请看二维计算面板')
    expect(sample.action).toMatchObject({
      selectEntityId: 'output-token:77',
      cameraTargetId: 'output-token:77',
      twoDTargetId: 'output-token:77',
    })

    const store = createExplorerStore()
    store.getState().setTrace(trace)
    navigateToLessonStep(store, lesson, sample.id)
    expect(store.getState().selectedEntityId).toBe('output-token:77')
    expect(store.getState().currentStepIndex).toBe(13)
  })

  it('生成真实课程后不会改写预置课程，恢复预置模型时恢复原维度和结果', () => {
    const original = structuredClone(coreLesson)
    createCoreLesson(realLessonTrace(4))
    const restored = createCoreLesson(verticalSliceTrace)
    expect(coreLesson).toEqual(original)
    expect(restored).toEqual(coreLesson)
    expect(() => validateLesson(restored, verticalSliceTrace)).not.toThrow()
    expect(restored.chapters[0].steps[2].deepDive.explanation).toContain('正弦位置向量')
    expect(restored.chapters[1].steps[1].deepDive.tensorShape?.expression).toBe('[batch, head, token, head_size] = [1, 2, 6, 4]')
    expect(restored.chapters.at(-1)!.steps.at(-1)!.action.selectEntityId).toBe('output-token:12')
  })
})
