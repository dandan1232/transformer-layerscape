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
    if (
      !canAnimate ||
      !containerRef.current ||
      previousStepRef.current === stepIndex ||
      reducedMotion
    ) {
      previousStepRef.current = stepIndex
      return
    }

    const element = containerRef.current!
    const direction = stepIndex > previousStepRef.current ? 1 : -1
    previousStepRef.current = stepIndex

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
