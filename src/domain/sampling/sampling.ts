import type { TraceCandidate } from '../trace/trace'

export interface SamplingParameters {
  readonly temperature: number
  readonly topK: number
  readonly topP: number
  readonly seed: number
}

export interface SamplingCandidate extends TraceCandidate {
  readonly temperatureProbability: number
  readonly cumulativeProbability: number
  readonly eligible: boolean
}

export interface SamplingExperiment {
  readonly parameters: SamplingParameters
  readonly candidates: readonly SamplingCandidate[]
  readonly sampledCandidate: SamplingCandidate | null
  readonly eligibleCount: number
}

export const SAMPLING_LIMITS = {
  temperature: { min: 0.2, max: 2 },
  topP: { min: 0.1, max: 1 },
  seed: { min: 0, max: 999_999 },
} as const

export const DEFAULT_SAMPLING_PARAMETERS: SamplingParameters = {
  temperature: 1,
  topK: 5,
  topP: 0.9,
  seed: 7,
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function normalizeSamplingParameters(
  parameters: Partial<SamplingParameters>,
  candidateCount: number,
): SamplingParameters {
  const safeCandidateCount = Math.max(1, Math.trunc(candidateCount))
  const temperature = Number.isFinite(parameters.temperature)
    ? Number(parameters.temperature)
    : DEFAULT_SAMPLING_PARAMETERS.temperature
  const topK = Number.isFinite(parameters.topK)
    ? Math.trunc(Number(parameters.topK))
    : Math.min(DEFAULT_SAMPLING_PARAMETERS.topK, safeCandidateCount)
  const topP = Number.isFinite(parameters.topP)
    ? Number(parameters.topP)
    : DEFAULT_SAMPLING_PARAMETERS.topP
  const seed = Number.isFinite(parameters.seed)
    ? Math.trunc(Number(parameters.seed))
    : DEFAULT_SAMPLING_PARAMETERS.seed

  return {
    temperature: clamp(
      temperature,
      SAMPLING_LIMITS.temperature.min,
      SAMPLING_LIMITS.temperature.max,
    ),
    topK: clamp(topK, 1, safeCandidateCount),
    topP: clamp(topP, SAMPLING_LIMITS.topP.min, SAMPLING_LIMITS.topP.max),
    seed: clamp(seed, SAMPLING_LIMITS.seed.min, SAMPLING_LIMITS.seed.max),
  }
}

export function softmaxLogits(
  logits: readonly number[],
  temperature = DEFAULT_SAMPLING_PARAMETERS.temperature,
) {
  if (logits.length === 0) return []
  const safeTemperature = clamp(
    Number.isFinite(temperature) ? temperature : DEFAULT_SAMPLING_PARAMETERS.temperature,
    SAMPLING_LIMITS.temperature.min,
    SAMPLING_LIMITS.temperature.max,
  )
  const scaled = logits.map((logit) => logit / safeTemperature)
  const maximum = Math.max(...scaled)
  const exponentials = scaled.map((logit) => Math.exp(logit - maximum))
  const total = exponentials.reduce((sum, value) => sum + value, 0)
  return exponentials.map((value) => value / total)
}

function seededRandom(seed: number) {
  let value = seed >>> 0
  value += 0x6d2b79f5
  value = Math.imul(value ^ (value >>> 15), value | 1)
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
  return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
}

export function runSamplingExperiment(
  sourceCandidates: readonly TraceCandidate[],
  requestedParameters: Partial<SamplingParameters> = DEFAULT_SAMPLING_PARAMETERS,
): SamplingExperiment {
  const parameters = normalizeSamplingParameters(
    requestedParameters,
    sourceCandidates.length,
  )
  if (sourceCandidates.length === 0) {
    return { parameters, candidates: [], sampledCandidate: null, eligibleCount: 0 }
  }

  const temperatureProbabilities = softmaxLogits(
    sourceCandidates.map((candidate) => candidate.logit),
    parameters.temperature,
  )
  const ranked = sourceCandidates
    .map((candidate, index) => ({
      ...candidate,
      temperatureProbability: temperatureProbabilities[index] ?? 0,
    }))
    .sort(
      (left, right) =>
        right.temperatureProbability - left.temperatureProbability ||
        left.tokenId - right.tokenId,
    )

  const topKCandidates = ranked.slice(0, parameters.topK)
  const topKTotal = topKCandidates.reduce(
    (sum, candidate) => sum + candidate.temperatureProbability,
    0,
  )
  let cumulative = 0
  let eligibleCount = topKCandidates.length
  for (let index = 0; index < topKCandidates.length; index += 1) {
    cumulative += (topKCandidates[index]?.temperatureProbability ?? 0) / topKTotal
    if (cumulative >= parameters.topP) {
      eligibleCount = index + 1
      break
    }
  }

  const eligibleIds = new Set(
    topKCandidates.slice(0, eligibleCount).map((candidate) => candidate.tokenId),
  )
  const eligibleTotal = ranked.reduce(
    (sum, candidate) =>
      sum + (eligibleIds.has(candidate.tokenId) ? candidate.temperatureProbability : 0),
    0,
  )
  let finalCumulative = 0
  const candidates = ranked.map<SamplingCandidate>((candidate) => {
    const eligible = eligibleIds.has(candidate.tokenId)
    const probability = eligible
      ? candidate.temperatureProbability / eligibleTotal
      : 0
    if (eligible) finalCumulative += probability
    return {
      ...candidate,
      probability,
      cumulativeProbability: finalCumulative,
      eligible,
    }
  })

  const randomValue = seededRandom(parameters.seed)
  const sampledCandidate =
    candidates.find(
      (candidate) =>
        candidate.eligible && randomValue <= candidate.cumulativeProbability,
    ) ?? candidates.findLast((candidate) => candidate.eligible) ?? null

  return { parameters, candidates, sampledCandidate, eligibleCount }
}
