import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { verticalSliceTrace } from '../content/traces/vertical-slice-trace'
import { createExplorerStore } from './explorer-store'
import { createPlaybackController } from './playback-controller'

describe('Playback Controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('按照 Trace 步骤时长推进并在结尾停止', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    const controller = createPlaybackController(store)

    store.getState().startPlayback()
    vi.advanceTimersByTime(899)
    expect(store.getState().currentStepIndex).toBe(0)

    vi.advanceTimersByTime(1)
    expect(store.getState().currentStepIndex).toBe(1)

    vi.runAllTimers()
    expect(store.getState().currentStepIndex).toBe(verticalSliceTrace.steps.length - 1)
    expect(store.getState().playback).toBe('paused')

    controller.dispose()
  })

  it('播放速度变化会重新计算剩余步骤的等待时间', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().setPlaybackRate(2)
    const controller = createPlaybackController(store)

    store.getState().startPlayback()
    vi.advanceTimersByTime(449)
    expect(store.getState().currentStepIndex).toBe(0)

    vi.advanceTimersByTime(1)
    expect(store.getState().currentStepIndex).toBe(1)

    controller.dispose()
  })

  it('暂停与销毁都会清理待执行计时器', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    const controller = createPlaybackController(store)

    store.getState().startPlayback()
    expect(vi.getTimerCount()).toBe(1)

    store.getState().pausePlayback()
    expect(vi.getTimerCount()).toBe(0)

    store.getState().startPlayback()
    controller.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})
