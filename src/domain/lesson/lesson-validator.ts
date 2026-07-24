import type { ModelTrace } from '../trace/trace'
import {
  LESSON_SCHEMA_VERSION,
  type Lesson,
  type LessonAction,
  type LessonDeepDive,
  type LessonStep,
} from './lesson'
import {
  LessonValidationError,
  type LessonValidationIssue,
  type LessonValidationIssueCode,
} from './lesson-validation-error'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function validateLessonAction(
  value: unknown,
  path: string,
  addIssue: (code: LessonValidationIssueCode, path: string, message: string) => void,
): value is LessonAction {
  if (!isRecord(value)) {
    addIssue('INVALID_FIELD', path, '课程动作必须是对象')
    return false
  }

  if (!isNonEmptyString(value.traceStepId)) {
    addIssue('INVALID_FIELD', `${path}.traceStepId`, '课程动作必须提供 TraceStep ID')
  }

  for (const key of ['selectEntityId', 'cameraTargetId', 'twoDTargetId'] as const) {
    if (value[key] !== undefined && !isNonEmptyString(value[key])) {
      addIssue('INVALID_FIELD', `${path}.${key}`, `${key} 必须是非空实体 ID`)
    }
  }

  return true
}

function validateDeepDive(
  value: unknown,
  path: string,
  addIssue: (code: LessonValidationIssueCode, path: string, message: string) => void,
): value is LessonDeepDive {
  if (!isRecord(value)) {
    addIssue('INVALID_FIELD', path, '深入内容必须是对象')
    return false
  }

  if (!isNonEmptyString(value.title)) {
    addIssue('INVALID_FIELD', `${path}.title`, '深入内容必须提供标题')
  }
  if (!isNonEmptyString(value.explanation)) {
    addIssue('INVALID_FIELD', `${path}.explanation`, '深入内容必须解释技术信息')
  }

  if (value.tensorShape !== undefined) {
    if (!isRecord(value.tensorShape)) {
      addIssue('INVALID_FIELD', `${path}.tensorShape`, '张量形状必须是对象')
    } else {
      if (!isNonEmptyString(value.tensorShape.expression)) {
        addIssue('INVALID_FIELD', `${path}.tensorShape.expression`, '张量形状表达式不能为空')
      }
      if (!isNonEmptyString(value.tensorShape.explanation)) {
        addIssue('INVALID_FIELD', `${path}.tensorShape.explanation`, '张量形状必须附带中文解释')
      }
    }
  }

  if (value.formula !== undefined) {
    if (!isRecord(value.formula)) {
      addIssue('INVALID_FIELD', `${path}.formula`, '公式必须是对象')
    } else {
      if (!isNonEmptyString(value.formula.expression)) {
        addIssue('INVALID_FIELD', `${path}.formula.expression`, '公式表达式不能为空')
      }
      if (!Array.isArray(value.formula.symbols) || value.formula.symbols.length === 0) {
        addIssue('INVALID_FIELD', `${path}.formula.symbols`, '公式必须解释至少一个符号')
      } else {
        value.formula.symbols.forEach((symbol, index) => {
          if (
            !isRecord(symbol) ||
            !isNonEmptyString(symbol.symbol) ||
            !isNonEmptyString(symbol.meaning)
          ) {
            addIssue(
              'INVALID_FIELD',
              `${path}.formula.symbols[${index}]`,
              '公式符号必须包含符号和中文含义',
            )
          }
        })
      }
    }
  }

  if (value.pseudocode !== undefined) {
    if (
      !Array.isArray(value.pseudocode) ||
      value.pseudocode.length === 0 ||
      value.pseudocode.some((line) => !isNonEmptyString(line))
    ) {
      addIssue('INVALID_FIELD', `${path}.pseudocode`, '伪代码必须包含非空文本行')
    }
  }

  if (
    value.tensorShape === undefined &&
    value.formula === undefined &&
    value.pseudocode === undefined
  ) {
    addIssue('INVALID_FIELD', path, '深入内容至少需要张量形状、公式或伪代码之一')
  }

  return true
}

function validateLessonStep(
  value: unknown,
  path: string,
  addIssue: (code: LessonValidationIssueCode, path: string, message: string) => void,
): value is LessonStep {
  if (!isRecord(value)) {
    addIssue('INVALID_FIELD', path, '课程项必须是对象')
    return false
  }

  for (const key of ['id', 'kicker', 'title', 'plainExplanation'] as const) {
    if (!isNonEmptyString(value[key])) {
      addIssue('INVALID_FIELD', `${path}.${key}`, `课程项 ${key} 不能为空`)
    }
  }
  validateLessonAction(value.action, `${path}.action`, addIssue)
  validateDeepDive(value.deepDive, `${path}.deepDive`, addIssue)
  return true
}

export function validateLesson(value: unknown, trace: ModelTrace): asserts value is Lesson {
  const issues: LessonValidationIssue[] = []
  const addIssue = (
    code: LessonValidationIssueCode,
    path: string,
    message: string,
  ) => issues.push({ code, path, message })

  if (!isRecord(value)) {
    throw new LessonValidationError([
      { code: 'INVALID_ROOT', path: '$', message: '课程根节点必须是对象' },
    ])
  }

  if (value.schemaVersion !== LESSON_SCHEMA_VERSION) {
    addIssue(
      'UNSUPPORTED_VERSION',
      '$.schemaVersion',
      `只支持课程版本 ${LESSON_SCHEMA_VERSION}`,
    )
  }
  for (const key of ['id', 'title', 'description'] as const) {
    if (!isNonEmptyString(value[key])) {
      addIssue('INVALID_FIELD', `$.${key}`, `课程 ${key} 不能为空`)
    }
  }
  if (value.locale !== 'zh-CN') {
    addIssue('INVALID_FIELD', '$.locale', '首期课程语言必须是 zh-CN')
  }
  if (!Array.isArray(value.chapters) || value.chapters.length === 0) {
    addIssue('INVALID_FIELD', '$.chapters', '课程至少需要一个章节')
  }

  const chapterIds = new Set<string>()
  const lessonStepIds = new Set<string>()
  const traceStepIds = new Set<string>()
  const orderedTraceIndexes: number[] = []
  const knownTraceStepIds = new Map(trace.steps.map((step, index) => [step.id, index]))
  const knownEntityIds = new Set(Object.keys(trace.entities))

  if (Array.isArray(value.chapters)) {
    value.chapters.forEach((chapter, chapterIndex) => {
      const chapterPath = `$.chapters[${chapterIndex}]`
      if (!isRecord(chapter)) {
        addIssue('INVALID_FIELD', chapterPath, '章节必须是对象')
        return
      }

      for (const key of ['id', 'title', 'shortTitle', 'summary'] as const) {
        if (!isNonEmptyString(chapter[key])) {
          addIssue('INVALID_FIELD', `${chapterPath}.${key}`, `章节 ${key} 不能为空`)
        }
      }
      if (isNonEmptyString(chapter.id)) {
        if (chapterIds.has(chapter.id)) {
          addIssue('DUPLICATE_ID', `${chapterPath}.id`, `章节 ID ${chapter.id} 重复`)
        }
        chapterIds.add(chapter.id)
      }
      if (!Array.isArray(chapter.steps) || chapter.steps.length === 0) {
        addIssue('INVALID_FIELD', `${chapterPath}.steps`, '每个章节至少需要一个课程项')
        return
      }

      chapter.steps.forEach((step, stepIndex) => {
        const stepPath = `${chapterPath}.steps[${stepIndex}]`
        if (!validateLessonStep(step, stepPath, addIssue)) return

        if (isNonEmptyString(step.id)) {
          if (lessonStepIds.has(step.id)) {
            addIssue('DUPLICATE_ID', `${stepPath}.id`, `课程项 ID ${step.id} 重复`)
          }
          lessonStepIds.add(step.id)
        }

        if (!isRecord(step.action) || !isNonEmptyString(step.action.traceStepId)) return
        const traceIndex = knownTraceStepIds.get(step.action.traceStepId)
        if (traceIndex === undefined) {
          addIssue(
            'INVALID_REFERENCE',
            `${stepPath}.action.traceStepId`,
            `TraceStep ${step.action.traceStepId} 不存在`,
          )
        } else {
          orderedTraceIndexes.push(traceIndex)
        }
        if (traceStepIds.has(step.action.traceStepId)) {
          addIssue(
            'DUPLICATE_ID',
            `${stepPath}.action.traceStepId`,
            `TraceStep ${step.action.traceStepId} 被多个课程项引用`,
          )
        }
        traceStepIds.add(step.action.traceStepId)

        for (const key of ['selectEntityId', 'cameraTargetId', 'twoDTargetId'] as const) {
          const id = step.action[key]
          if (isNonEmptyString(id) && !knownEntityIds.has(id)) {
            addIssue(
              'INVALID_REFERENCE',
              `${stepPath}.action.${key}`,
              `实体 ${id} 不存在`,
            )
          }
        }
      })
    })
  }

  if (orderedTraceIndexes.some((index, position) => position > 0 && index <= orderedTraceIndexes[position - 1])) {
    addIssue('INVALID_ORDER', '$.chapters', '课程项必须按照 TraceStep 的计算顺序排列')
  }

  const missingTraceSteps = trace.steps
    .filter((step) => !traceStepIds.has(step.id))
    .map((step) => step.id)
  if (missingTraceSteps.length > 0) {
    addIssue(
      'INCOMPLETE_TRACE_COVERAGE',
      '$.chapters',
      `课程尚未覆盖 TraceStep：${missingTraceSteps.join('、')}`,
    )
  }

  if (issues.length > 0) throw new LessonValidationError(issues)
}
