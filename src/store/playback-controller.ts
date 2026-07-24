import type { ExplorerStoreApi } from './explorer-store'

export interface PlaybackScheduler {
  set: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clear: (handle: ReturnType<typeof setTimeout>) => void
}

export interface PlaybackController {
  dispose: () => void
}

const defaultScheduler: PlaybackScheduler = {
  set: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clear: (handle) => globalThis.clearTimeout(handle),
}

export function createPlaybackController(
  store: ExplorerStoreApi,
  scheduler: PlaybackScheduler = defaultScheduler,
): PlaybackController {
  let timer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  const clearTimer = () => {
    if (timer === null) return
    scheduler.clear(timer)
    timer = null
  }

  const schedule = () => {
    clearTimer()
    if (disposed) return

    const state = store.getState()
    const step = state.trace?.steps[state.currentStepIndex]
    if (state.playback !== 'playing' || !step) return

    const delayMs = Math.max(1, Math.round(step.durationMs / state.playbackRate))
    timer = scheduler.set(() => {
      timer = null
      store.getState().advancePlayback()
    }, delayMs)
  }

  const unsubscribe = store.subscribe((state, previousState) => {
    if (
      state.playback !== previousState.playback ||
      state.currentStepIndex !== previousState.currentStepIndex ||
      state.playbackRate !== previousState.playbackRate ||
      state.trace !== previousState.trace
    ) {
      schedule()
    }
  })

  schedule()

  return {
    dispose: () => {
      disposed = true
      clearTimer()
      unsubscribe()
    },
  }
}
