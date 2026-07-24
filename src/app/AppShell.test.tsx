import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AppShell } from './AppShell'

describe('中文学习工作台外壳', () => {
  it('提供课程、二维计算、三维空间和时间轴语义区域', async () => {
    const user = userEvent.setup()
    render(<AppShell />)

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
    render(<AppShell />)

    const guidedButton = screen.getByRole('button', { name: '引导学习' })
    const exploreButton = screen.getByRole('button', { name: '自由探索' })

    expect(guidedButton).toHaveAttribute('aria-pressed', 'true')
    await user.click(exploreButton)

    expect(guidedButton).toHaveAttribute('aria-pressed', 'false')
    expect(exploreButton).toHaveAttribute('aria-pressed', 'true')
  })

  it('开始观察会进入二维计算并移动焦点', async () => {
    const user = userEvent.setup()
    render(<AppShell />)

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
    render(<AppShell />)

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
})
