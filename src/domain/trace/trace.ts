export const TRACE_SCHEMA_VERSION = 1 as const

export type TraceEntityId = string
export type TraceStepId = string

export type TraceSource = 'preset' | 'onnx'

export type TraceEntityKind =
  | 'token'
  | 'operation'
  | 'attention-head'
  | 'output-token'

export type TracePhase = 'token' | 'embedding' | 'attention' | 'feed-forward' | 'output'

export type TraceOperation =
  | 'tokenize'
  | 'embed'
  | 'add-position-embedding'
  | 'layer-normalize'
  | 'project-qkv'
  | 'apply-causal-mask'
  | 'weighted-sum'
  | 'add-attention-residual'
  | 'normalize-feed-forward'
  | 'feed-forward'
  | 'add-mlp-residual'
  | 'project-logits'
  | 'softmax'
  | 'sample-token'

export type TensorRole =
  | 'token-ids'
  | 'token-embedding'
  | 'position-embedding'
  | 'embedding'
  | 'block-input'
  | 'normalized'
  | 'query'
  | 'key'
  | 'value'
  | 'attention-mask'
  | 'attention-weights'
  | 'attention-head-output'
  | 'attention-concatenated'
  | 'attention-output'
  | 'attention-residual'
  | 'feed-forward-normalized'
  | 'mlp-expanded'
  | 'mlp-activated'
  | 'mlp-output'
  | 'block-output'
  | 'logits'
  | 'probabilities'

export type TensorDType = 'float32' | 'int32' | 'bool'

export type TensorSampleMethod = 'full' | 'head' | 'stride' | 'aggregate'

export interface TraceEntity {
  readonly id: TraceEntityId
  readonly kind: TraceEntityKind
  readonly label: string
  readonly description?: string
  readonly parentId?: TraceEntityId
  readonly tokenIndex?: number
  readonly layerIndex?: number
  readonly headIndex?: number
}

export interface TensorSummary {
  readonly id: TraceEntityId
  readonly role: TensorRole
  readonly name: string
  readonly dtype: TensorDType
  readonly shape: readonly number[]
  readonly values: readonly number[]
  readonly sampleMethod: TensorSampleMethod
  readonly min?: number
  readonly max?: number
  readonly mean?: number
}

export interface TraceStep {
  readonly id: TraceStepId
  readonly phase: TracePhase
  readonly operation: TraceOperation
  readonly title: string
  readonly description: string
  readonly entityIds: readonly TraceEntityId[]
  readonly inputTensorIds: readonly TraceEntityId[]
  readonly outputTensorIds: readonly TraceEntityId[]
  readonly durationMs: number
}

export interface TraceCandidate {
  readonly tokenId: number
  readonly token: string
  readonly logit: number
  readonly probability: number
}

export interface ModelTrace {
  readonly schemaVersion: typeof TRACE_SCHEMA_VERSION
  readonly source: TraceSource
  readonly metadata: {
    readonly id: string
    readonly title: string
    readonly description: string
    readonly locale: 'zh-CN'
  }
  readonly model: {
    readonly id: string
    readonly displayName: string
    readonly layers: number
    readonly heads: number
    readonly hiddenSize: number
    readonly vocabularySize: number
  }
  readonly input: {
    readonly text: string
    readonly tokenIds: readonly number[]
    readonly tokens: readonly string[]
  }
  readonly entities: Readonly<Record<TraceEntityId, TraceEntity>>
  readonly tensors: Readonly<Record<TraceEntityId, TensorSummary>>
  readonly steps: readonly TraceStep[]
  readonly output: {
    readonly logitsTensorId: TraceEntityId
    readonly probabilitiesTensorId: TraceEntityId
    readonly sampledTokenId: number
    readonly sampledToken: string
    readonly defaultSampling: {
      readonly temperature: number
      readonly topK: number
      readonly topP: number
      readonly seed: number
    }
    readonly candidates: readonly TraceCandidate[]
  }
}

export interface TraceLoadOptions {
  readonly signal?: AbortSignal
}

export interface TraceAdapter {
  load(options?: TraceLoadOptions): Promise<ModelTrace>
}
