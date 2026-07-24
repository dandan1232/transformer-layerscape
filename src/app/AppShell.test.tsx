import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { verticalSliceTrace } from '../content/traces/vertical-slice-trace'
import { createExplorerStore } from '../store/explorer-store'
import { AppShell } from './AppShell'

function renderAppShell() {
  const store = createExplorerStore()
  return { store, ...render(<AppShell store={store} />) }
}

describe('中文学习工作台外壳', () => {
  it('提供课程、二维计算、三维空间和时间轴语义区域', async () => {
    const user = userEvent.setup()
    renderAppShell()

    expect(
      screen.getByRole('heading', { name: '让文字成为模型能读懂的坐标' }),
    ).toBeVisible()

    await user.click(screen.getByRole('tab', { name: '二维计算' }))
    expect(screen.getByRole('heading', { name: 'Token → Attention' })).toBeVisible()

    await user.click(screen.getByRole('tab', { name: '三维空间' }))
    expect(
      screen.getByRole('heading', { name: 'Transformer 微型观测场' }),
    ).toBeVisible()
    expect(screen.getByRole('contentinfo', { name: '计算时间轴' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '跳到主要内容' })).toHaveAttribute(
      'href',
      '#main-content',
    )
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

  it('开始观察会进入二维计算并移动焦点', async () => {
    const user = userEvent.setup()
    renderAppShell()

    await user.click(screen.getByRole('button', { name: '开始观察' }))

    expect(screen.getByRole('tab', { name: '二维计算' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Token → Attention' })).toHaveFocus()
    })
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

  it('时间轴使用统一 Store 导航、播放和重置', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    render(<AppShell store={store} />)

    expect(screen.getByText('步骤 01 / 08')).toBeVisible()
    expect(screen.getByRole('contentinfo', { name: '计算时间轴' })).toHaveTextContent(
      '把句子切成 Token',
    )
    expect(screen.getByRole('button', { name: '上一步' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '下一步' }))
    expect(screen.getByText('步骤 02 / 08')).toBeVisible()
    expect(screen.getByRole('contentinfo', { name: '计算时间轴' })).toHaveTextContent(
      '查找 Token 向量',
    )

    await user.click(screen.getByRole('button', { name: '播放计算过程' }))
    expect(screen.getByRole('button', { name: '暂停计算过程' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.getByText('步骤 01 / 08')).toBeVisible()
    expect(store.getState().playback).toBe('paused')
  })
})
