import type { ModelTrace, TraceEntityId } from '../../domain/trace/trace'

export type ScenePosition = readonly [number, number, number]

export interface SceneEntityLayout {
  readonly id: TraceEntityId
  readonly position: ScenePosition
  readonly kind: 'token' | 'operation' | 'attention-head' | 'output-token'
}

export interface SceneLayout {
  readonly tokens: readonly SceneEntityLayout[]
  readonly heads: readonly SceneEntityLayout[]
  readonly operations: readonly SceneEntityLayout[]
  readonly output: SceneEntityLayout
  readonly byId: Readonly<Record<TraceEntityId, SceneEntityLayout>>
}

export interface CameraPose {
  readonly position: ScenePosition
  readonly target: ScenePosition
}

export function createSceneLayout(trace: ModelTrace): SceneLayout {
  const tokenSpacing = Math.min(1.25, 6.5 / Math.max(1, trace.input.tokens.length - 1))
  const firstTokenX = -((trace.input.tokens.length - 1) * tokenSpacing) / 2
  const tokens = trace.input.tokens.map((_, index): SceneEntityLayout => ({
    id: `token:${index}`,
    kind: 'token',
    position: [firstTokenX + index * tokenSpacing, -1.65, 1.7],
  }))
  const heads = Array.from({ length: trace.model.heads }, (_, index): SceneEntityLayout => ({
    id: `head:${index}`,
    kind: 'attention-head',
    position: [0.2, (index - (trace.model.heads - 1) / 2) * 1.25, -0.15],
  }))
  const operations: SceneEntityLayout[] = [
    { id: 'operation:tokenize', kind: 'operation', position: [0, -1.65, 1.7] },
    { id: 'operation:embedding', kind: 'operation', position: [0, -1.05, 1.05] },
    { id: 'operation:qkv', kind: 'operation', position: [-1.35, 0, 0.35] },
    { id: 'operation:attention', kind: 'operation', position: [0.2, 0, -0.15] },
    { id: 'operation:output', kind: 'operation', position: [2.75, 0, -0.5] },
  ]
  const output: SceneEntityLayout = {
    id: `output-token:${trace.output.sampledTokenId}`,
    kind: 'output-token',
    position: [4.05, 0, -0.72],
  }
  const all = [...tokens, ...heads, ...operations, output]

  return {
    tokens,
    heads,
    operations,
    output,
    byId: Object.fromEntries(all.map((entity) => [entity.id, entity])),
  }
}

export function getSceneFocus(
  layout: SceneLayout,
  entityId: TraceEntityId | null,
): ScenePosition {
  return entityId ? layout.byId[entityId]?.position ?? [0, 0, 0] : [0, 0, 0]
}

export function getGuidedCameraPose(focus: ScenePosition): CameraPose {
  return {
    target: focus,
    position: [focus[0] + 5.8, focus[1] + 4.2, focus[2] + 7.2],
  }
}

export function getCameraTransitionAlpha(
  deltaSeconds: number,
  reducedMotion: boolean,
) {
  if (reducedMotion) return 1
  const safeDelta = Number.isFinite(deltaSeconds)
    ? Math.min(Math.max(deltaSeconds, 0), 0.1)
    : 0
  return 1 - Math.exp(-safeDelta * 4.8)
}
