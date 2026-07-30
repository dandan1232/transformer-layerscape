import type { RunInferencePayload } from '../../platform/model-runtime/worker-protocol'

export const REAL_MODEL_INPUT_LIMITS = {
  maxTokens: 12,
  layers: 6,
  vocabularySize: 50_257,
  temperature: { min: 0.2, max: 2 },
  topP: { min: 0.1, max: 1 },
  seed: { min: 0, max: 999_999 },
} as const

export interface RealModelExperimentDraft {
  readonly text: string
  readonly selectedLayerIndex: string
  readonly temperature: string
  readonly topK: string
  readonly topP: string
  readonly seed: string
}

export type RealModelExperimentField = keyof RealModelExperimentDraft

export type RealModelExperimentValidation =
  | { readonly ok: true; readonly payload: RunInferencePayload }
  | {
      readonly ok: false
      readonly errors: Partial<Record<RealModelExperimentField, string>>
    }

function numberFrom(value: string) {
  return value.trim().length > 0 ? Number(value) : Number.NaN
}

export function validateRealModelExperiment(
  draft: RealModelExperimentDraft,
): RealModelExperimentValidation {
  const errors: Partial<Record<RealModelExperimentField, string>> = {}
  const selectedLayerIndex = numberFrom(draft.selectedLayerIndex)
  const temperature = numberFrom(draft.temperature)
  const topK = numberFrom(draft.topK)
  const topP = numberFrom(draft.topP)
  const seed = numberFrom(draft.seed)

  if (draft.text.trim().length === 0) errors.text = '请输入要分析的英文文本。'
  if (
    !Number.isInteger(selectedLayerIndex) ||
    selectedLayerIndex < 0 ||
    selectedLayerIndex >= REAL_MODEL_INPUT_LIMITS.layers
  ) {
    errors.selectedLayerIndex = 'Layer 必须位于 1 到 6。'
  }
  if (
    !Number.isFinite(temperature) ||
    temperature < REAL_MODEL_INPUT_LIMITS.temperature.min ||
    temperature > REAL_MODEL_INPUT_LIMITS.temperature.max
  ) {
    errors.temperature = 'Temperature 必须位于 0.2 到 2。'
  }
  if (
    !Number.isInteger(topK) ||
    topK < 1 ||
    topK > REAL_MODEL_INPUT_LIMITS.vocabularySize
  ) {
    errors.topK = 'Top-k 必须是 1 到 50,257 的整数。'
  }
  if (
    !Number.isFinite(topP) ||
    topP < REAL_MODEL_INPUT_LIMITS.topP.min ||
    topP > REAL_MODEL_INPUT_LIMITS.topP.max
  ) {
    errors.topP = 'Top-p 必须位于 0.1 到 1。'
  }
  if (
    !Number.isInteger(seed) ||
    seed < REAL_MODEL_INPUT_LIMITS.seed.min ||
    seed > REAL_MODEL_INPUT_LIMITS.seed.max
  ) {
    errors.seed = 'Seed 必须是 0 到 999,999 的整数。'
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    payload: {
      text: draft.text,
      selectedLayerIndex,
      sampling: { temperature, topK, topP, seed },
    },
  }
}
