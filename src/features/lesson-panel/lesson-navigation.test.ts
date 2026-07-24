import { describe, expect, it } from 'vitest'
import { coreLesson } from '../../content/lessons/core-lesson'
import { verticalSliceTrace } from '../../content/traces/vertical-slice-trace'
import { createExplorerStore } from '../../store/explorer-store'
import {
  findLessonStepContext,
  flattenLessonSteps,
  getAdjacentLessonStep,
  navigateToLessonStep,
} from './lesson-navigation'

describe('课程导航控制器', () => {
  it('把三章课程展平为八个有序课程项', () => {
    const steps = flattenLessonSteps(coreLesson)

    expect(steps).toHaveLength(8)
    expect(steps[0].action.traceStepId).toBe('step:tokenize')
    expect(steps.at(-1)?.action.traceStepId).toBe('step:sample')
  })

  it('按 TraceStep 定位章节和全局课程位置', () => {
    const context = findLessonStepContext(coreLesson, 'step:causal-mask')

    expect(context).toMatchObject({
      chapterIndex: 1,
      stepIndex: 1,
      lessonStepIndex: 3,
      totalLessonSteps: 8,
    })
    expect(context?.chapter.id).toBe('chapter:attention')
    expect(findLessonStepContext(coreLesson, 'step:missing')).toBeNull()
  })

  it('返回前后课程项并保护首尾边界', () => {
    const steps = flattenLessonSteps(coreLesson)

    expect(getAdjacentLessonStep(coreLesson, steps[0].id, -1)).toBeNull()
    expect(getAdjacentLessonStep(coreLesson, steps[0].id, 1)?.id).toBe(steps[1].id)
    expect(getAdjacentLessonStep(coreLesson, steps.at(-1)!.id, 1)).toBeNull()
    expect(getAdjacentLessonStep(coreLesson, 'lesson-step:missing', 1)).toBeNull()
  })

  it('执行课程动作时同步 Trace 步骤、选中实体和相机模式', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().setCameraMode('manual')

    navigateToLessonStep(store, coreLesson, 'lesson-step:qkv')

    expect(store.getState()).toMatchObject({
      currentStepIndex: 2,
      selectedEntityId: 'operation:qkv',
      cameraMode: 'guided',
      playback: 'paused',
    })
  })

  it('对未知课程项、缺失 Trace 和坏 Trace 引用给出可定位错误', () => {
    const store = createExplorerStore()
    expect(() => navigateToLessonStep(store, coreLesson, 'lesson-step:missing')).toThrow(
      '课程项 lesson-step:missing 不存在',
    )
    expect(() => navigateToLessonStep(store, coreLesson, 'lesson-step:qkv')).toThrow(
      '模型轨迹尚未就绪',
    )

    const incompleteTrace = structuredClone(verticalSliceTrace)
    Object.assign(incompleteTrace, { steps: incompleteTrace.steps.slice(0, 1) })
    store.getState().setTrace(incompleteTrace)
    expect(() => navigateToLessonStep(store, coreLesson, 'lesson-step:qkv')).toThrow(
      'TraceStep step:qkv 不存在',
    )
  })
})
