import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ShortcutsPanel } from './shortcuts-panel'

describe('键盘快捷键面板', () => {
  it('按 ? 键打开面板，按 Esc 关闭', () => {
    render(<ShortcutsPanel />)
    expect(screen.queryByRole('dialog', { name: '键盘快捷键' })).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: '?' })
    expect(screen.getByRole('dialog', { name: '键盘快捷键' })).toBeVisible()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('列出常用快捷键说明', () => {
    render(<ShortcutsPanel />)
    fireEvent.keyDown(window, { key: '?' })
    expect(screen.getByText('上一步 / 下一步')).toBeInTheDocument()
    expect(screen.getByText('播放 / 暂停计算过程')).toBeInTheDocument()
  })
})
