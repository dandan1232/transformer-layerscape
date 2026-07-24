import type { Lesson, LessonChapter, LessonStep, LessonStepId } from '../../domain/lesson/lesson'
import type { TraceStepId } from '../../domain/trace/trace'
import type { ExplorerStoreApi } from '../../store/explorer-store'

export interface LessonStepContext {
  readonly chapter: LessonChapter
  readonly chapterIndex: number
  readonly step: LessonStep
  readonly stepIndex: number
  readonly lessonStepIndex: number
  readonly totalLessonSteps: number
}

export function flattenLessonSteps(lesson: Lesson): readonly LessonStep[] {
  return lesson.chapters.flatMap((chapter) => chapter.steps)
}

export function findLessonStepContext(
  lesson: Lesson,
  traceStepId: TraceStepId | null,
): LessonStepContext | null {
  const totalLessonSteps = flattenLessonSteps(lesson).length
  let lessonStepIndex = 0

  for (const [chapterIndex, chapter] of lesson.chapters.entries()) {
    for (const [stepIndex, step] of chapter.steps.entries()) {
      if (step.action.traceStepId === traceStepId) {
        return {
          chapter,
          chapterIndex,
          step,
          stepIndex,
          lessonStepIndex,
          totalLessonSteps,
        }
      }
      lessonStepIndex += 1
    }
  }

  return null
}

export function getAdjacentLessonStep(
  lesson: Lesson,
  currentStepId: LessonStepId,
  offset: -1 | 1,
): LessonStep | null {
  const steps = flattenLessonSteps(lesson)
  const currentIndex = steps.findIndex((step) => step.id === currentStepId)
  return currentIndex < 0 ? null : steps[currentIndex + offset] ?? null
}

export function navigateToLessonStep(
  store: ExplorerStoreApi,
  lesson: Lesson,
  lessonStepId: LessonStepId,
): void {
  const lessonStep = flattenLessonSteps(lesson).find((step) => step.id === lessonStepId)
  if (!lessonStep) throw new Error(`课程项 ${lessonStepId} 不存在。`)

  const trace = store.getState().trace
  if (!trace) throw new Error('模型轨迹尚未就绪，不能执行课程动作。')

  const traceStepIndex = trace.steps.findIndex(
    (step) => step.id === lessonStep.action.traceStepId,
  )
  if (traceStepIndex < 0) {
    throw new Error(`课程引用的 TraceStep ${lessonStep.action.traceStepId} 不存在。`)
  }

  const state = store.getState()
  state.goToStep(traceStepIndex)
  if (lessonStep.action.selectEntityId) {
    store.getState().selectEntity(lessonStep.action.selectEntityId)
  }
  store.getState().setCameraMode('guided')
}
