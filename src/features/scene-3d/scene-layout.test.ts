import { describe, expect, it } from 'vitest'
import { verticalSliceTrace } from '../../content/traces/vertical-slice-trace'
import {
  getCameraTransitionAlpha,
  createSceneLayout,
  getGuidedCameraPose,
  getSceneFocus,
} from './scene-layout'

describe('三维场景布局', () => {
  it('为全部 Token、Head、核心算子与输出建立稳定实体 ID', () => {
    const layout = createSceneLayout(verticalSliceTrace)

    expect(layout.tokens).toHaveLength(6)
    expect(layout.heads).toHaveLength(2)
    expect(layout.operations).toHaveLength(11)
    expect(layout.output.id).toBe('output-token:12')
    expect(Object.keys(layout.byId)).toHaveLength(20)
    expect(layout.byId['operation:position-embedding'].kind).toBe('operation')
    expect(layout.byId['operation:layernorm'].kind).toBe('operation')
    expect(layout.byId['operation:attention'].kind).toBe('operation')
    expect(layout.byId['operation:residual-attention'].kind).toBe('operation')
    expect(layout.byId['operation:mlp'].kind).toBe('operation')
    expect(layout.byId['operation:residual-mlp'].kind).toBe('operation')
  })

  it('Token 沿同一轴等距排列且 Head 围绕中心分布', () => {
    const layout = createSceneLayout(verticalSliceTrace)
    const tokenDistances = layout.tokens.slice(1).map(
      (token, index) => token.position[0] - layout.tokens[index].position[0],
    )

    expect(new Set(tokenDistances.map((value) => value.toFixed(4))).size).toBe(1)
    expect(layout.heads[0].position[1]).toBeCloseTo(-layout.heads[1].position[1])
  })

  it('按实体选择聚焦位置，未知实体安全回到场景中心', () => {
    const layout = createSceneLayout(verticalSliceTrace)

    expect(getSceneFocus(layout, 'token:3')).toEqual(layout.byId['token:3'].position)
    expect(getSceneFocus(layout, 'operation:missing')).toEqual([0, 0, 0])
    expect(getSceneFocus(layout, null)).toEqual([0, 0, 0])
  })

  it('引导相机从焦点生成稳定偏移并保持目标不变', () => {
    const focus = [1, 2, 3] as const
    const pose = getGuidedCameraPose(focus)

    expect(pose.target).toBe(focus)
    expect(pose.position).toEqual([6.8, 6.2, 10.2])
  })

  it('减少动态效果时立即完成相机聚焦，普通模式保持平滑且限制异常帧间隔', () => {
    expect(getCameraTransitionAlpha(1 / 60, true)).toBe(1)
    expect(getCameraTransitionAlpha(1 / 60, false)).toBeGreaterThan(0)
    expect(getCameraTransitionAlpha(1 / 60, false)).toBeLessThan(1)
    expect(getCameraTransitionAlpha(99, false)).toBeCloseTo(
      getCameraTransitionAlpha(0.1, false),
    )
    expect(getCameraTransitionAlpha(-1, false)).toBe(0)
    expect(getCameraTransitionAlpha(Number.NaN, false)).toBe(0)
  })
})
