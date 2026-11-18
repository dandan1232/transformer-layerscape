import { useCallback, useState, type RefObject } from 'react'
import { useDialogFocus } from '../../hooks/use-dialog-focus'
import { isWelcomeTourDismissed, WELCOME_TOUR_STORAGE_KEY } from './welcome-tour-state'
import './welcome-tour.css'

export function WelcomeTour({
  open,
  onClose,
  returnFocusRef,
}: {
  open?: boolean
  onClose?: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
} = {}) {
  const [initiallyVisible, setInitiallyVisible] = useState(() => !isWelcomeTourDismissed())
  const visible = open ?? initiallyVisible

  const dismiss = useCallback(() => {
    setInitiallyVisible(false)
    onClose?.()
    try {
      localStorage.setItem(WELCOME_TOUR_STORAGE_KEY, 'true')
    } catch {
      /* 隐私模式下静默忽略 */
    }
  }, [onClose])
  const dialogRef = useDialogFocus(visible, dismiss, returnFocusRef)

  if (!visible) return null

  return (
    <div className="welcome-tour__backdrop">
      <div ref={dialogRef} className="welcome-tour" role="dialog" aria-modal="true" aria-label="首次使用引导" tabIndex={-1}>
        <h2 className="welcome-tour__title">欢迎来到 Transformer 层境</h2>
        <p className="welcome-tour__lead">跟随计算过程，理解模型如何预测下一个词块。</p>
        <ol className="welcome-tour__steps">
          <li><strong>课程面板</strong>：跟随中文讲解逐步理解每个计算阶段。</li>
          <li><strong>二维计算</strong>：查看真实的张量数值、注意力热力图和采样候选。</li>
          <li><strong>三维空间</strong>：旋转模型结构，点击实体与二维视图联动。</li>
        </ol>
        <button type="button" className="primary-action welcome-tour__start" onClick={dismiss}>
          开始学习
        </button>
        <p className="welcome-tour__hint">按 Esc 或点击“开始学习”关闭；之后可从帮助中重新查看。</p>
      </div>
    </div>
  )
}
