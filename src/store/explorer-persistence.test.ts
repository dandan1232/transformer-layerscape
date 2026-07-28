import { describe, expect, it, vi } from 'vitest'
import { verticalSliceTrace } from '../content/traces/vertical-slice-trace'
import { createExplorerStore } from './explorer-store'
import {
  createExplorerPersistenceController,
  createExplorerSnapshot,
  EXPLORER_STORAGE_KEY,
  readExplorerSnapshot,
  writeExplorerSnapshot,
  type StorageLike,
} from './explorer-persistence'

function memoryStorage(initialValue: string | null = null): StorageLike & {
  value: string | null
} {
  return {
    value: initialValue,
    getItem() {
      return this.value
    },
    setItem(_key, value) {
      this.value = value
    },
    removeItem() {
      this.value = null
    },
  }
}

describe('探索进度本地持久化', () => {
  it('序列化版本化的进度、视图、模式、速度和实体焦点', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().setMode('explore')
    store.getState().setView('3d')
    store.getState().setPlaybackRate(1.5)
    store.getState().goToStep(4)
    store.getState().selectHead(1)

    expect(createExplorerSnapshot(store.getState())).toEqual({
      version: 1,
      mode: 'explore',
      view: '3d',
      currentStepIndex: 4,
      playbackRate: 1.5,
      selectedEntityId: 'head:1',
    })
  })

  it('先恢复偏好，在 Trace 就绪后恢复合法步骤与实体并继续保存', () => {
    const storage = memoryStorage(
      JSON.stringify({
        version: 1,
        mode: 'explore',
        view: '2d',
        currentStepIndex: 3,
        playbackRate: 2,
        selectedEntityId: 'head:1',
      }),
    )
    const store = createExplorerStore()
    const controller = createExplorerPersistenceController(store, storage)

    expect(store.getState()).toMatchObject({
      mode: 'explore',
      view: '2d',
      playbackRate: 2,
      currentStepIndex: 0,
    })

    store.getState().setTrace(verticalSliceTrace)
    controller.restoreProgress()
    expect(store.getState()).toMatchObject({
      currentStepIndex: 3,
      selectedEntityId: 'head:1',
    })

    store.getState().goToStep(7)
    expect(JSON.parse(storage.value ?? '{}')).toMatchObject({
      version: 1,
      currentStepIndex: 7,
      selectedEntityId: 'operation:output',
    })
    controller.dispose()
  })

  it('损坏、旧版本或字段越界的 LocalStorage 会被清理且不阻塞应用', () => {
    const removeItem = vi.fn()
    const brokenStorage: StorageLike = {
      getItem: () => '{broken',
      setItem: vi.fn(),
      removeItem,
    }
    expect(readExplorerSnapshot(brokenStorage)).toBeNull()
    expect(removeItem).toHaveBeenCalledWith(EXPLORER_STORAGE_KEY)

    const oldVersion = memoryStorage(
      JSON.stringify({
        version: 0,
        mode: 'guided',
        view: 'lesson',
        currentStepIndex: -1,
        playbackRate: 1,
        selectedEntityId: null,
      }),
    )
    expect(readExplorerSnapshot(oldVersion)).toBeNull()
    expect(oldVersion.value).toBeNull()
  })

  it('隐私模式或容量异常时读写失败不会向外抛错', () => {
    const blockedStorage: StorageLike = {
      getItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
      removeItem: () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    }

    expect(readExplorerSnapshot(blockedStorage)).toBeNull()
    expect(() =>
      writeExplorerSnapshot(blockedStorage, {
        version: 1,
        mode: 'guided',
        view: 'lesson',
        currentStepIndex: 0,
        playbackRate: 1,
        selectedEntityId: null,
      }),
    ).not.toThrow()
  })

  it('控制器释放后不再恢复或写入任何状态', () => {
    const storage = memoryStorage(
      JSON.stringify({
        version: 1,
        mode: 'guided',
        view: 'lesson',
        currentStepIndex: 4,
        playbackRate: 1,
        selectedEntityId: null,
      }),
    )
    const store = createExplorerStore()
    const controller = createExplorerPersistenceController(store, storage)
    controller.dispose()
    store.getState().setTrace(verticalSliceTrace)
    const before = storage.value

    controller.restoreProgress()
    controller.enableSaving()
    store.getState().goToStep(2)

    expect(store.getState().currentStepIndex).toBe(2)
    expect(storage.value).toBe(before)
  })
})
