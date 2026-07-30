import { describe, expect, it } from 'vitest'
import {
  createDistilgpt2InferencePayload,
  type Distilgpt2ModelSpec,
  type RuntimeInferenceTensor,
  type RuntimeInferenceTokenizer,
} from './distilgpt2-inference'

const model: Distilgpt2ModelSpec = {
  id: 'tiny-gpt2', displayName: 'Tiny GPT-2', layers: 2,
  heads: 2, hiddenSize: 4, vocabularySize: 5,
}

const tokenizer: RuntimeInferenceTokenizer = {
  tokenize: () => ({ tokenIds: [2, 3], tokens: ['Hello', ' world'] }),
  decodeToken: (tokenId) => `T${tokenId}`,
}

function tensor(shape: readonly number[], start = 0): RuntimeInferenceTensor {
  return {
    dims: shape,
    data: Float32Array.from({ length: shape.reduce((total, value) => total * value, 1) },
      (_, index) => start + index / 100),
  }
}

function outputs(): Record<string, RuntimeInferenceTensor> {
  const hidden = [1, 2, 4]
  const heads = [1, 2, 2, 2]
  const weights = [1, 2, 2, 2]
  const intermediate = [1, 2, 16]
  return {
    'trace.embedding.token': tensor(hidden, 0.1),
    'trace.embedding.position': tensor(hidden, 0.2),
    'trace.embedding.sum': tensor(hidden, 0.3),
    'trace.layer.0.blockOutput': tensor(hidden, 0.4),
    'trace.layer.1.layerNorm1': tensor(hidden, 0.5),
    'trace.layer.1.query': tensor(heads, 0.6),
    'present.1.key': tensor(heads, 0.7),
    'present.1.value': tensor(heads, 0.8),
    'trace.layer.1.attentionWeights': tensor(weights, 0.9),
    'trace.layer.1.attentionHeadOutput': tensor(heads, 1),
    'trace.layer.1.attentionProjected': tensor(hidden, 1.1),
    'trace.layer.1.attentionResidual': tensor(hidden, 1.2),
    'trace.layer.1.layerNorm2': tensor(hidden, 1.3),
    'trace.layer.1.mlpHidden': tensor(intermediate, 1.4),
    'trace.layer.1.mlpActivated': tensor(intermediate, 1.5),
    'trace.layer.1.mlpProjected': tensor(hidden, 1.6),
    'trace.layer.1.blockOutput': tensor(hidden, 1.7),
    logits: { dims: [1, 2, 5], data: Float32Array.from([0, 0, 0, 0, 0, 1, 2, 3, 4, 5]) },
  }
}

describe('DistilGPT-2 inference payload', () => {
  it('maps the selected real layer into semantic transferable tensors', () => {
    const payload = createDistilgpt2InferencePayload({
      text: 'Hello world',
      tokenized: tokenizer.tokenize('Hello world'),
      tokenizer,
      outputs: outputs(),
      selectedLayerIndex: 1,
      sampling: { temperature: 1, topK: 3, topP: 0.9, seed: 7 },
      inferenceMilliseconds: 12.5,
      model,
    })

    expect(payload.input).toEqual({
      text: 'Hello world', tokenIds: [2, 3], tokens: ['Hello', ' world'],
    })
    expect(payload.tensors).toHaveLength(22)
    const byRole = Object.fromEntries(payload.tensors.map((value) => [value.role, value]))
    expect([...new Float32Array(byRole['block-input'].data)]).toEqual(
      [...outputs()['trace.layer.0.blockOutput'].data as Float32Array],
    )
    expect([...new Float32Array(byRole.logits.data)]).toEqual([1, 2, 3, 4, 5])
    const concatenated = [...new Float32Array(byRole['attention-concatenated'].data)]
    expect(concatenated).toHaveLength(8)
    expect(concatenated).toEqual(expect.arrayContaining([
      1, 1.01, 1.04, 1.05,
      1.02, 1.03, 1.06, 1.07,
    ].map((value) => expect.closeTo(value, 5))))
    expect(payload.output.candidates.map((candidate) => candidate.token)).toEqual([
      'T0', 'T1', 'T2', 'T3', 'T4',
    ])
    expect(payload.output.sampledTokenId).toBeGreaterThanOrEqual(0)
  })

  it('rejects a missing promoted output instead of fabricating a trace', () => {
    const incomplete = outputs()
    delete incomplete['trace.layer.1.attentionWeights']

    expect(() => createDistilgpt2InferencePayload({
      text: 'Hello world', tokenized: tokenizer.tokenize('Hello world'), tokenizer,
      outputs: incomplete, selectedLayerIndex: 1,
      sampling: { temperature: 1, topK: 3, topP: 0.9, seed: 7 },
      inferenceMilliseconds: 1, model,
    })).toThrow('真实模型缺少输出 trace.layer.1.attentionWeights')
  })

  it('reproduces the sampled token for identical parameters and Seed', () => {
    const options = {
      text: 'Hello world', tokenized: tokenizer.tokenize('Hello world'), tokenizer,
      selectedLayerIndex: 1,
      sampling: { temperature: 1.3, topK: 4, topP: 0.8, seed: 91 },
      inferenceMilliseconds: 1, model,
    }
    const first = createDistilgpt2InferencePayload({ ...options, outputs: outputs() })
    const second = createDistilgpt2InferencePayload({ ...options, outputs: outputs() })

    expect(second.output.sampledTokenId).toBe(first.output.sampledTokenId)
    expect(second.output.sampledToken).toBe(first.output.sampledToken)
  })
})
