import { describe, expect, it } from 'vitest'
import type { TraceCandidate } from '../trace/trace'
import {
  DEFAULT_SAMPLING_PARAMETERS,
  normalizeSamplingParameters,
  runSamplingExperiment,
  sampleTraceCandidate,
  softmaxLogits,
} from './sampling'

const candidates: readonly TraceCandidate[] = [
  { tokenId: 0, token: ' A', logit: 2, probability: 0.66 },
  { tokenId: 1, token: ' B', logit: 1, probability: 0.24 },
  { tokenId: 2, token: ' C', logit: 0, probability: 0.1 },
]

describe('采样实验', () => {
  it('使用数值稳定的 Softmax 生成总和为一的概率', () => {
    const probabilities = softmaxLogits([1_001, 1_000, 999])

    expect(probabilities.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 10)
    expect(probabilities[0]).toBeGreaterThan(probabilities[1] ?? 0)
    expect(probabilities[1]).toBeGreaterThan(probabilities[2] ?? 0)
  })

  it('较低 Temperature 会让最高候选更集中', () => {
    const cold = runSamplingExperiment(candidates, {
      ...DEFAULT_SAMPLING_PARAMETERS,
      temperature: 0.2,
      topK: 3,
      topP: 1,
    })
    const warm = runSamplingExperiment(candidates, {
      ...DEFAULT_SAMPLING_PARAMETERS,
      temperature: 2,
      topK: 3,
      topP: 1,
    })

    expect(cold.candidates[0]?.probability).toBeGreaterThan(
      warm.candidates[0]?.probability ?? 1,
    )
  })

  it('依次应用 Top-k 与 Top-p 并重新归一化', () => {
    const result = runSamplingExperiment(candidates, {
      temperature: 1,
      topK: 2,
      topP: 0.6,
      seed: 7,
    })

    expect(result.eligibleCount).toBe(1)
    expect(result.candidates.map((candidate) => candidate.eligible)).toEqual([
      true,
      false,
      false,
    ])
    expect(result.candidates[0]?.probability).toBe(1)
    expect(result.sampledCandidate?.tokenId).toBe(0)
  })

  it('相同参数与 Seed 产生相同结果', () => {
    const parameters = { temperature: 1.4, topK: 3, topP: 1, seed: 91 }
    const first = runSamplingExperiment(candidates, parameters)
    const second = runSamplingExperiment(candidates, parameters)

    expect(first.sampledCandidate).toEqual(second.sampledCandidate)
    expect(first.candidates).toEqual(second.candidates)
  })

  it('轻量采样路径与完整实验选择相同 Token', () => {
    const parameters = { temperature: 1.4, topK: 3, topP: 0.8, seed: 91 }
    expect(sampleTraceCandidate(candidates, parameters)?.tokenId).toBe(
      runSamplingExperiment(candidates, parameters).sampledCandidate?.tokenId,
    )
  })

  it('轻量采样在大 Top-k 排序路径保持相同结果', () => {
    const largeCandidates = Array.from({ length: 300 }, (_, tokenId) => ({
      tokenId,
      token: ` T${tokenId}`,
      logit: Math.cos(tokenId / 7) * 3 + tokenId / 1_000,
      probability: 1 / 300,
    }))
    const parameters = { temperature: 0.8, topK: 300, topP: 0.95, seed: 73 }
    expect(sampleTraceCandidate(largeCandidates, parameters)?.tokenId).toBe(
      runSamplingExperiment(largeCandidates, parameters).sampledCandidate?.tokenId,
    )
  })

  it('把越界和非有限参数夹紧到教学范围', () => {
    expect(
      normalizeSamplingParameters(
        { temperature: Number.NaN, topK: 99, topP: -1, seed: -5 },
        3,
      ),
    ).toEqual({
      temperature: 1,
      topK: 3,
      topP: 0.1,
      seed: 0,
    })
  })
})
