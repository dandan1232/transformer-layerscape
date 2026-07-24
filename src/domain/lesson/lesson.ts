import type { TraceEntityId, TraceStepId } from '../trace/trace'

export const LESSON_SCHEMA_VERSION = 1 as const

export type LessonId = string
export type LessonChapterId = string
export type LessonStepId = string

export interface LessonAction {
  readonly traceStepId: TraceStepId
  readonly selectEntityId?: TraceEntityId
  readonly cameraTargetId?: TraceEntityId
  readonly twoDTargetId?: TraceEntityId
}

export interface LessonFormulaSymbol {
  readonly symbol: string
  readonly meaning: string
}

export interface LessonFormula {
  readonly expression: string
  readonly symbols: readonly LessonFormulaSymbol[]
}

export interface LessonTensorShape {
  readonly expression: string
  readonly explanation: string
}

export interface LessonDeepDive {
  readonly title: string
  readonly explanation: string
  readonly formula?: LessonFormula
  readonly tensorShape?: LessonTensorShape
  readonly pseudocode?: readonly string[]
}

export interface LessonStep {
  readonly id: LessonStepId
  readonly kicker: string
  readonly title: string
  readonly plainExplanation: string
  readonly action: LessonAction
  readonly deepDive: LessonDeepDive
}

export interface LessonChapter {
  readonly id: LessonChapterId
  readonly title: string
  readonly shortTitle: string
  readonly summary: string
  readonly steps: readonly LessonStep[]
}

export interface Lesson {
  readonly schemaVersion: typeof LESSON_SCHEMA_VERSION
  readonly id: LessonId
  readonly locale: 'zh-CN'
  readonly title: string
  readonly description: string
  readonly chapters: readonly LessonChapter[]
}
