import type { TraceEntityId } from '../domain/trace/trace'
import type {
  ExplorerStore,
  ExplorerStoreApi,
  ExplorerView,
  LearningMode,
  PlaybackRate,
} from './explorer-store'

export const EXPLORER_STORAGE_KEY = 'transformer-layerscape:explorer:v1'
export const EXPLORER_SNAPSHOT_VERSION = 1 as const

export interface StorageLike {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

export interface ExplorerSnapshot {
  readonly version: typeof EXPLORER_SNAPSHOT_VERSION
  readonly mode: LearningMode
  readonly view: ExplorerView
  readonly currentStepIndex: number
  readonly guidedStepIndex: number
  readonly playbackRate: PlaybackRate
  readonly selectedEntityId: TraceEntityId | null
}

export interface ExplorerPersistenceController {
  restoreProgress: () => void
  enableSaving: () => void
  dispose: () => void
}

const modes = new Set<LearningMode>(['guided', 'explore'])
const views = new Set<ExplorerView>(['lesson', '2d', '3d'])
const playbackRates = new Set<PlaybackRate>([0.5, 1, 1.5, 2])

type StoredExplorerSnapshot = Omit<ExplorerSnapshot, 'guidedStepIndex'> & {
  readonly guidedStepIndex?: number
}

function isSnapshot(value: unknown): value is StoredExplorerSnapshot {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    record.version === EXPLORER_SNAPSHOT_VERSION &&
    modes.has(record.mode as LearningMode) &&
    views.has(record.view as ExplorerView) &&
    Number.isInteger(record.currentStepIndex) &&
    Number(record.currentStepIndex) >= 0 &&
    (record.guidedStepIndex === undefined ||
      (Number.isInteger(record.guidedStepIndex) &&
        Number(record.guidedStepIndex) >= 0)) &&
    playbackRates.has(record.playbackRate as PlaybackRate) &&
    (record.selectedEntityId === null || typeof record.selectedEntityId === 'string')
  )
}

export function readExplorerSnapshot(
  storage: StorageLike | null,
): ExplorerSnapshot | null {
  if (!storage) return null
  try {
    const serialized = storage.getItem(EXPLORER_STORAGE_KEY)
    if (!serialized) return null
    const value: unknown = JSON.parse(serialized)
    if (isSnapshot(value)) {
      return {
        ...value,
        guidedStepIndex: value.guidedStepIndex ?? value.currentStepIndex,
      }
    }
    storage.removeItem(EXPLORER_STORAGE_KEY)
  } catch {
    try {
      storage.removeItem(EXPLORER_STORAGE_KEY)
    } catch {
      // Storage may be blocked; the application remains usable in memory.
    }
  }
  return null
}

export function createExplorerSnapshot(state: ExplorerStore): ExplorerSnapshot {
  return {
    version: EXPLORER_SNAPSHOT_VERSION,
    mode: state.mode,
    view: state.view,
    currentStepIndex: state.currentStepIndex,
    guidedStepIndex: state.guidedStepIndex,
    playbackRate: state.playbackRate,
    selectedEntityId: state.selectedEntityId,
  }
}

export function writeExplorerSnapshot(
  storage: StorageLike | null,
  snapshot: ExplorerSnapshot,
) {
  if (!storage) return
  try {
    storage.setItem(EXPLORER_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Quota and privacy-mode failures must not interrupt the lesson.
  }
}

export function getBrowserStorage(): StorageLike | null {
  try {
    return typeof globalThis.localStorage === 'undefined'
      ? null
      : globalThis.localStorage
  } catch {
    return null
  }
}

export function createExplorerPersistenceController(
  store: ExplorerStoreApi,
  storage: StorageLike | null = getBrowserStorage(),
): ExplorerPersistenceController {
  const snapshot = readExplorerSnapshot(storage)
  let savingEnabled = false
  let disposed = false

  if (snapshot) {
    const state = store.getState()
    state.setMode(snapshot.mode)
    store.getState().setView(snapshot.view)
    store.getState().setPlaybackRate(snapshot.playbackRate)
  }

  const save = () => {
    if (!savingEnabled || disposed) return
    writeExplorerSnapshot(storage, createExplorerSnapshot(store.getState()))
  }
  const unsubscribe = store.subscribe(save)

  const enableSaving = () => {
    if (disposed) return
    savingEnabled = true
    save()
  }

  return {
    restoreProgress: () => {
      if (disposed) return
      if (snapshot && store.getState().trace) {
        store
          .getState()
          .restoreProgress(
            snapshot.currentStepIndex,
            snapshot.guidedStepIndex,
            snapshot.selectedEntityId,
          )
      }
      enableSaving()
    },
    enableSaving,
    dispose: () => {
      disposed = true
      unsubscribe()
    },
  }
}
