import { describe, expect, it } from 'vitest'
import { verticalSliceTrace } from '../content/traces/vertical-slice-trace'
import {
  selectCanGoNext,
  selectCanGoPrevious,
  selectCurrentEntities,
  selectCurrentStep,
  selectSelectedEntity,
} from './explorer-selectors'
import { createExplorerStore, type PlaybackRate } from './explorer-store'

describe('Explorer Store', () => {
  it('使用安全的初始状态', () => {
    const state = createExplorerStore().getState()

    expect(state.traceStatus).toBe('idle')
    expect(state.trace).toBeNull()
    expect(state.playback).toBe('paused')
    expect(state.currentStepIndex).toBe(0)
    expect(state.mode).toBe('guided')
    expect(state.view).toBe('lesson')
  })

  it('只接受最新 Trace 请求的结果', () => {
    const store = createExplorerStore()
    const first = store.getState().beginTraceLoad()
    const second = store.getState().beginTraceLoad()

    store.getState().finishTraceLoad(first, verticalSliceTrace)
    expect(store.getState().trace).toBeNull()

    store.getState().finishTraceLoad(second, verticalSliceTrace)
    expect(store.getState().traceStatus).toBe('ready')
    expect(store.getState().trace).toBe(verticalSliceTrace)
  })

  it('忽略旧请求的失败并保留新请求状态', () => {
    const store = createExplorerStore()
    const first = store.getState().beginTraceLoad()
    const second = store.getState().beginTraceLoad()

    store.getState().failTraceLoad(first, '旧错误')
    expect(store.getState().traceStatus).toBe('loading')

    store.getState().failTraceLoad(second, '新错误')
    expect(store.getState().traceStatus).toBe('error')
    expect(store.getState().traceError).toBe('新错误')
  })

  it('取消当前加载并使迟到结果失效', () => {
    const store = createExplorerStore()
    const requestId = store.getState().beginTraceLoad()

    store.getState().cancelTraceLoad(requestId)
    store.getState().finishTraceLoad(requestId, verticalSliceTrace)

    expect(store.getState().traceStatus).toBe('idle')
    expect(store.getState().trace).toBeNull()
  })

  it('设置新 Trace 时重置步骤、播放与选择', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().goToStep(4)
    store.getState().selectHead(1)

    store.getState().setTrace(verticalSliceTrace)

    const state = store.getState()
    expect(state.traceStatus).toBe('ready')
    expect(state.currentStepIndex).toBe(0)
    expect(state.playback).toBe('paused')
    expect(state.selectedEntityId).toBe('operation:tokenize')
    expect(state.selectedHeadIndex).toBeNull()
  })

  it('步骤导航会夹紧边界并更新当前实体', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)

    store.getState().goToStep(999)
    expect(store.getState().currentStepIndex).toBe(verticalSliceTrace.steps.length - 1)
    expect(store.getState().selectedEntityId).toBe('operation:output')

    store.getState().nextStep()
    expect(store.getState().currentStepIndex).toBe(verticalSliceTrace.steps.length - 1)

    store.getState().goToStep(-99)
    store.getState().previousStep()
    expect(store.getState().currentStepIndex).toBe(0)

    store.getState().goToStep(Number.NaN)
    expect(store.getState().currentStepIndex).toBe(0)
  })

  it('播放只能在合法 Trace 的非末尾步骤开始', () => {
    const store = createExplorerStore()
    store.getState().startPlayback()
    expect(store.getState().playback).toBe('paused')

    store.getState().setTrace(verticalSliceTrace)
    store.getState().startPlayback()
    expect(store.getState().playback).toBe('playing')

    store.getState().pausePlayback()
    store.getState().goToStep(verticalSliceTrace.steps.length - 1)
    store.getState().startPlayback()
    expect(store.getState().playback).toBe('paused')
  })

  it('自动推进在最后一步停止', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().goToStep(verticalSliceTrace.steps.length - 2)
    store.getState().startPlayback()

    store.getState().advancePlayback()

    expect(store.getState().currentStepIndex).toBe(verticalSliceTrace.steps.length - 1)
    expect(store.getState().playback).toBe('paused')
  })

  it('重置播放会回到首步与引导相机', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().goToStep(3)
    store.getState().setCameraMode('manual')

    store.getState().resetPlayback()

    expect(store.getState().currentStepIndex).toBe(0)
    expect(store.getState().cameraMode).toBe('guided')
    expect(store.getState().playback).toBe('paused')
  })

  it('只接受允许的播放速度', () => {
    const store = createExplorerStore()
    store.getState().setPlaybackRate(2)
    expect(store.getState().playbackRate).toBe(2)

    store.getState().setPlaybackRate(3 as PlaybackRate)
    expect(store.getState().playbackRate).toBe(2)
  })

  it('选择 Token、Layer、Head 与实体时检查边界', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)

    store.getState().selectToken(2)
    expect(store.getState().selectedTokenIndex).toBe(2)
    expect(store.getState().selectedEntityId).toBe('token:2')

    store.getState().selectLayer(0)
    store.getState().selectHead(1)
    expect(store.getState().selectedLayerIndex).toBe(0)
    expect(store.getState().selectedHeadIndex).toBe(1)
    expect(store.getState().selectedEntityId).toBe('head:1')

    store.getState().selectToken(99)
    store.getState().selectLayer(99)
    store.getState().selectHead(99)
    store.getState().selectEntity('operation:missing')
    expect(store.getState().selectedHeadIndex).toBe(1)

    store.getState().selectEntity(null)
    expect(store.getState().selectedEntityId).toBeNull()
  })

  it('保存模式、视图和减少动态效果偏好', () => {
    const store = createExplorerStore()
    store.getState().setMode('explore')
    store.getState().setView('3d')
    store.getState().setReducedMotion(true)

    expect(store.getState()).toMatchObject({
      mode: 'explore',
      view: '3d',
      reducedMotion: true,
    })
  })

  it('清除 Trace 时保留用户模式与显示偏好', () => {
    const store = createExplorerStore()
    store.getState().setMode('explore')
    store.getState().setView('2d')
    store.getState().setReducedMotion(true)
    store.getState().setTrace(verticalSliceTrace)

    store.getState().clearTrace()

    expect(store.getState()).toMatchObject({
      traceStatus: 'idle',
      trace: null,
      mode: 'explore',
      view: '2d',
      reducedMotion: true,
    })
  })

  it('Selector 返回当前步骤、实体与导航能力', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    let state = store.getState()

    expect(selectCurrentStep(state)?.id).toBe('step:tokenize')
    expect(selectCanGoPrevious(state)).toBe(false)
    expect(selectCanGoNext(state)).toBe(true)
    expect(selectCurrentEntities(state).length).toBe(7)
    expect(selectSelectedEntity(state)?.id).toBe('operation:tokenize')

    store.getState().goToStep(verticalSliceTrace.steps.length - 1)
    state = store.getState()
    expect(selectCanGoPrevious(state)).toBe(true)
    expect(selectCanGoNext(state)).toBe(false)
  })
})
