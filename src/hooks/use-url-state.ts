import { useEffect } from 'react'
import type { ExplorerStoreApi } from '../store/explorer-store'
import { useStore } from 'zustand'

export function readInitialUrlState() {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  const result: { step?: number; mode?: 'guided' | 'explore' } = {}
  const step = params.get('step')
  if (step !== null && /^\d+$/.test(step) && Number.isSafeInteger(Number(step))) {
    result.step = Number(step)
  }
  const mode = params.get('mode')
  if (mode === 'guided' || mode === 'explore') result.mode = mode
  return result
}

export function useUrlStateSync(store: ExplorerStoreApi) {
  const currentStepIndex = useStore(store, (state) => state.currentStepIndex)
  const learningMode = useStore(store, (state) => state.mode)
  const traceStatus = useStore(store, (state) => state.traceStatus)

  useEffect(() => {
    if (typeof window === 'undefined' || traceStatus !== 'ready') return
    const url = new URL(window.location.href)
    url.searchParams.set('step', String(currentStepIndex))
    url.searchParams.set('mode', learningMode)
    if (url.href !== window.location.href) {
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      )
    }
  }, [currentStepIndex, learningMode, traceStatus])
}
