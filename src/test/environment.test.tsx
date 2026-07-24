import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'

describe('前端测试环境', () => {
  it('能够渲染应用并模拟用户操作', async () => {
    const user = userEvent.setup()

    render(<App />)
    const exploreButton = screen.getByRole('button', { name: '自由探索' })

    await user.click(exploreButton)

    expect(
      screen.getByRole('heading', { name: '把句子切成模型的词块' }),
    ).toBeVisible()
    expect(exploreButton).toHaveAttribute('aria-pressed', 'true')
  })
})
