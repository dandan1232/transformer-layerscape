import { describe, expect, it } from 'vitest'
import { verticalSliceTrace } from '../../content/traces/vertical-slice-trace'
import { TraceValidationError } from './trace-validation-error'
import { validateModelTrace } from './trace-validator'

type MutableRecord = Record<string, unknown>

function cloneTrace() {
  return structuredClone(verticalSliceTrace) as unknown as MutableRecord
}

function record(value: unknown): MutableRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('测试 Fixture 结构与预期不符。')
  }
  return value as MutableRecord
}

function records(value: unknown): MutableRecord[] {
  if (!Array.isArray(value)) throw new Error('测试 Fixture 数组与预期不符。')
  return value as MutableRecord[]
}

function expectValidationCode(value: unknown, code: string) {
  try {
    validateModelTrace(value)
  } catch (error) {
    expect(error).toBeInstanceOf(TraceValidationError)
    expect((error as TraceValidationError).issues.some((issue) => issue.code === code)).toBe(
      true,
    )
    return
  }
  throw new Error(`预期轨迹校验失败并包含 ${code}。`)
}

describe('ModelTrace 运行时校验', () => {
  it('接受完整的预置教学轨迹', () => {
    expect(() => validateModelTrace(verticalSliceTrace)).not.toThrow()
  })

  it('拒绝未知 Schema 版本', () => {
    const trace = structuredClone(verticalSliceTrace) as unknown as { schemaVersion: number }
    trace.schemaVersion = 2

    expectValidationCode(trace, 'UNSUPPORTED_VERSION')
  })

  it('拒绝指向不存在 Tensor 的步骤', () => {
    const trace = structuredClone(verticalSliceTrace)
    const step = trace.steps[0] as unknown as { outputTensorIds: string[] }
    step.outputTensorIds = ['tensor:missing']

    expectValidationCode(trace, 'INVALID_REFERENCE')
  })

  it('拒绝与 Shape 不匹配的完整 Tensor', () => {
    const trace = structuredClone(verticalSliceTrace)
    const embedding = trace.tensors['tensor:embedding'] as unknown as { values: number[] }
    embedding.values = embedding.values.slice(1)

    expectValidationCode(trace, 'INVALID_SHAPE')
  })

  it('拒绝没有按 Token 与 Position 逐项相加的隐藏向量', () => {
    const trace = structuredClone(verticalSliceTrace)
    const embedding = trace.tensors['tensor:embedding'] as unknown as { values: number[] }
    embedding.values[0] += 0.25

    expectValidationCode(trace, 'INVALID_VALUE')
  })

  it('拒绝能够读取未来 Token 的因果 Mask', () => {
    const trace = structuredClone(verticalSliceTrace)
    const mask = trace.tensors['tensor:causal-mask'] as unknown as { values: number[] }
    mask.values[1] = 1

    expectValidationCode(trace, 'INVALID_CAUSAL_MASK')
  })

  it('拒绝上三角出现权重的 Attention', () => {
    const trace = structuredClone(verticalSliceTrace)
    const weights = trace.tensors['tensor:attention-weights'] as unknown as {
      values: number[]
    }
    weights.values[1] = 0.1

    expectValidationCode(trace, 'INVALID_CAUSAL_MASK')
  })

  it('拒绝概率和不等于一的输出', () => {
    const trace = structuredClone(verticalSliceTrace)
    const probabilities = trace.tensors['tensor:probabilities'] as unknown as {
      values: number[]
    }
    probabilities.values[0] = 0.5

    expectValidationCode(trace, 'INVALID_PROBABILITY')
  })

  it('拒绝非对象根节点', () => {
    expectValidationCode(null, 'INVALID_ROOT')
  })

  const invalidCases: ReadonlyArray<{
    name: string
    code: string
    mutate: (trace: MutableRecord) => void
  }> = [
    {
      name: 'Metadata 不是对象',
      code: 'INVALID_FIELD',
      mutate: (trace) => {
        trace.metadata = null
      },
    },
    {
      name: 'Metadata 缺少文本并使用错误语言',
      code: 'INVALID_FIELD',
      mutate: (trace) => {
        const metadata = record(trace.metadata)
        metadata.title = ''
        metadata.locale = 'en'
      },
    },
    {
      name: 'Model 不是对象',
      code: 'INVALID_FIELD',
      mutate: (trace) => {
        trace.model = null
      },
    },
    {
      name: 'Model 字段非法且 Hidden Size 无法均分',
      code: 'INVALID_SHAPE',
      mutate: (trace) => {
        const model = record(trace.model)
        model.id = ''
        model.layers = 0
        model.heads = 3
        model.hiddenSize = 8
      },
    },
    {
      name: 'Input 不是对象',
      code: 'INVALID_FIELD',
      mutate: (trace) => {
        trace.input = null
      },
    },
    {
      name: 'Input 文本、ID 和 Token 数量非法',
      code: 'INVALID_VALUE',
      mutate: (trace) => {
        const input = record(trace.input)
        input.text = ''
        input.tokenIds = [0, -1]
        input.tokens = ['one', 'two', 'three']
      },
    },
    {
      name: 'Input Token 数组为空',
      code: 'INVALID_SHAPE',
      mutate: (trace) => {
        const input = record(trace.input)
        input.tokenIds = []
        input.tokens = []
      },
    },
    {
      name: 'Input 数组包含非有限值和非字符串',
      code: 'INVALID_VALUE',
      mutate: (trace) => {
        const input = record(trace.input)
        input.tokenIds = [Number.NaN]
        input.tokens = [42]
      },
    },
    {
      name: 'Entities 不是对象',
      code: 'INVALID_FIELD',
      mutate: (trace) => {
        trace.entities = null
      },
    },
    {
      name: 'Entity 键非法且值不是对象',
      code: 'INVALID_ID',
      mutate: (trace) => {
        record(trace.entities)['bad entity id'] = null
      },
    },
    {
      name: 'Entity 字段与索引非法',
      code: 'INVALID_VALUE',
      mutate: (trace) => {
        record(trace.entities)['token:0'] = {
          id: 'token:wrong',
          kind: 'unknown',
          label: '',
          description: '',
          parentId: 42,
          tokenIndex: 99,
          layerIndex: -1,
        }
      },
    },
    {
      name: 'Entity 父引用不存在',
      code: 'INVALID_REFERENCE',
      mutate: (trace) => {
        record(record(trace.entities)['head:0']).parentId = 'operation:missing'
      },
    },
    {
      name: 'Entity Layer 与 Head 索引越界',
      code: 'INVALID_VALUE',
      mutate: (trace) => {
        const head = record(record(trace.entities)['head:0'])
        head.layerIndex = 1
        head.headIndex = 2
      },
    },
    {
      name: 'Tensors 不是对象',
      code: 'INVALID_FIELD',
      mutate: (trace) => {
        trace.tensors = null
      },
    },
    {
      name: 'Tensor 键非法且值不是对象',
      code: 'INVALID_ID',
      mutate: (trace) => {
        record(trace.tensors)['bad tensor id'] = null
      },
    },
    {
      name: 'Tensor 字段、Shape 和数值非法',
      code: 'INVALID_VALUE',
      mutate: (trace) => {
        record(trace.tensors)['tensor:q'] = {
          id: 'tensor:wrong',
          role: 'unknown',
          name: '',
          dtype: 'float64',
          shape: ['bad'],
          values: [Number.NaN],
          sampleMethod: 'unknown',
        }
      },
    },
    {
      name: 'Steps 数组为空',
      code: 'INVALID_FIELD',
      mutate: (trace) => {
        trace.steps = []
      },
    },
    {
      name: 'Step 不是对象',
      code: 'INVALID_FIELD',
      mutate: (trace) => {
        trace.steps = [null]
      },
    },
    {
      name: 'Step ID 重复且字段非法',
      code: 'DUPLICATE_ID',
      mutate: (trace) => {
        const steps = records(trace.steps)
        steps[1].id = steps[0].id
        steps[1].phase = 'unknown'
        steps[1].operation = 'unknown'
        steps[1].title = ''
        steps[1].durationMs = 0
        steps[1].entityIds = ['operation:missing']
        steps[1].inputTensorIds = 42
        steps[1].outputTensorIds = ['tensor:missing']
      },
    },
    {
      name: 'Token Tensor Shape 与输入 ID 不一致',
      code: 'INVALID_VALUE',
      mutate: (trace) => {
        const tensor = record(record(trace.tensors)['tensor:token-ids'])
        tensor.shape = [2, 3]
        tensor.values = [99, 7, 2, 9, 5, 11]
      },
    },
    {
      name: 'Embedding Shape 非法',
      code: 'INVALID_SHAPE',
      mutate: (trace) => {
        const tensor = record(record(trace.tensors)['tensor:embedding'])
        tensor.shape = [1, 8, 6]
      },
    },
    {
      name: 'QKV Shape 非法',
      code: 'INVALID_SHAPE',
      mutate: (trace) => {
        const tensor = record(record(trace.tensors)['tensor:q'])
        tensor.shape = [1, 2, 4, 6]
      },
    },
    {
      name: 'Mask Shape 非法',
      code: 'INVALID_SHAPE',
      mutate: (trace) => {
        const tensor = record(record(trace.tensors)['tensor:causal-mask'])
        tensor.shape = [1, 36]
      },
    },
    {
      name: 'Attention Weight Shape 非法',
      code: 'INVALID_SHAPE',
      mutate: (trace) => {
        const tensor = record(record(trace.tensors)['tensor:attention-weights'])
        tensor.shape = [1, 2, 12, 3]
      },
    },
    {
      name: 'Attention Weight 超出概率范围',
      code: 'INVALID_PROBABILITY',
      mutate: (trace) => {
        const tensor = record(record(trace.tensors)['tensor:attention-weights'])
        const values = tensor.values as number[]
        values[0] = -0.1
      },
    },
    {
      name: 'Logits 词表维度非法',
      code: 'INVALID_SHAPE',
      mutate: (trace) => {
        record(record(trace.tensors)['tensor:logits']).shape = [2, 8]
      },
    },
    {
      name: 'Output 不是对象',
      code: 'INVALID_FIELD',
      mutate: (trace) => {
        trace.output = null
      },
    },
    {
      name: 'Output Tensor 引用与采样字段非法',
      code: 'INVALID_REFERENCE',
      mutate: (trace) => {
        const output = record(trace.output)
        output.logitsTensorId = 'tensor:probabilities'
        output.probabilitiesTensorId = 'tensor:missing'
        output.sampledTokenId = -1
        output.sampledToken = ''
      },
    },
    {
      name: '采样 Token 超出词表',
      code: 'INVALID_VALUE',
      mutate: (trace) => {
        record(trace.output).sampledTokenId = 99
      },
    },
    {
      name: '采样 Token 文本与候选不一致',
      code: 'INVALID_VALUE',
      mutate: (trace) => {
        record(trace.output).sampledToken = ' mismatch'
      },
    },
    {
      name: '输出概率超出合法范围',
      code: 'INVALID_PROBABILITY',
      mutate: (trace) => {
        const probabilities = record(record(trace.tensors)['tensor:probabilities'])
        const values = probabilities.values as number[]
        values[0] = 1.2
      },
    },
    {
      name: '候选 Token 数组为空',
      code: 'INVALID_FIELD',
      mutate: (trace) => {
        record(trace.output).candidates = []
      },
    },
    {
      name: '候选 Token 值不是对象',
      code: 'INVALID_FIELD',
      mutate: (trace) => {
        record(trace.output).candidates = [null]
      },
    },
    {
      name: '候选 Token 重复且数值不一致',
      code: 'DUPLICATE_ID',
      mutate: (trace) => {
        const output = record(trace.output)
        output.sampledTokenId = 8
        output.candidates = [
          { tokenId: 12, token: '.', logit: 1.21, probability: 0.18 },
          { tokenId: 12, token: '', logit: Number.NaN, probability: 0.5 },
        ]
      },
    },
  ]

  it.each(invalidCases)('拒绝：$name', ({ code, mutate }) => {
    const trace = cloneTrace()
    mutate(trace)

    expectValidationCode(trace, code)
  })
})
