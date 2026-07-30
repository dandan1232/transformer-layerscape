import { describe, expect, it } from 'vitest'
import { validateRealModelExperiment } from './real-model-experiment'

const valid = {
  text: 'The sky is blue',
  selectedLayerIndex: '5',
  temperature: '1',
  topK: '5',
  topP: '0.9',
  seed: '7',
}

describe('real model experiment validation', () => {
  it('converts a valid draft into a typed inference request', () => {
    expect(validateRealModelExperiment(valid)).toEqual({
      ok: true,
      payload: {
        text: 'The sky is blue',
        selectedLayerIndex: 5,
        sampling: { temperature: 1, topK: 5, topP: 0.9, seed: 7 },
      },
    })
  })

  it('reports every invalid field without silently clamping parameters', () => {
    const result = validateRealModelExperiment({
      text: '  ', selectedLayerIndex: '6', temperature: '3',
      topK: '1.5', topP: '0', seed: '-1',
    })

    expect(result).toMatchObject({
      ok: false,
      errors: {
        text: expect.any(String),
        selectedLayerIndex: expect.any(String),
        temperature: expect.any(String),
        topK: expect.any(String),
        topP: expect.any(String),
        seed: expect.any(String),
      },
    })
  })
})
