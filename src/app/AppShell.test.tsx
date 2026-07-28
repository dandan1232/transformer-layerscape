import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { verticalSliceTrace } from '../content/traces/vertical-slice-trace'
import { createExplorerStore } from '../store/explorer-store'
import { AppShell } from './AppShell'

function renderAppShell({ withTrace = false } = {}) {
  const store = createExplorerStore()
  if (withTrace) store.getState().setTrace(verticalSliceTrace)
  return { store, ...render(<AppShell store={store} />) }
}

describe('中文学习工作台外壳', () => {
  it('提供课程、二维计算、三维空间和时间轴语义区域', async () => {
    const user = userEvent.setup()
    renderAppShell({ withTrace: true })

    expect(
      screen.getByRole('heading', { name: '把句子切成模型的词块' }),
    ).toBeVisible()

    await user.click(screen.getByRole('tab', { name: '二维计算' }))
    expect(screen.getByRole('heading', { name: '把句子切成 Token' })).toBeVisible()

    await user.click(screen.getByRole('tab', { name: '三维空间' }))
    expect(
      await screen.findByRole('heading', { name: 'Transformer 微型观测场' }),
    ).toBeVisible()
    expect(screen.getByRole('contentinfo', { name: '计算时间轴' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '跳到主要内容' })).toHaveAttribute(
      'href',
      '#main-content',
    )
    expect(screen.getByText('2D 安全模式')).toBeInTheDocument()
  })

  it('模型轨迹加载失败时显示独立错误信息并允许重试', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    const requestId = store.getState().beginTraceLoad()
    store.getState().failTraceLoad(requestId, '教学 Trace 校验失败')
    const onRetryTrace = vi.fn()
    render(<AppShell store={store} onRetryTrace={onRetryTrace} />)

    expect(screen.getByRole('alert', { name: '模型轨迹加载失败' })).toHaveTextContent(
      '教学 Trace 校验失败',
    )
    await user.click(screen.getByRole('button', { name: '重新加载案例' }))
    expect(onRetryTrace).toHaveBeenCalledOnce()
  })

  it('可以切换学习模式', async () => {
    const user = userEvent.setup()
    renderAppShell()

    const guidedButton = screen.getByRole('button', { name: '引导学习' })
    const exploreButton = screen.getByRole('button', { name: '自由探索' })

    expect(guidedButton).toHaveAttribute('aria-pressed', 'true')
    await user.click(exploreButton)

    expect(guidedButton).toHaveAttribute('aria-pressed', 'false')
    expect(exploreButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('中文课程前后导航会同步 Trace 步骤和选中实体', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    render(<AppShell store={store} />)

    await user.click(screen.getByRole('button', { name: '下一项' }))

    expect(
      screen.getByRole('heading', { name: '把编号换成可以计算的向量' }),
    ).toBeVisible()
    expect(screen.getByText('步骤 02 / 14')).toBeVisible()
    expect(store.getState().selectedEntityId).toBe('operation:embedding')

    await user.click(screen.getByRole('button', { name: '上一项' }))
    expect(screen.getByRole('heading', { name: '把句子切成模型的词块' })).toBeVisible()
  })

  it('章节入口跳到章节首项，深入内容不会改变 Trace 步骤', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    render(<AppShell store={store} />)

    await user.click(screen.getByRole('button', { name: '跳到Attention章节' }))
    expect(screen.getByRole('heading', { name: '先把每个 Token 调到稳定尺度' })).toBeVisible()
    expect(store.getState().currentStepIndex).toBe(3)

    await user.click(screen.getByText('深入理解：零均值与单位方差'))
    expect(screen.getByText('x̂ = (x − μ) / √(σ² + ε)，y = γx̂ + β')).toBeVisible()
    expect(store.getState().currentStepIndex).toBe(3)

    await user.click(screen.getByRole('button', { name: '下一项' }))
    expect(screen.getByRole('heading', { name: '为信息准备三种角色' })).toBeVisible()
    await user.click(screen.getByText('深入理解：线性投影'))
    expect(screen.getByText('Q = X̂W_Q，K = X̂W_K，V = X̂W_V')).toBeVisible()
    expect(screen.getByText('经过 LayerNorm 的隐藏向量')).toBeVisible()
    expect(store.getState().currentStepIndex).toBe(4)
  })

  it('课程未加载时禁用动作并展示安全的首项内容', () => {
    renderAppShell()

    expect(screen.getByRole('heading', { name: '把句子切成模型的词块' })).toBeVisible()
    expect(screen.getByRole('button', { name: '下一项' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '跳到Token章节' })).toBeDisabled()
    expect(screen.getByText('课程项 1 / 14')).toBeVisible()
  })

  it('移动视图标签支持点击和方向键切换', async () => {
    const user = userEvent.setup()
    renderAppShell()

    const lessonTab = screen.getByRole('tab', { name: '课程' })
    const calculationTab = screen.getByRole('tab', { name: '二维计算' })
    const sceneTab = screen.getByRole('tab', { name: '三维空间' })

    await user.click(calculationTab)
    expect(calculationTab).toHaveAttribute('aria-selected', 'true')
    expect(lessonTab).toHaveAttribute('aria-selected', 'false')

    await user.keyboard('{ArrowRight}')
    expect(sceneTab).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => {
      expect(sceneTab).toHaveFocus()
    })
  })

  it('移动标签点击二维计算会切换可见面板', async () => {
    const user = userEvent.setup()
    renderAppShell({ withTrace: true })

    await user.click(screen.getByRole('tab', { name: '二维计算' }))
    expect(screen.getByRole('tab', { name: '二维计算' })).toHaveAttribute(
      'aria-selected', 'true',
    )
    expect(screen.getByRole('heading', { name: '把句子切成 Token' })).toBeVisible()
  })

  it('三维实体选择会与二维视图共享同一个 Attention Head', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().goToStep(5)
    store.getState().setView('3d')
    render(<AppShell store={store} />)

    await user.click(
      await screen.findByRole('button', { name: '三维实体：Attention Head 2' }),
    )
    expect(store.getState()).toMatchObject({
      selectedEntityId: 'head:1',
      selectedHeadIndex: 1,
    })

    await user.click(screen.getByRole('tab', { name: '二维计算' }))
    expect(screen.getByRole('button', { name: 'Head 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('img', { name: /^Attention Head 2 权重矩阵/ })).toBeVisible()
    await user.click(screen.getByRole('tab', { name: '课程' }))
    expect(
      screen.getByRole('complementary', { name: '当前联动焦点' }),
    ).toHaveTextContent('Attention Head 2')
  })

  it('二维 Token 选择会同步三维高亮与课程焦点说明', async () => {
    const user = userEvent.setup()
    const { store } = renderAppShell({ withTrace: true })

    await user.click(screen.getByRole('tab', { name: '二维计算' }))
    await user.click(
      screen.getByRole('button', { name: '选择 Token 4：deep，ID 9' }),
    )

    expect(store.getState()).toMatchObject({
      selectedEntityId: 'token:3',
      selectedTokenIndex: 3,
    })
    await user.click(screen.getByRole('tab', { name: '课程' }))
    expect(screen.getByRole('complementary', { name: '当前联动焦点' })).toHaveTextContent(
      'deep输入序列中的第 4 个 Token。',
    )
    await user.click(screen.getByRole('tab', { name: '三维空间' }))
    expect(
      await screen.findByRole('button', { name: '三维实体：Token 4 deep' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('时间轴使用统一 Store 导航、播放和重置', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    render(<AppShell store={store} />)

    expect(screen.getByText('步骤 01 / 14')).toBeVisible()
    expect(screen.getByRole('contentinfo', { name: '计算时间轴' })).toHaveTextContent(
      '把句子切成 Token',
    )
    expect(screen.getByRole('button', { name: '上一步' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByText('步骤 02 / 14')).toBeVisible()
    expect(screen.getByRole('contentinfo', { name: '计算时间轴' })).toHaveTextContent(
      '查找 Token 向量',
    )

    await user.click(screen.getByRole('button', { name: '播放计算过程' }))
    expect(screen.getByRole('button', { name: '暂停计算过程' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.getByText('步骤 01 / 14')).toBeVisible()
    expect(store.getState().playback).toBe('paused')
  })

  it('时间轴滑块支持键盘定位、拖动定位并重置到当前章节起点', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    render(<AppShell store={store} />)

    const scrubber = screen.getByRole('slider', { name: '定位模型计算步骤' })
    expect(scrubber).toHaveValue('1')
    scrubber.focus()
    await user.keyboard('{ArrowRight}')
    expect(store.getState().currentStepIndex).toBe(1)
    expect(scrubber).toHaveValue('2')

    await user.click(screen.getByRole('button', { name: '播放计算过程' }))
    fireEvent.change(scrubber, { target: { value: '6' } })
    expect(store.getState()).toMatchObject({
      currentStepIndex: 5,
      playback: 'paused',
    })
    expect(scrubber).toHaveAttribute(
      'aria-valuetext',
      '第 6 步，共 14 步：遮住未来 Token',
    )

    await user.click(screen.getByRole('button', { name: '重置' }))
    expect(store.getState().currentStepIndex).toBe(3)
    expect(scrubber).toHaveValue('4')
    expect(screen.getByRole('button', { name: '重置' })).toBeDisabled()
    expect(
      screen.getByRole('heading', { name: '先把每个 Token 调到稳定尺度' }),
    ).toBeVisible()
  })
})
