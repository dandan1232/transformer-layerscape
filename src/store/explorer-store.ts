import { createStore, type StoreApi } from 'zustand/vanilla'
import type { ModelTrace, TraceEntityId } from '../domain/trace/trace'

export type TraceStatus = 'idle' | 'loading' | 'ready' | 'error'
export type LearningMode = 'guided' | 'explore'
export type ExplorerView = 'lesson' | '2d' | '3d'
export type PlaybackState = 'paused' | 'playing'
export type PlaybackRate = 0.5 | 1 | 1.5 | 2
export type CameraMode = 'guided' | 'manual'

export interface ExplorerState {
  traceStatus: TraceStatus
  traceError: string | null
  traceRequestId: number
  trace: ModelTrace | null
  mode: LearningMode
  view: ExplorerView
  currentStepIndex: number
  playback: PlaybackState
  playbackRate: PlaybackRate
  selectedTokenIndex: number | null
  selectedLayerIndex: number | null
  selectedHeadIndex: number | null
  selectedEntityId: TraceEntityId | null
  cameraMode: CameraMode
  reducedMotion: boolean
}

export interface ExplorerActions {
  beginTraceLoad: () => number
  finishTraceLoad: (requestId: number, trace: ModelTrace) => void
  failTraceLoad: (requestId: number, message: string) => void
  cancelTraceLoad: (requestId: number) => void
  setTrace: (trace: ModelTrace) => void
  clearTrace: () => void
  setMode: (mode: LearningMode) => void
  setView: (view: ExplorerView) => void
  goToStep: (index: number) => void
  nextStep: () => void
  previousStep: () => void
  advancePlayback: () => void
  startPlayback: () => void
  pausePlayback: () => void
  resetPlayback: (startIndex?: number) => void
  setPlaybackRate: (rate: PlaybackRate) => void
  selectEntity: (id: TraceEntityId | null) => void
  selectToken: (index: number | null) => void
  selectLayer: (index: number | null) => void
  selectHead: (index: number | null) => void
  setCameraMode: (mode: CameraMode) => void
  setReducedMotion: (reducedMotion: boolean) => void
}

export type ExplorerStore = ExplorerState & ExplorerActions
export type ExplorerStoreApi = StoreApi<ExplorerStore>

const playbackRates = new Set<PlaybackRate>([0.5, 1, 1.5, 2])

function initialState(): ExplorerState {
  return {
    traceStatus: 'idle',
    traceError: null,
    traceRequestId: 0,
    trace: null,
    mode: 'guided',
    view: 'lesson',
    currentStepIndex: 0,
    playback: 'paused',
    playbackRate: 1,
    selectedTokenIndex: null,
    selectedLayerIndex: null,
    selectedHeadIndex: null,
    selectedEntityId: null,
    cameraMode: 'guided',
    reducedMotion: false,
  }
}

function selectionForEntity(trace: ModelTrace, id: TraceEntityId | null) {
  const entity = id ? trace.entities[id] : undefined
  return {
    selectedEntityId: entity?.id ?? null,
    selectedTokenIndex: entity?.tokenIndex ?? null,
    selectedLayerIndex: entity?.layerIndex ?? null,
    selectedHeadIndex: entity?.headIndex ?? null,
  }
}

function stepPatch(trace: ModelTrace, index: number) {
  const lastIndex = Math.max(0, trace.steps.length - 1)
  const safeIndex = Number.isFinite(index) ? Math.trunc(index) : 0
  const clampedIndex = Math.min(Math.max(safeIndex, 0), lastIndex)
  const selectedId = trace.steps[clampedIndex]?.entityIds[0] ?? null
  return {
    currentStepIndex: clampedIndex,
    ...selectionForEntity(trace, selectedId),
  }
}

function readyTracePatch(trace: ModelTrace) {
  return {
    traceStatus: 'ready' as const,
    traceError: null,
    trace,
    playback: 'paused' as const,
    cameraMode: 'guided' as const,
    ...stepPatch(trace, 0),
  }
}

export function createExplorerStore(): ExplorerStoreApi {
  return createStore<ExplorerStore>()((set, get) => ({
    ...initialState(),

    beginTraceLoad: () => {
      const requestId = get().traceRequestId + 1
      set({
        traceStatus: 'loading',
        traceError: null,
        traceRequestId: requestId,
        playback: 'paused',
      })
      return requestId
    },

    finishTraceLoad: (requestId, trace) => {
      if (get().traceRequestId !== requestId) return
      set(readyTracePatch(trace))
    },

    failTraceLoad: (requestId, message) => {
      if (get().traceRequestId !== requestId) return
      set({ traceStatus: 'error', traceError: message, playback: 'paused' })
    },

    cancelTraceLoad: (requestId) => {
      const state = get()
      if (state.traceRequestId !== requestId) return
      set({
        traceRequestId: requestId + 1,
        traceStatus: state.trace ? 'ready' : 'idle',
        traceError: null,
        playback: 'paused',
      })
    },

    setTrace: (trace) => {
      set((state) => ({
        ...readyTracePatch(trace),
        traceRequestId: state.traceRequestId + 1,
      }))
    },

    clearTrace: () => {
      set((state) => ({
        ...initialState(),
        mode: state.mode,
        view: state.view,
        reducedMotion: state.reducedMotion,
        traceRequestId: state.traceRequestId + 1,
      }))
    },

    setMode: (mode) => set({ mode }),
    setView: (view) => set({ view }),

    goToStep: (index) => {
      const trace = get().trace
      if (!trace) return
      set({ ...stepPatch(trace, index), playback: 'paused' })
    },

    nextStep: () => {
      const state = get()
      if (!state.trace) return
      set({
        ...stepPatch(state.trace, state.currentStepIndex + 1),
        playback: 'paused',
      })
    },

    previousStep: () => {
      const state = get()
      if (!state.trace) return
      set({
        ...stepPatch(state.trace, state.currentStepIndex - 1),
        playback: 'paused',
      })
    },

    advancePlayback: () => {
      const state = get()
      if (!state.trace || state.playback !== 'playing') return
      const lastIndex = state.trace.steps.length - 1
      const nextIndex = Math.min(state.currentStepIndex + 1, lastIndex)
      set({
        ...stepPatch(state.trace, nextIndex),
        playback: nextIndex >= lastIndex ? 'paused' : 'playing',
      })
    },

    startPlayback: () => {
      const state = get()
      if (
        state.traceStatus !== 'ready' ||
        !state.trace ||
        state.currentStepIndex >= state.trace.steps.length - 1
      ) {
        return
      }
      set({ playback: 'playing' })
    },

    pausePlayback: () => set({ playback: 'paused' }),

    resetPlayback: (startIndex = 0) => {
      const trace = get().trace
      if (!trace) return
      set({
        ...stepPatch(trace, startIndex),
        playback: 'paused',
        cameraMode: 'guided',
      })
    },

    setPlaybackRate: (rate) => {
      if (!playbackRates.has(rate)) return
      set({ playbackRate: rate })
    },

    selectEntity: (id) => {
      const trace = get().trace
      if (!trace) return
      if (id !== null && !trace.entities[id]) return
      set({ ...selectionForEntity(trace, id), playback: 'paused' })
    },

    selectToken: (index) => {
      const trace = get().trace
      if (!trace) return
      if (index === null) {
        set({ selectedTokenIndex: null, playback: 'paused' })
        return
      }
      if (!Number.isInteger(index) || index < 0 || index >= trace.input.tokens.length) return
      const id = `token:${index}`
      set({
        selectedTokenIndex: index,
        selectedEntityId: trace.entities[id] ? id : null,
        playback: 'paused',
      })
    },

    selectLayer: (index) => {
      const trace = get().trace
      if (!trace) return
      if (index === null) {
        set({ selectedLayerIndex: null, playback: 'paused' })
        return
      }
      if (!Number.isInteger(index) || index < 0 || index >= trace.model.layers) return
      set({ selectedLayerIndex: index, playback: 'paused' })
    },

    selectHead: (index) => {
      const trace = get().trace
      if (!trace) return
      if (index === null) {
        set({ selectedHeadIndex: null, playback: 'paused' })
        return
      }
      if (!Number.isInteger(index) || index < 0 || index >= trace.model.heads) return
      const id = `head:${index}`
      const entity = trace.entities[id]
      set({
        selectedHeadIndex: index,
        selectedLayerIndex: entity?.layerIndex ?? get().selectedLayerIndex,
        selectedEntityId: entity?.id ?? get().selectedEntityId,
        playback: 'paused',
      })
    },

    setCameraMode: (cameraMode) => set({ cameraMode }),
    setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  }))
}

export const explorerStore = createExplorerStore()
