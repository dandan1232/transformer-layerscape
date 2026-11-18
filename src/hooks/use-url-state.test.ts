import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { verticalSliceTrace } from '../content/traces/vertical-slice-trace'
import { createExplorerStore } from '../store/explorer-store'
import { readInitialUrlState, useUrlStateSync } from './use-url-state'

beforeEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('URL 状态同步', () => {
  it('没有分享参数时不生成默认步骤', () => {
    window.history.replaceState(null, '', '/?from=lesson#attention')
    expect(readInitialUrlState()).toEqual({})
  })

  it.each(['', ' ', '-1', '1.5', '1e2', '+2', 'Infinity', 'NaN', '9007199254740992'])(
    '忽略非法步骤 %j',
    (step) => {
      window.history.replaceState(null, '', `/?step=${encodeURIComponent(step)}&mode=other`)
      expect(readInitialUrlState()).toEqual({})
    },
  )

  it.each(['guided', 'explore'])('读取有效步骤和 %s 模式', (mode) => {
    window.history.replaceState(null, '', `/?step=0&mode=${mode}`)
    expect(readInitialUrlState()).toEqual({ step: 0, mode })
  })

  it('等待轨迹就绪后才写回 URL，保留额外参数、锚点和历史状态', () => {
    const store = createExplorerStore()
    const initialUrl = '/?step=7&mode=explore&from=lesson#attention'
    window.history.replaceState({ visit: 1 }, '', initialUrl)
    renderHook(() => useUrlStateSync(store))
    expect(window.location.search + window.location.hash).toBe(initialUrl.slice(1))

    act(() => { store.getState().beginTraceLoad() })
    expect(window.location.search + window.location.hash).toBe(initialUrl.slice(1))

    act(() => {
      store.getState().setTrace(verticalSliceTrace)
      store.getState().setMode('explore')
      store.getState().goToStep(7)
    })
    expect(window.location.search + window.location.hash).toBe(initialUrl.slice(1))

    act(() => { store.getState().goToStep(8) })
    expect(new URLSearchParams(window.location.search).get('step')).toBe('8')
    expect(new URLSearchParams(window.location.search).get('from')).toBe('lesson')
    expect(window.location.hash).toBe('#attention')
    expect(window.history.state).toEqual({ visit: 1 })
  })

  it('引导学习链接显式保存 guided 模式', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    renderHook(() => useUrlStateSync(store))
    expect(readInitialUrlState()).toEqual({ step: 0, mode: 'guided' })
  })
})
