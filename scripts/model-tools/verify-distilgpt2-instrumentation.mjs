import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ort from 'onnxruntime-node'
import {
  DISTILGPT2_LAYER_COUNT,
  DISTILGPT2_PROMOTED_OUTPUTS,
} from '../../src/platform/model-runtime/instrumentation-plan.mjs'

function usage() {
  throw new Error(
    'Usage: node scripts/model-tools/verify-distilgpt2-instrumentation.mjs <plain.onnx> <instrumented.onnx>',
  )
}

function createFeeds(tokenIds) {
  const sequenceLength = tokenIds.length
  const feeds = {
    input_ids: new ort.Tensor('int64', BigInt64Array.from(tokenIds, BigInt), [1, sequenceLength]),
    attention_mask: new ort.Tensor(
      'int64',
      BigInt64Array.from({ length: sequenceLength }, () => 1n),
      [1, sequenceLength],
    ),
    use_cache_branch: new ort.Tensor('bool', Uint8Array.of(0), [1]),
  }

  for (let layerIndex = 0; layerIndex < DISTILGPT2_LAYER_COUNT; layerIndex += 1) {
    for (const kind of ['key', 'value']) {
      feeds[`past_key_values.${layerIndex}.${kind}`] = new ort.Tensor(
        'float32',
        new Float32Array(0),
        [1, 12, 0, 64],
      )
    }
  }
  return feeds
}

function maximumAbsoluteDifference(left, right) {
  if (left.length !== right.length) throw new Error('Tensor lengths differ')
  let maximum = 0
  for (let index = 0; index < left.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(left[index] - right[index]))
  }
  return maximum
}

function maximumAdditiveDifference(left, right, sum) {
  if (left.length !== right.length || left.length !== sum.length) {
    throw new Error('Tensor lengths differ')
  }
  let maximum = 0
  for (let index = 0; index < left.length; index += 1) {
    maximum = Math.max(maximum, Math.abs(left[index] + right[index] - sum[index]))
  }
  return maximum
}

function verifyAttention(weights, queryLength, keyLength, queryOffset = 0) {
  const [batchSize, headCount, queryCount, keyCount] = weights.dims
  if (batchSize !== 1 || headCount !== 12 || queryCount !== queryLength || keyCount !== keyLength) {
    throw new Error(`Unexpected attention shape ${weights.dims.join('x')}`)
  }

  let maximumRowSumError = 0
  let maximumFutureWeight = 0
  for (let headIndex = 0; headIndex < headCount; headIndex += 1) {
    for (let queryIndex = 0; queryIndex < queryCount; queryIndex += 1) {
      let rowSum = 0
      for (let keyIndex = 0; keyIndex < keyCount; keyIndex += 1) {
        const index = ((headIndex * queryCount) + queryIndex) * keyCount + keyIndex
        const value = weights.data[index]
        rowSum += value
        if (keyIndex > queryOffset + queryIndex) {
          maximumFutureWeight = Math.max(maximumFutureWeight, value)
        }
      }
      maximumRowSumError = Math.max(maximumRowSumError, Math.abs(1 - rowSum))
    }
  }
  return { maximumRowSumError, maximumFutureWeight }
}

function assertShape(tensor, expected, name) {
  if (tensor.dims.join('x') !== expected.join('x')) {
    throw new Error(`${name} shape was ${tensor.dims.join('x')}, expected ${expected.join('x')}`)
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export async function main(args) {
  if (args.length !== 2) usage()
  const [plainArgument, instrumentedArgument] = args
  const plainPath = resolve(plainArgument)
  const instrumentedPath = resolve(instrumentedArgument)
  const options = { executionProviders: ['cpu'], graphOptimizationLevel: 'all' }
  const [plainSession, instrumentedSession] = await Promise.all([
    ort.InferenceSession.create(plainPath, options),
    ort.InferenceSession.create(instrumentedPath, options),
  ])

  try {
    const missingOutputs = DISTILGPT2_PROMOTED_OUTPUTS
      .map((output) => output.outputName)
      .filter((name) => !instrumentedSession.outputNames.includes(name))
    if (missingOutputs.length > 0) throw new Error(`Missing outputs: ${missingOutputs.join(', ')}`)

    const tokenIds = [15496, 995, 0]
    const feeds = createFeeds(tokenIds)
    const selectedOutputNames = [
      'logits',
      ...DISTILGPT2_PROMOTED_OUTPUTS.map((output) => output.outputName),
      ...Array.from({ length: DISTILGPT2_LAYER_COUNT }, (_, layerIndex) => [
        `present.${layerIndex}.key`,
        `present.${layerIndex}.value`,
      ]).flat(),
    ]
    const startedAt = performance.now()
    const [plainResult, instrumentedResult] = await Promise.all([
      plainSession.run(feeds, ['logits']),
      instrumentedSession.run(feeds, selectedOutputNames),
    ])
    const inferenceMilliseconds = performance.now() - startedAt

    const logitsMaximumDifference = maximumAbsoluteDifference(
      plainResult.logits.data,
      instrumentedResult.logits.data,
    )
    if (logitsMaximumDifference > 1e-4) {
      throw new Error(`Instrumented logits changed by ${logitsMaximumDifference}`)
    }

    const sequenceLength = tokenIds.length
    assertShape(instrumentedResult['trace.embedding.token'], [1, sequenceLength, 768], 'token embedding')
    assertShape(instrumentedResult['trace.embedding.position'], [1, sequenceLength, 768], 'position embedding')
    const embeddingAddMaximumDifference = maximumAdditiveDifference(
      instrumentedResult['trace.embedding.token'].data,
      instrumentedResult['trace.embedding.position'].data,
      instrumentedResult['trace.embedding.sum'].data,
    )

    let attentionMaximumRowSumError = 0
    let attentionMaximumFutureWeight = 0
    let residualMaximumDifference = 0
    for (let layerIndex = 0; layerIndex < DISTILGPT2_LAYER_COUNT; layerIndex += 1) {
      const prefix = `trace.layer.${layerIndex}`
      assertShape(instrumentedResult[`${prefix}.query`], [1, 12, sequenceLength, 64], `${prefix}.query`)
      assertShape(instrumentedResult[`present.${layerIndex}.key`], [1, 12, sequenceLength, 64], `present.${layerIndex}.key`)
      assertShape(instrumentedResult[`present.${layerIndex}.value`], [1, 12, sequenceLength, 64], `present.${layerIndex}.value`)
      assertShape(instrumentedResult[`${prefix}.mlpActivated`], [1, sequenceLength, 3072], `${prefix}.mlpActivated`)
      assertShape(instrumentedResult[`${prefix}.blockOutput`], [1, sequenceLength, 768], `${prefix}.blockOutput`)

      const attention = verifyAttention(
        instrumentedResult[`${prefix}.attentionWeights`],
        sequenceLength,
        sequenceLength,
      )
      attentionMaximumRowSumError = Math.max(
        attentionMaximumRowSumError,
        attention.maximumRowSumError,
      )
      attentionMaximumFutureWeight = Math.max(
        attentionMaximumFutureWeight,
        attention.maximumFutureWeight,
      )

      residualMaximumDifference = Math.max(
        residualMaximumDifference,
        maximumAdditiveDifference(
          instrumentedResult[`${prefix}.attentionProjected`].data,
          layerIndex === 0
            ? instrumentedResult['trace.embedding.sum'].data
            : instrumentedResult[`trace.layer.${layerIndex - 1}.blockOutput`].data,
          instrumentedResult[`${prefix}.attentionResidual`].data,
        ),
        maximumAdditiveDifference(
          instrumentedResult[`${prefix}.mlpProjected`].data,
          instrumentedResult[`${prefix}.attentionResidual`].data,
          instrumentedResult[`${prefix}.blockOutput`].data,
        ),
      )
    }

    const cachedFeeds = {
      input_ids: new ort.Tensor('int64', BigInt64Array.of(318n), [1, 1]),
      attention_mask: new ort.Tensor('int64', BigInt64Array.of(1n, 1n, 1n, 1n), [1, 4]),
      use_cache_branch: new ort.Tensor('bool', Uint8Array.of(1), [1]),
    }
    for (let layerIndex = 0; layerIndex < DISTILGPT2_LAYER_COUNT; layerIndex += 1) {
      cachedFeeds[`past_key_values.${layerIndex}.key`] =
        instrumentedResult[`present.${layerIndex}.key`]
      cachedFeeds[`past_key_values.${layerIndex}.value`] =
        instrumentedResult[`present.${layerIndex}.value`]
    }
    const cachedOutputNames = [
      'logits',
      'trace.embedding.sum',
      'trace.layer.0.query',
      'trace.layer.0.attentionWeights',
    ]
    const [plainCachedResult, instrumentedCachedResult] = await Promise.all([
      plainSession.run(cachedFeeds, ['logits']),
      instrumentedSession.run(cachedFeeds, cachedOutputNames),
    ])
    const cachedLogitsMaximumDifference = maximumAbsoluteDifference(
      plainCachedResult.logits.data,
      instrumentedCachedResult.logits.data,
    )
    if (cachedLogitsMaximumDifference > 1e-4) {
      throw new Error(`Instrumented cached logits changed by ${cachedLogitsMaximumDifference}`)
    }
    assertShape(instrumentedCachedResult['trace.embedding.sum'], [1, 1, 768], 'cached embedding')
    assertShape(instrumentedCachedResult['trace.layer.0.query'], [1, 12, 1, 64], 'cached query')
    const cachedAttention = verifyAttention(
      instrumentedCachedResult['trace.layer.0.attentionWeights'],
      1,
      4,
      3,
    )

    const result = {
      plainSha256: sha256(plainPath),
      instrumentedSha256: sha256(instrumentedPath),
      plainBytes: readFileSync(plainPath).byteLength,
      instrumentedBytes: readFileSync(instrumentedPath).byteLength,
      promotedOutputCount: DISTILGPT2_PROMOTED_OUTPUTS.length,
      totalOutputCount: instrumentedSession.outputNames.length,
      tokenIds,
      inferenceMilliseconds: Number(inferenceMilliseconds.toFixed(2)),
      logitsMaximumDifference,
      cachedLogitsMaximumDifference,
      embeddingAddMaximumDifference,
      residualMaximumDifference,
      attentionMaximumRowSumError,
      attentionMaximumFutureWeight,
      cachedAttentionMaximumRowSumError: cachedAttention.maximumRowSumError,
      cachedAttentionMaximumFutureWeight: cachedAttention.maximumFutureWeight,
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    await Promise.all([plainSession.release(), instrumentedSession.release()])
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2))
}
