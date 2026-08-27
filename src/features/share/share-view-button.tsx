import { Check, Share2 } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

export function ShareViewButton() {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const handleShare = useCallback(() => {
    const url = window.location.href
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true)
        clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => setCopied(false), 1500)
      },
      () => {},
    )
  }, [])

  return (
    <button
      type="button"
      className="topbar__tools share-view-button"
      aria-label="复制当前视图链接"
      title="复制当前视图链接，发给别人可直接看到这一步"
      onClick={handleShare}
    >
      {copied ? <Check size={17} aria-hidden="true" /> : <Share2 size={17} aria-hidden="true" />}
    </button>
  )
}
