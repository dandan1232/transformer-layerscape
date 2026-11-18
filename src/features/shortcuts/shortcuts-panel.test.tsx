import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useCallback, useRef, useState } from 'react'
import { describe, expect, it } from 'vitest'
import { verticalSliceTrace } from '../../content/traces/vertical-slice-trace'
import { createExplorerStore, type ExplorerStoreApi } from '../../store/explorer-store'
import { ShortcutsPanel } from './shortcuts-panel'

function HelpHarness({ store }: { store: ExplorerStoreApi }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const show = useCallback(() => setOpen(true), [])
  const close = useCallback(() => setOpen(false), [])
  return <>
    <button ref={trigger} onClick={show}>打开帮助</button>
    <ShortcutsPanel open={open} onOpen={show} onClose={close} onRestartTour={close} returnFocusRef={trigger} store={store} />
  </>
}

function setup() {
  const store = createExplorerStore()
  store.getState().setTrace(verticalSliceTrace)
  render(<HelpHarness store={store} />)
  return store
}

describe('学习帮助和快捷键', () => {
  it('按 ? 键打开帮助，显示术语与快捷键，Esc 关闭后恢复按钮焦点', () => {
    setup()
    expect(screen.queryByRole('dialog', { name: '学习帮助' })).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: '?', shiftKey: true })
    expect(screen.getByRole('dialog', { name: '学习帮助' })).toBeVisible()
    expect(screen.getByText('Token · 词块')).toBeVisible()
    expect(screen.getByText('上一步 / 下一步')).toBeVisible()
    expect(screen.getByText('播放 / 暂停计算过程')).toBeVisible()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '打开帮助' })).toHaveFocus()
  })

  it('Tab 和 Shift+Tab 在帮助中循环，打开帮助后暂停学习快捷键', async () => {
    const store = setup()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: '打开帮助' }))
    const close = screen.getByRole('button', { name: '关闭学习帮助' })
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: '重新查看引导' })).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: ' ' })
    expect(store.getState().currentStepIndex).toBe(0)
    expect(store.getState().playback).toBe('paused')
  })

  it('方向键、空格和数字键实际控制步骤、播放与视图', () => {
    const store = setup()
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(store.getState().currentStepIndex).toBe(1)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(store.getState().currentStepIndex).toBe(0)
    fireEvent.keyDown(window, { key: ' ' })
    expect(store.getState().playback).toBe('playing')
    fireEvent.keyDown(window, { key: ' ' })
    expect(store.getState().playback).toBe('paused')
    for (const [key, view] of [['2', '2d'], ['3', '3d'], ['1', 'lesson']]) {
      fireEvent.keyDown(window, { key })
      expect(store.getState().view).toBe(view)
    }
  })

  it('输入、按钮、滑块和标签页保留原有按键行为，按钮上的 ? 仍可打开帮助', () => {
    const store = setup()
    const view = render(<>
      <input aria-label="输入" /><textarea aria-label="文本" /><select aria-label="选择"><option>选项</option></select>
      <button>原生按钮</button><div contentEditable suppressContentEditableWarning>编辑文字</div>
      <div role="slider" tabIndex={0} aria-label="滑块" /><div role="tab" tabIndex={0}>标签</div>
    </>)
    for (const control of Array.from(view.container.children)) {
      for (const key of ['ArrowRight', ' ', '2']) fireEvent.keyDown(control, { key })
    }
    expect(store.getState()).toMatchObject({ currentStepIndex: 0, playback: 'paused', view: 'lesson' })
    fireEvent.keyDown(screen.getByRole('textbox', { name: '输入' }), { key: '?' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('button', { name: '原生按钮' }), { key: '?' })
    expect(screen.getByRole('dialog', { name: '学习帮助' })).toBeVisible()
  })

  it('忽略组合键、自动重复、输入法组合和其他弹窗中的快捷键', () => {
    const store = setup()
    for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { repeat: true }, { isComposing: true }]) {
      fireEvent.keyDown(window, { key: 'ArrowRight', ...options })
    }
    expect(store.getState().currentStepIndex).toBe(0)
    render(<div role="dialog" aria-modal="true" aria-label="其他弹窗" />)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: '?' })
    expect(store.getState().currentStepIndex).toBe(0)
    expect(screen.queryByRole('dialog', { name: '学习帮助' })).not.toBeInTheDocument()
  })
})
