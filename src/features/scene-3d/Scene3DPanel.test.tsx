import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { verticalSliceTrace } from '../../content/traces/vertical-slice-trace'
import { createExplorerStore } from '../../store/explorer-store'
import { Scene3DPanel } from './Scene3DPanel'

describe('三维模型探索场景', () => {
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

    const headButton = screen.getByRole('button', {
      name: '三维实体：Attention Head 2',
    })
    await user.click(headButton)
    expect(store.getState()).toMatchObject({
      selectedHeadIndex: 1,
      selectedEntityId: 'head:1',
    })
    expect(screen.getByText('Attention Head 2')).toBeVisible()

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

    act(() => store.getState().goToStep(3))
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
