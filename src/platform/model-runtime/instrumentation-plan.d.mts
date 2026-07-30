export type DistilGpt2TraceStage =
  | 'embedding'
  | 'layer-norm'
  | 'qkv'
  | 'attention'
  | 'residual'
  | 'mlp'

export interface DistilGpt2PromotedOutput {
  readonly outputName: string
  readonly tensorName: string
  readonly branchTensorNames?: Readonly<Partial<Record<'else_branch' | 'then_branch', string>>>
  readonly stage: DistilGpt2TraceStage
  readonly layerIndex: number | null
}

export interface DistilGpt2ExistingTraceOutput {
  readonly outputName: string
  readonly stage: 'qkv'
  readonly layerIndex: number
  readonly semanticName: 'key' | 'value'
}

export const DISTILGPT2_LAYER_COUNT: 6
export const DISTILGPT2_PROMOTED_OUTPUTS: readonly DistilGpt2PromotedOutput[]
export const DISTILGPT2_EXISTING_TRACE_OUTPUTS: readonly DistilGpt2ExistingTraceOutput[]
