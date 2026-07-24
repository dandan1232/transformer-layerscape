export type LessonValidationIssueCode =
  | 'INVALID_ROOT'
  | 'UNSUPPORTED_VERSION'
  | 'INVALID_FIELD'
  | 'DUPLICATE_ID'
  | 'INVALID_REFERENCE'
  | 'INVALID_ORDER'
  | 'INCOMPLETE_TRACE_COVERAGE'

export interface LessonValidationIssue {
  readonly code: LessonValidationIssueCode
  readonly path: string
  readonly message: string
}

export class LessonValidationError extends Error {
  readonly issues: readonly LessonValidationIssue[]

  constructor(issues: readonly LessonValidationIssue[]) {
    super(`中文课程校验失败：${issues.map((issue) => issue.message).join('；')}`)
    this.name = 'LessonValidationError'
    this.issues = issues
  }
}
