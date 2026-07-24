import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDeviceCapabilities } from './use-device-capabilities'

describe('设备能力响应 Hook', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('系统减少动态效果变化后重新检测并更新状态', () => {
    let matches = false
    let changeListener: (() => void) | null = null
    const removeEventListener = vi.fn()
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return matches
      },
      addEventListener: (_type: string, listener: () => void) => {
        changeListener = listener
      },
      removeEventListener,
    }))

    const { result, unmount } = renderHook(() => useDeviceCapabilities())
    expect(result.current.reducedMotion).toBe(false)

    matches = true
    act(() => changeListener?.())
    expect(result.current.reducedMotion).toBe(true)

    unmount()
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
