import { useEffect, useRef } from 'react'
import gsap from 'gsap'

export function useStepTransition(
  stepIndex: number,
  reducedMotion: boolean,
) {
  const containerRef = useRef<HTMLElement | null>(null)
  const previousStepRef = useRef(stepIndex)

  function attachRef(element: HTMLElement | null) {
    containerRef.current = element
  }

  const canAnimate =
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function' &&
    !navigator.webdriver

  useEffect(() => {
    const element = containerRef.current
    if (!element || previousStepRef.current === stepIndex) {
      previousStepRef.current = stepIndex
      return
    }

    const direction = stepIndex > previousStepRef.current ? 1 : -1
    previousStepRef.current = stepIndex
    element.scrollTop = 0

    if (!canAnimate || reducedMotion) return

    try {
      gsap.fromTo(
        element,
        { x: 12 * direction },
        { x: 0, duration: 0.36, ease: 'power2.out', overwrite: true },
      )
    } catch {
      element.style.transform = ''
    }
  }, [stepIndex, reducedMotion, canAnimate])

  return attachRef
}
