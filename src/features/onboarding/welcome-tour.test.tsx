import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { WelcomeTour } from './welcome-tour'

describe('首次使用引导', () => {
  beforeEach(() => {
    localStorage.removeItem('transformer-layerscape:tour-dismissed')
  })

  it('首次访问时展示引导对话框并可通过按钮关闭', () => {
    render(<WelcomeTour />)
    expect(screen.getByRole('dialog', { name: '首次使用引导' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '开始学习' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('关闭后再次渲染不再展示引导', () => {
    localStorage.setItem('transformer-layerscape:tour-dismissed', 'true')
    render(<WelcomeTour />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('按 Escape 键也可关闭引导并记住状态', () => {
    render(<WelcomeTour />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(localStorage.getItem('transformer-layerscape:tour-dismissed')).toBe('true')
  })
})
