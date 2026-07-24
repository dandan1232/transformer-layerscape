import type { ExplorerStore } from './explorer-store'

export const selectCurrentStep = (state: ExplorerStore) =>
  state.trace?.steps[state.currentStepIndex] ?? null

export const selectCanGoPrevious = (state: ExplorerStore) =>
  state.trace !== null && state.currentStepIndex > 0

export const selectCanGoNext = (state: ExplorerStore) =>
  state.trace !== null && state.currentStepIndex < state.trace.steps.length - 1

export const selectSelectedEntity = (state: ExplorerStore) =>
  state.selectedEntityId && state.trace
    ? state.trace.entities[state.selectedEntityId] ?? null
    : null

export const selectCurrentEntities = (state: ExplorerStore) => {
  const step = selectCurrentStep(state)
  if (!step || !state.trace) return []
  return step.entityIds.flatMap((id) => {
    const entity = state.trace?.entities[id]
    return entity ? [entity] : []
  })
}
