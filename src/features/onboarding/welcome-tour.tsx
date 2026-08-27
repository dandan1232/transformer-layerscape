import { useCallback, useEffect, useRef, useState } from 'react'
import './welcome-tour.css'

const STORAGE_KEY = 'transformer-layerscape:tour-dismissed'

function isDismissed() {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return true
  }
}

export function WelcomeTour() {
  const [visible, setVisible] = useState(() => !isDismissed())
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (visible) dialogRef.current?.focus()
  }, [visible])

  const dismiss = useCallback(() => {
    setVisible(false)
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      /* 隐私模式下静默忽略 */
    }
  }, [])

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        dismiss()
      }
    },
    [dismiss],
  )

  if (!visible) return null

  return (
    <div className="welcome-tour__backdrop" onKeyDown={handleKeyDown}>
      <div ref={dialogRef} className="welcome-tour" role="dialog" aria-label="首次使用引导" tabIndex={-1}>
        <h2 className="welcome-tour__title">欢迎来到 Transformer 层境</h2>
        <p className="welcome-tour__lead">三分钟看懂一次 next-token prediction。</p>
        <ol className="welcome-tour__steps">
          <li><strong>课程面板</strong>：跟随中文讲解逐步理解每个计算阶段。</li>
          <li><strong>二维计算</strong>：查看真实的张量数值、注意力热力图和采样候选。</li>
          <li><strong>三维空间</strong>：旋转模型结构，点击实体与二维视图联动。</li>
        </ol>
        <button type="button" className="primary-action welcome-tour__start" onClick={dismiss}>
          开始学习
        </button>
        <p className="welcome-tour__hint">按 Esc 或点击"开始学习"可随时关闭</p>
      </div>
    </div>
  )
}
