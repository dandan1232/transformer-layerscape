import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verticalSliceTrace } from '../../content/traces/vertical-slice-trace'
import { createExplorerStore } from '../../store/explorer-store'
import { Scene3DPanel, SceneFrameReady } from './Scene3DPanel'

const frameProbe = vi.hoisted(() => ({
  callbacks: new Set<() => void>(),
  renderer: {
    info: { render: { frame: 0, calls: 0 } },
    getContext: () => ({ isContextLost: () => frameProbe.contextLost }),
  },
  contextLost: false,
}))

vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...await importOriginal<typeof import('@react-three/fiber')>(),
  useThree: () => ({ gl: frameProbe.renderer }),
  addAfterEffect: (callback: () => void) => {
    frameProbe.callbacks.add(callback)
    return () => { frameProbe.callbacks.delete(callback) }
  },
}))

describe('三维首帧就绪信号', () => {
  beforeEach(() => {
    frameProbe.callbacks.clear()
    frameProbe.renderer.info.render.frame = 0
    frameProbe.renderer.info.render.calls = 0
    frameProbe.contextLost = false
  })

  it('等待当前渲染器真正绘制一帧后才通知，并只通知一次', () => {
    const onReady = vi.fn()
    render(<SceneFrameReady onReady={onReady} />)
    const afterFrame = () => act(() => { frameProbe.callbacks.forEach((callback) => callback()) })

    afterFrame()
    expect(onReady).not.toHaveBeenCalled()
    frameProbe.renderer.info.render.frame = 1
    afterFrame()
    expect(onReady).not.toHaveBeenCalled()

    frameProbe.renderer.info.render.calls = 4
    afterFrame()
    expect(onReady).toHaveBeenCalledOnce()
    expect(frameProbe.callbacks.size).toBe(0)
    afterFrame()
    expect(onReady).toHaveBeenCalledOnce()
  })

  it('Context 丢失时不误报，卸载会清理订阅，重新挂载等待新帧', () => {
    const onReady = vi.fn()
    const view = render(<SceneFrameReady onReady={onReady} />)
    frameProbe.renderer.info.render.frame = 1
    frameProbe.renderer.info.render.calls = 4
    frameProbe.contextLost = true
    act(() => { frameProbe.callbacks.forEach((callback) => callback()) })
    expect(onReady).not.toHaveBeenCalled()
    view.unmount()
    expect(frameProbe.callbacks.size).toBe(0)

    frameProbe.contextLost = false
    render(<SceneFrameReady onReady={onReady} />)
    act(() => { frameProbe.callbacks.forEach((callback) => callback()) })
    expect(onReady).not.toHaveBeenCalled()
    frameProbe.renderer.info.render.frame = 2
    act(() => { frameProbe.callbacks.forEach((callback) => callback()) })
    expect(onReady).toHaveBeenCalledOnce()
  })
})

describe('三维模型探索场景', () => {
  it('真实模型安全预览显示每头实际维度，并明确仅示意前两个 Head', () => {
    const store = createExplorerStore()
    store.getState().setTrace({
      ...verticalSliceTrace,
      source: 'onnx',
      model: { ...verticalSliceTrace.model, heads: 12, hiddenSize: 768 },
    })
    render(<Scene3DPanel store={store} isActive />)

    expect(screen.getByText('H1 · 64D')).toBeInTheDocument()
    expect(screen.getByText('H2 · 64D')).toBeInTheDocument()
    expect(screen.getByText(/图中仅示意前 2 个 Head；当前模型共有 12 个 Head，每个 64 维/)).toBeInTheDocument()
    expect(screen.getByText('LN · γ/β')).toBeInTheDocument()
    expect(screen.queryByText(/μ→0/)).not.toBeInTheDocument()
    expect(screen.queryByText('H1 · 4D')).not.toBeInTheDocument()

    act(() => store.getState().setTrace(verticalSliceTrace))
    expect(screen.getByText('H1 · 4D')).toBeInTheDocument()
    expect(screen.getByText('H2 · 4D')).toBeInTheDocument()
    expect(screen.getByText('LAYER NORM')).toBeInTheDocument()
    expect(screen.queryByText(/图中仅示意前 2 个 Head/)).not.toBeInTheDocument()
  })

  it('单 Head 轨迹预览不虚构第二个 Head', () => {
    const store = createExplorerStore()
    store.getState().setTrace({
      ...verticalSliceTrace,
      model: { ...verticalSliceTrace.model, heads: 1, hiddenSize: 8 },
    })
    render(<Scene3DPanel store={store} isActive />)
    expect(screen.getByText('H1 · 8D')).toBeInTheDocument()
    expect(screen.queryByText(/^H2 ·/)).not.toBeInTheDocument()
  })

  it('Trace 未就绪时显示不会阻塞其他视图的安全状态', () => {
    const store = createExplorerStore()
    render(<Scene3DPanel store={store} isActive />)

    expect(screen.getByRole('status')).toHaveTextContent('正在建立模型空间')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('无 WebGL 的测试环境使用可访问预览并呈现真实轨迹读数', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    render(<Scene3DPanel store={store} isActive />)

    expect(screen.getByRole('heading', { name: 'Transformer 微型观测场' })).toBeVisible()
    expect(screen.getByRole('img', { name: '三维场景安全预览' })).toBeVisible()
    expect(screen.getByText('把句子切成 Token')).toBeVisible()
    expect(screen.getByText('Tokenization')).toBeVisible()
    expect(screen.getByText('1 Block · 2 Heads · 6 Tokens')).toBeVisible()
  })

  it('实体快捷按钮把 Token、Head 与输出选择同步到共享状态', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    render(<Scene3DPanel store={store} isActive />)

    const tokenButton = screen.getByRole('button', {
      name: '三维实体：Token 4 deep',
    })
    await user.click(tokenButton)
    expect(store.getState()).toMatchObject({
      selectedTokenIndex: 3,
      selectedEntityId: 'token:3',
    })
    expect(tokenButton).toHaveAttribute('aria-pressed', 'true')

    const positionButton = screen.getByRole('button', {
      name: '三维实体：Position Embedding',
    })
    await user.click(positionButton)
    expect(store.getState().selectedEntityId).toBe('operation:position-embedding')
    expect(positionButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Position Embedding')).toBeVisible()

    const normalizationButton = screen.getByRole('button', {
      name: '三维实体：LayerNorm',
    })
    await user.click(normalizationButton)
    expect(store.getState().selectedEntityId).toBe('operation:layernorm')
    expect(normalizationButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('LayerNorm')).toBeVisible()

    const headButton = screen.getByRole('button', {
      name: '三维实体：Attention Head 2',
    })
    await user.click(headButton)
    expect(store.getState()).toMatchObject({
      selectedHeadIndex: 1,
      selectedEntityId: 'head:1',
    })
    expect(screen.getByText('Attention Head 2')).toBeVisible()

    const concatButton = screen.getByRole('button', {
      name: '三维实体：Multi-Head Concat',
    })
    await user.click(concatButton)
    expect(store.getState().selectedEntityId).toBe('operation:attention')
    expect(concatButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Masked Self-Attention')).toBeVisible()

    const mlpButton = screen.getByRole('button', {
      name: '三维实体：Feed-Forward MLP',
    })
    await user.click(mlpButton)
    expect(store.getState().selectedEntityId).toBe('operation:mlp')
    expect(mlpButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('Feed-Forward MLP')).toBeVisible()

    const residualButton = screen.getByRole('button', {
      name: '三维实体：MLP Residual',
    })
    await user.click(residualButton)
    expect(store.getState().selectedEntityId).toBe('operation:residual-mlp')
    expect(residualButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('MLP Residual')).toBeVisible()

    const outputButton = screen.getByRole('button', {
      name: '三维实体：输出 Token .',
    })
    await user.click(outputButton)
    expect(store.getState().selectedEntityId).toBe('output-token:12')
    expect(outputButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('步骤与相机模式变化会实时更新三维读数并允许返回引导视角', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    render(<Scene3DPanel store={store} isActive />)

    act(() => store.getState().goToStep(5))
    expect(screen.getByText('遮住未来 Token')).toBeVisible()
    expect(screen.getByText('Masked Self-Attention')).toBeVisible()

    const resetCamera = screen.getByRole('button', { name: '返回讲解视角' })
    expect(resetCamera).toBeDisabled()
    act(() => store.getState().setCameraMode('manual'))
    expect(resetCamera).toBeEnabled()
    expect(screen.getByText('手动观察')).toBeVisible()

    await user.click(resetCamera)
    expect(store.getState().cameraMode).toBe('guided')
    expect(screen.getByText('讲解视角')).toBeVisible()
    expect(resetCamera).toBeDisabled()
  })
})
