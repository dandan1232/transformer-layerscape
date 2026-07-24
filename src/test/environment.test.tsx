import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import App from '../App'

describe('前端测试环境', () => {
  it('能够渲染 React 组件并模拟用户操作', async () => {
    const user = userEvent.setup()

    render(<App />)
    const button = screen.getByRole('button', { name: 'Count is 0' })

    await user.click(button)

    expect(screen.getByRole('heading', { name: 'Get started' })).toBeVisible()
    expect(button).toHaveTextContent('Count is 1')
  })
})
