import { act, render, screen, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { PresetTraceAdapter } from './adapters/preset/preset-trace-adapter'
import { verticalSliceTrace } from './content/traces/vertical-slice-trace'
import type { ModelTrace } from './domain/trace/trace'
import { EXPLORER_STORAGE_KEY } from './store/explorer-persistence'
import { explorerStore } from './store/explorer-store'

vi.mock('./features/scene-3d/Scene3DPanel', () => ({
  Scene3DPanel: () => null,
}))

beforeEach(() => {
  explorerStore.setState(explorerStore.getInitialState(), true)
  window.history.replaceState(null, '', '/')
  localStorage.clear()
  localStorage.setItem('transformer-layerscape:tour-dismissed', 'true')
})

afterEach(() => {
  vi.restoreAllMocks()
})

function saveProgress() {
  localStorage.setItem(EXPLORER_STORAGE_KEY, JSON.stringify({
    version: 1,
    mode: 'explore',
    view: 'lesson',
    currentStepIndex: 4,
    guidedStepIndex: 2,
    playbackRate: 1.5,
    selectedEntityId: 'operation:qkv',
  }))
}

function renderApp() {
  return render(<StrictMode><App /></StrictMode>)
}

describe('应用初始化时恢复分享链接', () => {
  it('StrictMode 下等待轨迹加载，以链接覆盖本地步骤和模式', async () => {
    saveProgress()
    const url = '/?step=7&mode=guided&from=lesson#attention'
    window.history.replaceState(null, '', url)
    let resolveTrace!: (trace: ModelTrace) => void
    const pendingTrace = new Promise<ModelTrace>((resolve) => { resolveTrace = resolve })
    vi.spyOn(PresetTraceAdapter.prototype, 'load').mockReturnValue(pendingTrace)

    renderApp()
    expect(screen.getByText('正在准备案例')).toBeInTheDocument()
    expect(window.location.search + window.location.hash).toBe(url.slice(1))

    await act(async () => { resolveTrace(verticalSliceTrace) })

    expect(screen.getByRole('slider', { name: '定位模型计算步骤' })).toHaveValue('8')
    expect(screen.getByRole('button', { name: '引导学习' })).toHaveAttribute('aria-pressed', 'true')
    expect(explorerStore.getState()).toMatchObject({
      currentStepIndex: 7,
      guidedStepIndex: 7,
      playbackRate: 1.5,
    })
    expect(window.location.search + window.location.hash).toBe(url.slice(1))
    expect(JSON.parse(localStorage.getItem(EXPLORER_STORAGE_KEY)!)).toMatchObject({
      currentStepIndex: 7,
      mode: 'guided',
    })
  })

  it.each(['/?from=lesson#attention', '/?step=1.5&mode=unknown'])(
    '缺少有效分享参数时从本地历史恢复：%s',
    async (url) => {
      saveProgress()
      window.history.replaceState(null, '', url)
      renderApp()

      await waitFor(() => {
        expect(screen.getByRole('slider', { name: '定位模型计算步骤' })).toHaveValue('5')
      })
      expect(screen.getByRole('button', { name: '自由探索' })).toHaveAttribute('aria-pressed', 'true')
      expect(explorerStore.getState().guidedStepIndex).toBe(2)
    },
  )

  it('将明确的第零步恢复为第一步，而非误当作缺失参数', async () => {
    saveProgress()
    window.history.replaceState(null, '', '/?step=0&mode=explore')
    renderApp()

    await screen.findByText('预置案例已就绪')
    expect(screen.getByRole('slider', { name: '定位模型计算步骤' })).toHaveValue('1')
    expect(screen.getByRole('button', { name: '自由探索' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('仅指定模式时保留本地课程锚点', async () => {
    saveProgress()
    window.history.replaceState(null, '', '/?mode=guided')
    renderApp()

    await waitFor(() => {
      expect(screen.getByRole('slider', { name: '定位模型计算步骤' })).toHaveValue('3')
    })
    expect(screen.getByRole('button', { name: '引导学习' })).toHaveAttribute('aria-pressed', 'true')
  })
})
