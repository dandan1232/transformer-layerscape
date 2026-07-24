export type TraceValidationCode =
  | 'INVALID_ROOT'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_FIELD'
  | 'INVALID_ID'
  | 'DUPLICATE_ID'
  | 'INVALID_REFERENCE'
  | 'INVALID_SHAPE'
  | 'INVALID_VALUE'
  | 'INVALID_PROBABILITY'
  | 'INVALID_CAUSAL_MASK'

export interface TraceValidationIssue {
  readonly code: TraceValidationCode
  readonly path: string
  readonly message: string
}

export class TraceValidationError extends Error {
  readonly issues: readonly TraceValidationIssue[]

  constructor(issues: readonly TraceValidationIssue[]) {
    super(`模型轨迹校验失败，共 ${issues.length} 项问题。`)
    this.name = 'TraceValidationError'
    this.issues = issues
  }
}
