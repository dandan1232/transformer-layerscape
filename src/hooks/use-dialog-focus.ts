import { useEffect, useRef, type RefObject } from 'react'

const focusableSelector = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])'

export function useDialogFocus(
  open: boolean,
  onClose: () => void,
  returnFocusRef?: RefObject<HTMLElement | null>,
) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!open || !dialog) return
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const returnTarget = returnFocusRef?.current ?? previouslyFocused
    const controls = () => Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
      .filter((element) => !element.closest('[hidden], [inert], [aria-hidden="true"]'))
    const focusFirst = () => (controls()[0] ?? dialog).focus()
    focusFirst()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const elements = controls()
      const first = elements[0]
      const last = elements.at(-1)
      const active = document.activeElement
      if (!first || !last) {
        event.preventDefault()
        dialog.focus()
      } else if (!dialog.contains(active) || active === dialog) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
      } else if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusFirst()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', containFocus)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', containFocus)
      if (returnTarget?.isConnected) returnTarget.focus()
    }
  }, [open, onClose, returnFocusRef])

  return dialogRef
}
