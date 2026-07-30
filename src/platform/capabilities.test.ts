import { describe, expect, it, vi } from 'vitest'
import {
  detectDeviceCapabilities,
  observeCapabilityChanges,
  type CapabilityScope,
} from './capabilities'

function scope(
  value: Partial<CapabilityScope> & {
    readonly contexts?: Readonly<Record<string, boolean>>
  } = {},
): CapabilityScope {
  const contexts = value.contexts ?? {}
  return {
    WebAssembly: {},
    WebGLRenderingContext: class {},
    WebGL2RenderingContext: class {},
    navigator: { gpu: {}, deviceMemory: 8 },
    document: {
      createElement: () => ({
        getContext: (contextId) => (contexts[contextId] ? {} : null),
      }),
    },
    matchMedia: () => ({ matches: false }),
    ...value,
  }
}

describe('设备能力检测', () => {
  it('识别 WebGL2、WebGPU、WASM、高内存与系统减少动态效果', () => {
    const result = detectDeviceCapabilities(
      scope({
        contexts: { webgl2: true },
        matchMedia: (query) => ({
          matches: query === '(prefers-reduced-motion: reduce)',
        }),
      }),
    )

    expect(result).toEqual({
      webgl: true,
      webgl2: true,
      webgpu: true,
      wasm: true,
      reducedMotion: true,
      coarsePointer: false,
      compactViewport: false,
      deviceMemoryGB: 8,
      memoryTier: 'high',
      threeDMode: 'full',
    })
  })

  it('粗指针设备即使内存充足也采用简化三维', () => {
    const result = detectDeviceCapabilities(
      scope({
        contexts: { webgl2: true },
        matchMedia: (query) => ({ matches: query === '(pointer: coarse)' }),
      }),
    )

    expect(result).toMatchObject({
      coarsePointer: true,
      memoryTier: 'high',
      threeDMode: 'reduced',
    })
  })

  it('窄视口在精细指针设备上也采用简化三维', () => {
    const result = detectDeviceCapabilities(
      scope({
        contexts: { webgl2: true },
        matchMedia: (query) => ({ matches: query === '(max-width: 47.99rem)' }),
      }),
    )

    expect(result).toMatchObject({
      coarsePointer: false,
      compactViewport: true,
      threeDMode: 'reduced',
    })
  })

  it('WebGL2 不可用时回退 WebGL1，低内存采用简化三维', () => {
    const result = detectDeviceCapabilities(
      scope({
        contexts: { webgl: true },
        navigator: { deviceMemory: 4 },
      }),
    )

    expect(result).toMatchObject({
      webgl: true,
      webgl2: false,
      webgpu: false,
      memoryTier: 'low',
      threeDMode: 'reduced',
    })
  })

  it('Context 创建失败或构造器缺失时进入二维安全模式', () => {
    const failedContext = detectDeviceCapabilities(
      scope({
        document: {
          createElement: () => ({
            getContext: () => {
              throw new Error('context failed')
            },
          }),
        },
      }),
    )
    const noConstructors = detectDeviceCapabilities({
      navigator: { deviceMemory: Number.NaN },
    })

    expect(failedContext.threeDMode).toBe('none')
    expect(noConstructors).toMatchObject({
      webgl: false,
      webgl2: false,
      wasm: false,
      coarsePointer: false,
      compactViewport: false,
      deviceMemoryGB: null,
      memoryTier: 'unknown',
      threeDMode: 'none',
    })
  })

  it('监听现代与旧版 reduced-motion 媒体查询变化并正确清理', () => {
    const listener = vi.fn()
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const dispose = observeCapabilityChanges(listener, {
      matchMedia: () => ({
        matches: false,
        addEventListener,
        removeEventListener,
      }),
    })

    expect(addEventListener).toHaveBeenCalledTimes(3)
    expect(addEventListener).toHaveBeenCalledWith('change', listener)
    dispose()
    expect(removeEventListener).toHaveBeenCalledTimes(3)
    expect(removeEventListener).toHaveBeenCalledWith('change', listener)

    const addListener = vi.fn()
    const removeListener = vi.fn()
    const disposeLegacy = observeCapabilityChanges(listener, {
      matchMedia: () => ({ matches: false, addListener, removeListener }),
    })
    expect(addListener).toHaveBeenCalledTimes(3)
    expect(addListener).toHaveBeenCalledWith(listener)
    disposeLegacy()
    expect(removeListener).toHaveBeenCalledTimes(3)
    expect(removeListener).toHaveBeenCalledWith(listener)
  })
})
