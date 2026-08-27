import { useEffect } from 'react'
import type { ExplorerStoreApi } from '../store/explorer-store'
import { useStore } from 'zustand'

export function readInitialUrlState() {
  if (typeof window === 'undefined') return {}
  const params = new URLSearchParams(window.location.search)
  const result: { step?: number; mode?: 'guided' | 'explore' } = {}
  const step = Number(params.get('step'))
  if (Number.isFinite(step) && step >= 0) result.step = step
  if (params.get('mode') === 'explore') result.mode = 'explore'
  return result
}

export function useUrlStateSync(store: ExplorerStoreApi) {
  const currentStepIndex = useStore(store, (state) => state.currentStepIndex)
  const learningMode = useStore(store, (state) => state.mode)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams()
    params.set('step', String(currentStepIndex))
    if (learningMode === 'explore') params.set('mode', 'explore')
    const url = `${window.location.pathname}?${params.toString()}`
    window.history.replaceState(null, '', url)
  }, [currentStepIndex, learningMode])
}
