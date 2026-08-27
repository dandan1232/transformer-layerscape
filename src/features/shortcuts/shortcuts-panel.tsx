import { useCallback, useEffect, useRef, useState } from 'react'
import './shortcuts-panel.css'

const SHORTCUTS = [
  { keys: ['←', '→'], label: '上一步 / 下一步' },
  { keys: ['Space'], label: '播放 / 暂停计算过程' },
  { keys: ['1'], label: '切换到课程面板' },
  { keys: ['2'], label: '切换到二维计算' },
  { keys: ['3'], label: '切换到三维空间' },
  { keys: ['?'], label: '打开快捷键面板' },
  { keys: ['Esc'], label: '关闭面板 / 浮层' },
] as const

export function ShortcutsPanel() {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  const toggle = useCallback(() => setOpen((current) => !current), [])
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return
      if (event.key === '?' && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        toggle()
      }
      if (event.key === 'Escape' && open) {
        event.stopPropagation()
        close()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, toggle, close])

  useEffect(() => {
    if (open) dialogRef.current?.focus()
  }, [open])

  if (!open) return null

  return (
    <div className="shortcuts-backdrop" onClick={close}>
      <div
        ref={dialogRef}
        className="shortcuts-panel"
        role="dialog"
        aria-label="键盘快捷键"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => { if (event.key === 'Escape') close() }}
      >
        <h2 className="shortcuts-panel__title">键盘快捷键</h2>
        <ul className="shortcuts-panel__list">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.label} className="shortcuts-panel__item">
              <span className="shortcuts-panel__keys">
                {shortcut.keys.map((key) => (
                  <kbd key={key}>{key}</kbd>
                ))}
              </span>
              <span className="shortcuts-panel__label">{shortcut.label}</span>
            </li>
          ))}
        </ul>
        <button type="button" className="primary-action shortcuts-panel__close" onClick={close}>
          知道了
        </button>
      </div>
    </div>
  )
}
