import { useEffect, type RefObject } from 'react'
import { X } from 'lucide-react'
import { useDialogFocus } from '../../hooks/use-dialog-focus'
import type { ExplorerStoreApi, ExplorerView } from '../../store/explorer-store'
import './shortcuts-panel.css'

const SHORTCUTS = [
  { keys: ['←', '→'], label: '上一步 / 下一步' },
  { keys: ['Space'], label: '播放 / 暂停计算过程' },
  { keys: ['1'], label: '切换到课程面板' },
  { keys: ['2'], label: '切换到二维计算' },
  { keys: ['3'], label: '切换到三维空间' },
  { keys: ['?'], label: '打开学习帮助' },
  { keys: ['Esc'], label: '关闭帮助 / 使用引导' },
] as const

const TERMS = [
  ['Token · 词块', '模型处理文字的小单位，可能是一个字、词的一部分或标点。'],
  ['Embedding · 词块向量', '把词块编号换成一组可计算的数字，用来表示它的特征。'],
  ['Attention · 注意力', '决定当前位置从哪些已出现的词块读取信息，以及各读多少。'],
  ['Head · 注意力头', '一组独立的信息观察方式；多个头的结果会合并。'],
  ['Block · 模型层', '一组重复的计算步骤，包含注意力、前馈网络和残差连接。'],
  ['LayerNorm · 层归一化', '调整每个词块向量的数值尺度，帮助后续计算保持稳定。'],
  ['MLP · 前馈网络', '对每个词块单独加工特征，通常先扩展维度再缩回。'],
  ['Residual · 残差连接', '让输入绕过一段计算，再与计算结果相加，保留原有信息。'],
  ['Temperature · 温度', '控制候选概率的集中程度；越低通常越集中，越高越分散。'],
  ['Top-k / Top-p · 候选筛选', 'Top-k 保留固定数量的高分候选；Top-p 按累计概率保留候选。'],
  ['Seed · 随机种子', '固定抽样的随机起点；相同输入、参数和种子便于复现实验。'],
] as const

const editingSelector = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
const nativeControlSelector = 'button, a, summary, [role="button"], [role="slider"], [role="tab"], [role="radio"], [role="combobox"], [role="spinbutton"]'

export function ShortcutsPanel({
  open,
  onOpen,
  onClose,
  onRestartTour,
  returnFocusRef,
  store,
}: {
  open: boolean
  onOpen: () => void
  onClose: () => void
  onRestartTour: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
  store: ExplorerStoreApi
}) {
  const dialogRef = useDialogFocus(open, onClose, returnFocusRef)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target instanceof Element ? event.target : document.activeElement
      if (target?.closest(editingSelector)) return
      if (open || document.querySelector('[role="dialog"], dialog[open]')) return
      if (event.key === '?') {
        event.preventDefault()
        onOpen()
        return
      }
      if (event.shiftKey || target?.closest(nativeControlSelector)) return
      const state = store.getState()
      switch (event.key) {
        case 'ArrowLeft': state.previousStep(); break
        case 'ArrowRight': state.nextStep(); break
        case ' ':
          if (state.playback === 'playing') state.pausePlayback()
          else state.startPlayback()
          break
        case '1':
        case '2':
        case '3': {
          const views: ExplorerView[] = ['lesson', '2d', '3d']
          state.setView(views[Number(event.key) - 1])
          break
        }
        default: return
      }
      event.preventDefault()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpen, store])

  if (!open) return null

  return (
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div
        ref={dialogRef}
        className="shortcuts-panel"
        role="dialog"
        aria-modal="true"
        aria-label="学习帮助"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shortcuts-panel__header">
          <h2 className="shortcuts-panel__title">学习帮助</h2>
          <button type="button" className="shortcuts-panel__dismiss" aria-label="关闭学习帮助" onClick={onClose}>
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <p className="shortcuts-panel__lead">先跟随课程阅读，再在二维计算和三维空间中观察同一步。</p>
        <h3 className="shortcuts-panel__section-title">常用术语</h3>
        <dl className="shortcuts-panel__terms">
          {TERMS.map(([term, explanation]) => (
            <div key={term}><dt>{term}</dt><dd>{explanation}</dd></div>
          ))}
        </dl>
        <h3 className="shortcuts-panel__section-title">键盘快捷键</h3>
        <p className="shortcuts-panel__hint">焦点在按钮、输入框或其他控件上时，保留控件原有按键操作。输入文字或打开弹窗时，暂停学习快捷键。</p>
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
        <button type="button" className="primary-action shortcuts-panel__close" onClick={onRestartTour}>
          重新查看引导
        </button>
      </div>
    </div>
  )
}
