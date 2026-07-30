import { describe, expect, it } from 'vitest'
import {
  DISTILGPT2_EXISTING_TRACE_OUTPUTS,
  DISTILGPT2_LAYER_COUNT,
  DISTILGPT2_PROMOTED_OUTPUTS,
} from './instrumentation-plan.mjs'

describe('DistilGPT-2 instrumentation plan', () => {
  it('promotes the complete teaching path for every transformer layer', () => {
    const requiredLayerOutputs = [
      'layerNorm1',
      'query',
      'attentionScores',
      'attentionMaskedScores',
      'attentionWeights',
      'attentionHeadOutput',
      'attentionProjected',
      'attentionResidual',
      'layerNorm2',
      'mlpHidden',
      'mlpActivated',
      'mlpProjected',
      'blockOutput',
    ]

    for (let layerIndex = 0; layerIndex < DISTILGPT2_LAYER_COUNT; layerIndex += 1) {
      const layerOutputNames = DISTILGPT2_PROMOTED_OUTPUTS
        .filter((output) => output.layerIndex === layerIndex)
        .map((output) => output.outputName)

      expect(layerOutputNames).toEqual(
        requiredLayerOutputs.map((name) => `trace.layer.${layerIndex}.${name}`),
      )
    }
  })

  it('keeps K and V mapped to the graph outputs already provided by the model', () => {
    expect(DISTILGPT2_EXISTING_TRACE_OUTPUTS).toHaveLength(12)
    expect(DISTILGPT2_EXISTING_TRACE_OUTPUTS.slice(0, 2)).toEqual([
      {
        outputName: 'present.0.key',
        stage: 'qkv',
        layerIndex: 0,
        semanticName: 'key',
      },
      {
        outputName: 'present.0.value',
        stage: 'qkv',
        layerIndex: 0,
        semanticName: 'value',
      },
    ])
  })

  it('uses unique semantic output and internal tensor names', () => {
    expect(DISTILGPT2_PROMOTED_OUTPUTS).toHaveLength(81)
    expect(new Set(DISTILGPT2_PROMOTED_OUTPUTS.map((output) => output.outputName)).size)
      .toBe(DISTILGPT2_PROMOTED_OUTPUTS.length)
    expect(new Set(DISTILGPT2_PROMOTED_OUTPUTS.map((output) => output.tensorName)).size)
      .toBe(DISTILGPT2_PROMOTED_OUTPUTS.length)
  })
})
