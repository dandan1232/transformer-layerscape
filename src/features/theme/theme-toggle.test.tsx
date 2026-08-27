import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ThemeToggle } from './theme-toggle'

describe('主题切换', () => {
  beforeEach(() => {
    localStorage.removeItem('transformer-layerscape:theme')
    delete document.documentElement.dataset.theme
  })

  it('点击切换按钮更新 data-theme 并保存偏好', () => {
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: '切换到浅色主题' })
    fireEvent.click(button)
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(localStorage.getItem('transformer-layerscape:theme')).toBe('light')
  })

  it('再次点击切回深色', () => {
    localStorage.setItem('transformer-layerscape:theme', 'light')
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: '切换到深色主题' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
