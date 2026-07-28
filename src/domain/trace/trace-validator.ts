import {
  TRACE_SCHEMA_VERSION,
  type ModelTrace,
  type TensorDType,
  type TensorRole,
  type TensorSampleMethod,
  type TraceEntityKind,
  type TraceOperation,
  type TracePhase,
  type TraceSource,
} from './trace'
import {
  TraceValidationError,
  type TraceValidationCode,
  type TraceValidationIssue,
} from './trace-validation-error'

type UnknownRecord = Record<string, unknown>

interface ValidatedTensor {
  readonly id: string
  readonly role: TensorRole
  readonly shape: readonly number[]
  readonly values: readonly number[]
  readonly sampleMethod: TensorSampleMethod
}

interface ValidatedModel {
  readonly layers: number
  readonly heads: number
  readonly hiddenSize: number
  readonly vocabularySize: number
}

const traceSources = new Set<TraceSource>(['preset', 'onnx'])
const entityKinds = new Set<TraceEntityKind>([
  'token',
  'operation',
  'attention-head',
  'output-token',
])
const tensorRoles = new Set<TensorRole>([
  'token-ids',
  'token-embedding',
  'position-embedding',
  'embedding',
  'normalized',
  'query',
  'key',
  'value',
  'attention-mask',
  'attention-weights',
  'attention-head-output',
  'attention-output',
  'logits',
  'probabilities',
])
const tensorDTypes = new Set<TensorDType>(['float32', 'int32', 'bool'])
const sampleMethods = new Set<TensorSampleMethod>([
  'full',
  'head',
  'stride',
  'aggregate',
])
const tracePhases = new Set<TracePhase>([
  'token',
  'embedding',
  'attention',
  'output',
])
const traceOperations = new Set<TraceOperation>([
  'tokenize',
  'embed',
  'add-position-embedding',
  'layer-normalize',
  'project-qkv',
  'apply-causal-mask',
  'weighted-sum',
  'project-logits',
  'softmax',
  'sample-token',
])
const traceIdPattern = /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9:.-]*$/
const probabilityTolerance = 1e-5

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function addIssue(
  issues: TraceValidationIssue[],
  code: TraceValidationCode,
  path: string,
  message: string,
) {
  issues.push({ code, path, message })
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function readStringArray(
  value: unknown,
  path: string,
  issues: TraceValidationIssue[],
): string[] {
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
    addIssue(issues, 'INVALID_FIELD', path, '必须是非空字符串数组。')
    return []
  }
  return value
}

function readFiniteNumberArray(
  value: unknown,
  path: string,
  issues: TraceValidationIssue[],
): number[] {
  if (
    !Array.isArray(value) ||
    !value.every((item) => typeof item === 'number' && Number.isFinite(item))
  ) {
    addIssue(issues, 'INVALID_VALUE', path, '必须是有限数字数组。')
    return []
  }
  return value
}

function product(values: readonly number[]) {
  return values.reduce((result, value) => result * value, 1)
}

function approximatelyEqual(left: number, right: number) {
  return Math.abs(left - right) <= probabilityTolerance
}

function validateMetadata(root: UnknownRecord, issues: TraceValidationIssue[]) {
  if (!isRecord(root.metadata)) {
    addIssue(issues, 'INVALID_FIELD', 'metadata', '必须是对象。')
    return
  }

  for (const key of ['id', 'title', 'description'] as const) {
    if (!isNonEmptyString(root.metadata[key])) {
      addIssue(issues, 'INVALID_FIELD', `metadata.${key}`, '必须是非空字符串。')
    }
  }
  if (root.metadata.locale !== 'zh-CN') {
    addIssue(issues, 'INVALID_FIELD', 'metadata.locale', '当前版本必须为 zh-CN。')
  }
}

function validateModel(root: UnknownRecord, issues: TraceValidationIssue[]) {
  if (!isRecord(root.model)) {
    addIssue(issues, 'INVALID_FIELD', 'model', '必须是对象。')
    return null
  }

  for (const key of ['id', 'displayName'] as const) {
    if (!isNonEmptyString(root.model[key])) {
      addIssue(issues, 'INVALID_FIELD', `model.${key}`, '必须是非空字符串。')
    }
  }

  for (const key of ['layers', 'heads', 'hiddenSize', 'vocabularySize'] as const) {
    if (!isPositiveInteger(root.model[key])) {
      addIssue(issues, 'INVALID_FIELD', `model.${key}`, '必须是正整数。')
    }
  }

  const heads = isPositiveInteger(root.model.heads) ? root.model.heads : 0
  const layers = isPositiveInteger(root.model.layers) ? root.model.layers : 0
  const hiddenSize = isPositiveInteger(root.model.hiddenSize)
    ? root.model.hiddenSize
    : 0
  const vocabularySize = isPositiveInteger(root.model.vocabularySize)
    ? root.model.vocabularySize
    : 0

  if (heads > 0 && hiddenSize > 0 && hiddenSize % heads !== 0) {
    addIssue(
      issues,
      'INVALID_SHAPE',
      'model.hiddenSize',
      'Hidden Size 必须可以被 Head 数量整除。',
    )
  }

  return { layers, heads, hiddenSize, vocabularySize }
}

function validateInput(root: UnknownRecord, issues: TraceValidationIssue[]) {
  if (!isRecord(root.input)) {
    addIssue(issues, 'INVALID_FIELD', 'input', '必须是对象。')
    return { tokenIds: [] as number[], tokens: [] as string[] }
  }

  if (!isNonEmptyString(root.input.text)) {
    addIssue(issues, 'INVALID_FIELD', 'input.text', '必须是非空字符串。')
  }

  const tokenIds = readFiniteNumberArray(root.input.tokenIds, 'input.tokenIds', issues)
  const tokens = readStringArray(root.input.tokens, 'input.tokens', issues)

  if (!tokenIds.every(isNonNegativeInteger)) {
    addIssue(issues, 'INVALID_VALUE', 'input.tokenIds', 'Token ID 必须是非负整数。')
  }
  if (tokenIds.length !== tokens.length) {
    addIssue(
      issues,
      'INVALID_SHAPE',
      'input.tokens',
      'Token 文本数量必须与 Token ID 数量一致。',
    )
  }
  if (tokens.length === 0 || tokens.length > 12) {
    addIssue(issues, 'INVALID_SHAPE', 'input.tokens', 'Token 数量必须在 1 到 12 之间。')
  }

  return { tokenIds, tokens }
}

function validateEntities(
  root: UnknownRecord,
  tokenCount: number,
  model: ValidatedModel | null,
  issues: TraceValidationIssue[],
) {
  const entityIds = new Set<string>()
  const parentReferences: Array<{ path: string; id: string }> = []

  if (!isRecord(root.entities)) {
    addIssue(issues, 'INVALID_FIELD', 'entities', '必须是对象。')
    return entityIds
  }

  for (const [key, value] of Object.entries(root.entities)) {
    const path = `entities.${key}`
    if (!traceIdPattern.test(key)) {
      addIssue(issues, 'INVALID_ID', path, '实体 ID 格式不合法。')
    }
    if (!isRecord(value)) {
      addIssue(issues, 'INVALID_FIELD', path, '实体必须是对象。')
      continue
    }
    if (value.id !== key) {
      addIssue(issues, 'INVALID_ID', `${path}.id`, '实体 ID 必须与对象键一致。')
    }
    if (!entityKinds.has(value.kind as TraceEntityKind)) {
      addIssue(issues, 'INVALID_FIELD', `${path}.kind`, '实体类型不受支持。')
    }
    if (!isNonEmptyString(value.label)) {
      addIssue(issues, 'INVALID_FIELD', `${path}.label`, '必须是非空字符串。')
    }
    if (value.description !== undefined && !isNonEmptyString(value.description)) {
      addIssue(issues, 'INVALID_FIELD', `${path}.description`, '必须是非空字符串。')
    }
    if (value.parentId !== undefined) {
      if (!isNonEmptyString(value.parentId)) {
        addIssue(issues, 'INVALID_REFERENCE', `${path}.parentId`, '父实体 ID 不合法。')
      } else {
        parentReferences.push({ path: `${path}.parentId`, id: value.parentId })
      }
    }
    for (const indexKey of ['tokenIndex', 'layerIndex', 'headIndex'] as const) {
      if (value[indexKey] !== undefined && !isNonNegativeInteger(value[indexKey])) {
        addIssue(issues, 'INVALID_VALUE', `${path}.${indexKey}`, '索引必须是非负整数。')
      }
    }
    if (
      isNonNegativeInteger(value.tokenIndex) &&
      value.tokenIndex >= tokenCount
    ) {
      addIssue(issues, 'INVALID_VALUE', `${path}.tokenIndex`, 'Token 索引越界。')
    }
    if (
      model &&
      isNonNegativeInteger(value.layerIndex) &&
      value.layerIndex >= model.layers
    ) {
      addIssue(issues, 'INVALID_VALUE', `${path}.layerIndex`, 'Layer 索引越界。')
    }
    if (
      model &&
      isNonNegativeInteger(value.headIndex) &&
      value.headIndex >= model.heads
    ) {
      addIssue(issues, 'INVALID_VALUE', `${path}.headIndex`, 'Head 索引越界。')
    }
    entityIds.add(key)
  }

  for (const reference of parentReferences) {
    if (!entityIds.has(reference.id)) {
      addIssue(issues, 'INVALID_REFERENCE', reference.path, '引用的父实体不存在。')
    }
  }

  return entityIds
}

function validateTensors(root: UnknownRecord, issues: TraceValidationIssue[]) {
  const tensors = new Map<string, ValidatedTensor>()

  if (!isRecord(root.tensors)) {
    addIssue(issues, 'INVALID_FIELD', 'tensors', '必须是对象。')
    return tensors
  }

  for (const [key, value] of Object.entries(root.tensors)) {
    const path = `tensors.${key}`
    if (!traceIdPattern.test(key)) {
      addIssue(issues, 'INVALID_ID', path, 'Tensor ID 格式不合法。')
    }
    if (!isRecord(value)) {
      addIssue(issues, 'INVALID_FIELD', path, 'Tensor 必须是对象。')
      continue
    }
    if (value.id !== key) {
      addIssue(issues, 'INVALID_ID', `${path}.id`, 'Tensor ID 必须与对象键一致。')
    }
    if (!tensorRoles.has(value.role as TensorRole)) {
      addIssue(issues, 'INVALID_FIELD', `${path}.role`, 'Tensor 角色不受支持。')
    }
    if (!isNonEmptyString(value.name)) {
      addIssue(issues, 'INVALID_FIELD', `${path}.name`, '必须是非空字符串。')
    }
    if (!tensorDTypes.has(value.dtype as TensorDType)) {
      addIssue(issues, 'INVALID_FIELD', `${path}.dtype`, 'Tensor 数据类型不受支持。')
    }
    if (!sampleMethods.has(value.sampleMethod as TensorSampleMethod)) {
      addIssue(issues, 'INVALID_FIELD', `${path}.sampleMethod`, '摘要方式不受支持。')
    }

    const shape = Array.isArray(value.shape)
      ? value.shape.filter((item): item is number => typeof item === 'number')
      : []
    if (
      !Array.isArray(value.shape) ||
      shape.length !== value.shape.length ||
      shape.length === 0 ||
      !shape.every(isPositiveInteger)
    ) {
      addIssue(issues, 'INVALID_SHAPE', `${path}.shape`, 'Shape 必须是正整数数组。')
    }

    const values = readFiniteNumberArray(value.values, `${path}.values`, issues)
    if (value.sampleMethod === 'full' && shape.length > 0 && values.length !== product(shape)) {
      addIssue(
        issues,
        'INVALID_SHAPE',
        `${path}.values`,
        '完整 Tensor 的数值数量必须等于 Shape 乘积。',
      )
    }

    tensors.set(key, {
      id: key,
      role: value.role as TensorRole,
      shape,
      values,
      sampleMethod: value.sampleMethod as TensorSampleMethod,
    })
  }

  return tensors
}

function validateSteps(
  root: UnknownRecord,
  entityIds: ReadonlySet<string>,
  tensors: ReadonlyMap<string, ValidatedTensor>,
  issues: TraceValidationIssue[],
) {
  if (!Array.isArray(root.steps) || root.steps.length === 0) {
    addIssue(issues, 'INVALID_FIELD', 'steps', '必须是非空数组。')
    return
  }

  const stepIds = new Set<string>()
  root.steps.forEach((value, index) => {
    const path = `steps.${index}`
    if (!isRecord(value)) {
      addIssue(issues, 'INVALID_FIELD', path, '步骤必须是对象。')
      return
    }

    if (!isNonEmptyString(value.id) || !traceIdPattern.test(value.id)) {
      addIssue(issues, 'INVALID_ID', `${path}.id`, '步骤 ID 格式不合法。')
    } else if (stepIds.has(value.id)) {
      addIssue(issues, 'DUPLICATE_ID', `${path}.id`, '步骤 ID 不得重复。')
    } else {
      stepIds.add(value.id)
    }

    if (!tracePhases.has(value.phase as TracePhase)) {
      addIssue(issues, 'INVALID_FIELD', `${path}.phase`, '步骤阶段不受支持。')
    }
    if (!traceOperations.has(value.operation as TraceOperation)) {
      addIssue(issues, 'INVALID_FIELD', `${path}.operation`, '步骤操作不受支持。')
    }
    for (const key of ['title', 'description'] as const) {
      if (!isNonEmptyString(value[key])) {
        addIssue(issues, 'INVALID_FIELD', `${path}.${key}`, '必须是非空字符串。')
      }
    }
    if (!isPositiveInteger(value.durationMs)) {
      addIssue(issues, 'INVALID_VALUE', `${path}.durationMs`, '持续时间必须是正整数。')
    }

    const stepEntityIds = readStringArray(value.entityIds, `${path}.entityIds`, issues)
    const inputTensorIds = readStringArray(
      value.inputTensorIds,
      `${path}.inputTensorIds`,
      issues,
    )
    const outputTensorIds = readStringArray(
      value.outputTensorIds,
      `${path}.outputTensorIds`,
      issues,
    )

    for (const id of stepEntityIds) {
      if (!entityIds.has(id)) {
        addIssue(issues, 'INVALID_REFERENCE', `${path}.entityIds`, `实体 ${id} 不存在。`)
      }
    }
    for (const id of [...inputTensorIds, ...outputTensorIds]) {
      if (!tensors.has(id)) {
        addIssue(issues, 'INVALID_REFERENCE', `${path}.tensorIds`, `Tensor ${id} 不存在。`)
      }
    }
  })
}

function validateCoreTensorShapes(
  tokenCount: number,
  model: { heads: number; hiddenSize: number; vocabularySize: number } | null,
  tensors: ReadonlyMap<string, ValidatedTensor>,
  tokenIds: readonly number[],
  issues: TraceValidationIssue[],
) {
  const byRole = new Map<TensorRole, ValidatedTensor[]>()
  for (const tensor of tensors.values()) {
    const existing = byRole.get(tensor.role) ?? []
    existing.push(tensor)
    byRole.set(tensor.role, existing)
  }

  for (const role of tensorRoles) {
    if (!byRole.has(role)) {
      addIssue(issues, 'INVALID_FIELD', `tensors.${role}`, `缺少 ${role} Tensor。`)
    }
  }

  const tokenTensor = byRole.get('token-ids')?.[0]
  if (tokenTensor) {
    const expectedShape = [1, tokenCount]
    if (tokenTensor.shape.join(',') !== expectedShape.join(',')) {
      addIssue(issues, 'INVALID_SHAPE', tokenTensor.id, 'Token Tensor Shape 必须为 [1, token]。')
    }
    if (
      tokenTensor.values.length === tokenIds.length &&
      tokenTensor.values.some((value, index) => value !== tokenIds[index])
    ) {
      addIssue(issues, 'INVALID_VALUE', tokenTensor.id, 'Token Tensor 必须与输入 Token ID 一致。')
    }
  }

  const embeddingRoles = [
    'token-embedding',
    'position-embedding',
    'embedding',
  ] as const
  if (model) {
    const expectedEmbeddingShape = [1, tokenCount, model.hiddenSize].join(',')
    for (const role of embeddingRoles) {
      const tensor = byRole.get(role)?.[0]
      if (tensor && tensor.shape.join(',') !== expectedEmbeddingShape) {
        addIssue(
          issues,
          'INVALID_SHAPE',
          tensor.id,
          `${role} Shape 必须为 [1, token, hidden]。`,
        )
      }
    }

    const tokenEmbedding = byRole.get('token-embedding')?.[0]
    const positionEmbedding = byRole.get('position-embedding')?.[0]
    const embedding = byRole.get('embedding')?.[0]
    if (tokenEmbedding && positionEmbedding && embedding) {
      const compositionMatches = embedding.values.every((value, index) =>
        approximatelyEqual(
          value,
          (tokenEmbedding.values[index] ?? 0) + (positionEmbedding.values[index] ?? 0),
        ),
      )
      if (!compositionMatches) {
        addIssue(
          issues,
          'INVALID_VALUE',
          embedding.id,
          'Embedding 必须等于 Token Embedding 与 Position Embedding 的逐项和。',
        )
      }
    }

    const normalized = byRole.get('normalized')?.[0]
    if (normalized) {
      if (normalized.shape.join(',') !== expectedEmbeddingShape) {
        addIssue(
          issues,
          'INVALID_SHAPE',
          normalized.id,
          'normalized Shape 必须为 [1, token, hidden]。',
        )
      } else {
        for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex += 1) {
          const start = tokenIndex * model.hiddenSize
          const sample = normalized.values.slice(start, start + model.hiddenSize)
          const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length
          const variance = sample.reduce(
            (sum, value) => sum + (value - mean) ** 2,
            0,
          ) / sample.length
          if (Math.abs(mean) > 0.002 || Math.abs(variance - 1) > 0.01) {
            addIssue(
              issues,
              'INVALID_VALUE',
              `${normalized.id}[${tokenIndex}]`,
              'LayerNorm 教学样本的每个 Token 必须接近零均值和单位方差。',
            )
          }
        }
      }
    }
  }

  const qkv = (['query', 'key', 'value'] as const)
    .map((role) => byRole.get(role)?.[0])
    .filter((tensor): tensor is ValidatedTensor => tensor !== undefined)
  if (qkv.length === 3 && model) {
    const expected = [1, model.heads, tokenCount, model.hiddenSize / model.heads].join(',')
    for (const tensor of qkv) {
      if (tensor.shape.join(',') !== expected) {
        addIssue(
          issues,
          'INVALID_SHAPE',
          tensor.id,
          'Q/K/V Shape 必须为 [1, head, token, headSize]。',
        )
      }
    }
  }

  const mask = byRole.get('attention-mask')?.[0]
  if (mask) validateCausalMask(mask, tokenCount, issues)

  const weights = byRole.get('attention-weights')?.[0]
  if (weights && model) {
    validateAttentionWeights(weights, tokenCount, model.heads, issues)
  }

  const headOutput = byRole.get('attention-head-output')?.[0]
  const attentionOutput = byRole.get('attention-output')?.[0]
  if (model) {
    const headSize = model.hiddenSize / model.heads
    const expectedHeadOutputShape = [1, model.heads, tokenCount, headSize].join(',')
    const expectedAttentionOutputShape = [1, tokenCount, model.hiddenSize].join(',')

    if (headOutput && headOutput.shape.join(',') !== expectedHeadOutputShape) {
      addIssue(
        issues,
        'INVALID_SHAPE',
        headOutput.id,
        '每个 Head 的 Attention 输出 Shape 必须为 [1, head, token, headSize]。',
      )
    }
    if (attentionOutput && attentionOutput.shape.join(',') !== expectedAttentionOutputShape) {
      addIssue(
        issues,
        'INVALID_SHAPE',
        attentionOutput.id,
        '拼接后的 Attention 输出 Shape 必须为 [1, token, hidden]。',
      )
    }
    if (
      headOutput?.shape.join(',') === expectedHeadOutputShape &&
      attentionOutput?.shape.join(',') === expectedAttentionOutputShape
    ) {
      for (let tokenIndex = 0; tokenIndex < tokenCount; tokenIndex += 1) {
        for (let headIndex = 0; headIndex < model.heads; headIndex += 1) {
          for (let dimension = 0; dimension < headSize; dimension += 1) {
            const sourceIndex =
              (headIndex * tokenCount + tokenIndex) * headSize + dimension
            const targetIndex =
              tokenIndex * model.hiddenSize + headIndex * headSize + dimension
            if (!approximatelyEqual(
              headOutput.values[sourceIndex],
              attentionOutput.values[targetIndex],
            )) {
              addIssue(
                issues,
                'INVALID_VALUE',
                `${attentionOutput.id}[${tokenIndex},${headIndex},${dimension}]`,
                'Attention 输出必须按 Token 拼接全部 Head 的向量。',
              )
              return
            }
          }
        }
      }
    }
  }

  for (const role of ['logits', 'probabilities'] as const) {
    const tensor = byRole.get(role)?.[0]
    if (
      tensor &&
      model &&
      tensor.shape.at(-1) !== model.vocabularySize
    ) {
      addIssue(
        issues,
        'INVALID_SHAPE',
        tensor.id,
        `${role} 的最后一维必须等于词表大小。`,
      )
    }
  }
}

function validateCausalMask(
  tensor: ValidatedTensor,
  tokenCount: number,
  issues: TraceValidationIssue[],
) {
  if (tensor.shape.join(',') !== [tokenCount, tokenCount].join(',')) {
    addIssue(
      issues,
      'INVALID_SHAPE',
      tensor.id,
      '因果 Mask Shape 必须为 [token, token]。',
    )
    return
  }

  for (let row = 0; row < tokenCount; row += 1) {
    for (let column = 0; column < tokenCount; column += 1) {
      const expected = column <= row ? 1 : 0
      if (tensor.values[row * tokenCount + column] !== expected) {
        addIssue(
          issues,
          'INVALID_CAUSAL_MASK',
          `${tensor.id}[${row},${column}]`,
          '因果 Mask 必须允许当前位置及过去位置，并屏蔽未来位置。',
        )
        return
      }
    }
  }
}

function validateAttentionWeights(
  tensor: ValidatedTensor,
  tokenCount: number,
  heads: number,
  issues: TraceValidationIssue[],
) {
  if (tensor.shape.join(',') !== [1, heads, tokenCount, tokenCount].join(',')) {
    addIssue(
      issues,
      'INVALID_SHAPE',
      tensor.id,
      'Attention Weight Shape 必须为 [1, head, token, token]。',
    )
    return
  }

  for (let head = 0; head < heads; head += 1) {
    for (let row = 0; row < tokenCount; row += 1) {
      const rowOffset = (head * tokenCount + row) * tokenCount
      let rowSum = 0
      for (let column = 0; column < tokenCount; column += 1) {
        const value = tensor.values[rowOffset + column]
        rowSum += value
        if (value < 0 || value > 1) {
          addIssue(
            issues,
            'INVALID_PROBABILITY',
            `${tensor.id}[${head},${row},${column}]`,
            'Attention 权重必须位于 0 到 1。',
          )
        }
        if (column > row && value !== 0) {
          addIssue(
            issues,
            'INVALID_CAUSAL_MASK',
            `${tensor.id}[${head},${row},${column}]`,
            '被因果 Mask 屏蔽的位置权重必须为 0。',
          )
        }
      }
      if (!approximatelyEqual(rowSum, 1)) {
        addIssue(
          issues,
          'INVALID_PROBABILITY',
          `${tensor.id}[${head},${row}]`,
          '每一行 Attention 权重之和必须为 1。',
        )
      }
    }
  }
}

function validateOutput(
  root: UnknownRecord,
  tensors: ReadonlyMap<string, ValidatedTensor>,
  vocabularySize: number,
  issues: TraceValidationIssue[],
) {
  if (!isRecord(root.output)) {
    addIssue(issues, 'INVALID_FIELD', 'output', '必须是对象。')
    return
  }

  const logitsId = root.output.logitsTensorId
  const probabilitiesId = root.output.probabilitiesTensorId
  const logits = isNonEmptyString(logitsId) ? tensors.get(logitsId) : undefined
  const probabilities = isNonEmptyString(probabilitiesId)
    ? tensors.get(probabilitiesId)
    : undefined

  if (!logits || logits.role !== 'logits') {
    addIssue(issues, 'INVALID_REFERENCE', 'output.logitsTensorId', '必须引用 Logits Tensor。')
  }
  if (!probabilities || probabilities.role !== 'probabilities') {
    addIssue(
      issues,
      'INVALID_REFERENCE',
      'output.probabilitiesTensorId',
      '必须引用 Probabilities Tensor。',
    )
  }

  if (!isNonNegativeInteger(root.output.sampledTokenId)) {
    addIssue(issues, 'INVALID_VALUE', 'output.sampledTokenId', '必须是非负整数。')
  } else if (vocabularySize > 0 && root.output.sampledTokenId >= vocabularySize) {
    addIssue(issues, 'INVALID_VALUE', 'output.sampledTokenId', '采样 Token ID 超出词表。')
  }
  if (!isNonEmptyString(root.output.sampledToken)) {
    addIssue(issues, 'INVALID_FIELD', 'output.sampledToken', '必须是非空字符串。')
  }

  if (probabilities) {
    const sum = probabilities.values.reduce((result, value) => result + value, 0)
    if (probabilities.values.some((value) => value < 0 || value > 1)) {
      addIssue(
        issues,
        'INVALID_PROBABILITY',
        probabilities.id,
        '输出概率必须位于 0 到 1。',
      )
    }
    if (!approximatelyEqual(sum, 1)) {
      addIssue(issues, 'INVALID_PROBABILITY', probabilities.id, '输出概率之和必须为 1。')
    }
  }

  if (!Array.isArray(root.output.candidates) || root.output.candidates.length === 0) {
    addIssue(issues, 'INVALID_FIELD', 'output.candidates', '候选 Token 必须是非空数组。')
    return
  }

  const candidateTokens = new Map<number, string>()
  root.output.candidates.forEach((value, index) => {
    const path = `output.candidates.${index}`
    if (!isRecord(value)) {
      addIssue(issues, 'INVALID_FIELD', path, '候选 Token 必须是对象。')
      return
    }
    if (!isNonNegativeInteger(value.tokenId)) {
      addIssue(issues, 'INVALID_VALUE', `${path}.tokenId`, 'Token ID 必须是非负整数。')
    } else {
      if (candidateTokens.has(value.tokenId)) {
        addIssue(issues, 'DUPLICATE_ID', `${path}.tokenId`, '候选 Token ID 不得重复。')
      }
      candidateTokens.set(
        value.tokenId,
        typeof value.token === 'string' ? value.token : '',
      )
    }
    if (!isNonEmptyString(value.token)) {
      addIssue(issues, 'INVALID_FIELD', `${path}.token`, 'Token 文本必须是非空字符串。')
    }
    if (typeof value.logit !== 'number' || !Number.isFinite(value.logit)) {
      addIssue(issues, 'INVALID_VALUE', `${path}.logit`, 'Logit 必须是有限数字。')
    }
    if (
      typeof value.probability !== 'number' ||
      !Number.isFinite(value.probability) ||
      value.probability < 0 ||
      value.probability > 1
    ) {
      addIssue(issues, 'INVALID_PROBABILITY', `${path}.probability`, '概率必须位于 0 到 1。')
    }
    if (
      probabilities &&
      isNonNegativeInteger(value.tokenId) &&
      typeof value.probability === 'number' &&
      value.tokenId < probabilities.values.length &&
      !approximatelyEqual(probabilities.values[value.tokenId], value.probability)
    ) {
      addIssue(
        issues,
        'INVALID_PROBABILITY',
        `${path}.probability`,
        '候选概率必须与概率 Tensor 一致。',
      )
    }
  })

  if (
    isNonNegativeInteger(root.output.sampledTokenId) &&
    !candidateTokens.has(root.output.sampledTokenId)
  ) {
    addIssue(
      issues,
      'INVALID_REFERENCE',
      'output.sampledTokenId',
      '采样结果必须出现在候选 Token 中。',
    )
  } else if (
    isNonNegativeInteger(root.output.sampledTokenId) &&
    isNonEmptyString(root.output.sampledToken) &&
    candidateTokens.get(root.output.sampledTokenId) !== root.output.sampledToken
  ) {
    addIssue(
      issues,
      'INVALID_VALUE',
      'output.sampledToken',
      '采样 Token 文本必须与候选 Token 一致。',
    )
  }
}

export function validateModelTrace(value: unknown): asserts value is ModelTrace {
  const issues: TraceValidationIssue[] = []
  if (!isRecord(value)) {
    throw new TraceValidationError([
      { code: 'INVALID_ROOT', path: '$', message: '模型轨迹根节点必须是对象。' },
    ])
  }

  if (value.schemaVersion !== TRACE_SCHEMA_VERSION) {
    addIssue(
      issues,
      'UNSUPPORTED_VERSION',
      'schemaVersion',
      `只支持 Schema ${TRACE_SCHEMA_VERSION}。`,
    )
  }
  if (!traceSources.has(value.source as TraceSource)) {
    addIssue(issues, 'INVALID_FIELD', 'source', 'Trace 来源不受支持。')
  }

  validateMetadata(value, issues)
  const model = validateModel(value, issues)
  const input = validateInput(value, issues)
  const entities = validateEntities(value, input.tokens.length, model, issues)
  const tensors = validateTensors(value, issues)
  validateSteps(value, entities, tensors, issues)
  validateCoreTensorShapes(
    input.tokens.length,
    model,
    tensors,
    input.tokenIds,
    issues,
  )
  validateOutput(value, tensors, model?.vocabularySize ?? 0, issues)

  if (issues.length > 0) {
    throw new TraceValidationError(issues)
  }
}
