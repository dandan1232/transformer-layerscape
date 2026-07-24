import { describe, expect, it } from 'vitest'
import { coreLesson } from '../../content/lessons/core-lesson'
import { verticalSliceTrace } from '../../content/traces/vertical-slice-trace'
import type { Lesson, LessonStep } from './lesson'
import {
  LessonValidationError,
  type LessonValidationIssueCode,
} from './lesson-validation-error'
import { validateLesson } from './lesson-validator'

function expectIssue(value: unknown, code: LessonValidationIssueCode) {
  try {
    validateLesson(value, verticalSliceTrace)
  } catch (error) {
    expect(error).toBeInstanceOf(LessonValidationError)
    expect((error as LessonValidationError).issues.some((issue) => issue.code === code)).toBe(
      true,
    )
    return
  }
  throw new Error(`预期课程校验产生 ${code}`)
}

function cloneLesson(): Lesson {
  return structuredClone(coreLesson) as Lesson
}

describe('中文课程校验器', () => {
  it('接受覆盖完整 Trace 的三章中文课程', () => {
    expect(() => validateLesson(coreLesson, verticalSliceTrace)).not.toThrow()
    expect(coreLesson.chapters).toHaveLength(3)
    expect(
      coreLesson.chapters.reduce((total, chapter) => total + chapter.steps.length, 0),
    ).toBe(8)
  })

  it('拒绝非对象根节点和未知版本', () => {
    expectIssue(null, 'INVALID_ROOT')

    const lesson = structuredClone(coreLesson)
    Object.assign(lesson, { schemaVersion: 99 })
    expectIssue(lesson, 'UNSUPPORTED_VERSION')
  })

  it('拒绝空章节和不完整深入内容', () => {
    const noChapters = structuredClone(coreLesson)
    Object.assign(noChapters, { chapters: [] })
    expectIssue(noChapters, 'INVALID_FIELD')

    const brokenDeepDive = structuredClone(coreLesson)
    Object.assign(brokenDeepDive.chapters[0].steps[0].deepDive, {
      tensorShape: undefined,
      pseudocode: undefined,
    })
    expectIssue(brokenDeepDive, 'INVALID_FIELD')
  })

  it('拒绝重复课程项 ID 和重复 TraceStep 引用', () => {
    const lesson = structuredClone(coreLesson)
    Object.assign(lesson.chapters[0].steps[1], {
      id: lesson.chapters[0].steps[0].id,
      action: lesson.chapters[0].steps[0].action,
    })
    expectIssue(lesson, 'DUPLICATE_ID')
  })

  it('拒绝不存在的 TraceStep 与实体引用', () => {
    const missingTraceStep = structuredClone(coreLesson)
    Object.assign(missingTraceStep.chapters[0].steps[0].action, {
      traceStepId: 'step:missing',
    })
    expectIssue(missingTraceStep, 'INVALID_REFERENCE')

    const missingEntity = structuredClone(coreLesson)
    Object.assign(missingEntity.chapters[0].steps[0].action, {
      selectEntityId: 'operation:missing',
    })
    expectIssue(missingEntity, 'INVALID_REFERENCE')
  })

  it('拒绝与 Trace 计算顺序不一致的课程项', () => {
    const lesson = structuredClone(coreLesson)
    const firstAction = lesson.chapters[0].steps[0].action
    const secondAction = lesson.chapters[0].steps[1].action
    Object.assign(lesson.chapters[0].steps[0], { action: secondAction })
    Object.assign(lesson.chapters[0].steps[1], { action: firstAction })

    expectIssue(lesson, 'INVALID_ORDER')
  })

  it('拒绝没有覆盖全部 TraceStep 的课程', () => {
    const lesson = structuredClone(coreLesson)
    const outputSteps = lesson.chapters[2].steps as LessonStep[]
    outputSteps.pop()

    expectIssue(lesson, 'INCOMPLETE_TRACE_COVERAGE')
  })

  it('公式必须解释符号，伪代码不能包含空行', () => {
    const brokenFormula = structuredClone(coreLesson) as Lesson
    Object.assign(brokenFormula.chapters[1].steps[0].deepDive.formula ?? {}, {
      symbols: [],
    })
    expectIssue(brokenFormula, 'INVALID_FIELD')

    const brokenPseudocode = structuredClone(coreLesson)
    Object.assign(brokenPseudocode.chapters[2].steps[2].deepDive, {
      pseudocode: ['candidate = sample()', ''],
    })
    expectIssue(brokenPseudocode, 'INVALID_FIELD')
  })

  it('拒绝缺失根字段、错误语言和非对象章节', () => {
    const missingRootFields = cloneLesson()
    Object.assign(missingRootFields, { id: '', locale: 'en-US' })
    expectIssue(missingRootFields, 'INVALID_FIELD')

    const invalidChapter = cloneLesson()
    Object.assign(invalidChapter, { chapters: [null] })
    expectIssue(invalidChapter, 'INVALID_FIELD')
  })

  it('拒绝重复章节、空章节和非对象课程项', () => {
    const duplicateChapter = cloneLesson()
    Object.assign(duplicateChapter.chapters[1], {
      id: duplicateChapter.chapters[0].id,
    })
    expectIssue(duplicateChapter, 'DUPLICATE_ID')

    const emptyChapter = cloneLesson()
    Object.assign(emptyChapter.chapters[0], { steps: [] })
    expectIssue(emptyChapter, 'INVALID_FIELD')

    const invalidStep = cloneLesson()
    Object.assign(invalidStep.chapters[0], { steps: [null] })
    expectIssue(invalidStep, 'INVALID_FIELD')
  })

  it('拒绝空课程项字段与错误动作结构', () => {
    const emptyTitle = cloneLesson()
    Object.assign(emptyTitle.chapters[0].steps[0], { title: '' })
    expectIssue(emptyTitle, 'INVALID_FIELD')

    const invalidAction = cloneLesson()
    Object.assign(invalidAction.chapters[0].steps[0], { action: null })
    expectIssue(invalidAction, 'INVALID_FIELD')

    const missingTraceReference = cloneLesson()
    Object.assign(missingTraceReference.chapters[0].steps[0], {
      action: { traceStepId: '', selectEntityId: '' },
    })
    expectIssue(missingTraceReference, 'INVALID_FIELD')
  })

  it('拒绝错误的深入内容、张量形状与公式结构', () => {
    const invalidDeepDive = cloneLesson()
    Object.assign(invalidDeepDive.chapters[0].steps[0], { deepDive: null })
    expectIssue(invalidDeepDive, 'INVALID_FIELD')

    const missingDeepDiveText = cloneLesson()
    Object.assign(missingDeepDiveText.chapters[0].steps[0].deepDive, {
      title: '',
      explanation: '',
    })
    expectIssue(missingDeepDiveText, 'INVALID_FIELD')

    const invalidTensorShape = cloneLesson()
    Object.assign(invalidTensorShape.chapters[0].steps[0].deepDive, {
      tensorShape: 'invalid',
    })
    expectIssue(invalidTensorShape, 'INVALID_FIELD')

    const emptyTensorShape = cloneLesson()
    Object.assign(emptyTensorShape.chapters[0].steps[0].deepDive, {
      tensorShape: { expression: '', explanation: '' },
    })
    expectIssue(emptyTensorShape, 'INVALID_FIELD')

    const invalidFormula = cloneLesson()
    Object.assign(invalidFormula.chapters[1].steps[0].deepDive, { formula: 'invalid' })
    expectIssue(invalidFormula, 'INVALID_FIELD')

    const invalidFormulaContent = cloneLesson()
    Object.assign(invalidFormulaContent.chapters[1].steps[0].deepDive, {
      formula: { expression: '', symbols: [{ symbol: '', meaning: '' }] },
    })
    expectIssue(invalidFormulaContent, 'INVALID_FIELD')
  })
})
