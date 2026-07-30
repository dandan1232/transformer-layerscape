/* v8 ignore file -- verified by the WP-31 browser integration probe */
import * as ort from 'onnxruntime-web/wasm'

export interface BrowserInstrumentationProbeResult {
  readonly executionProvider: 'wasm'
  readonly modelBytes: number
  readonly outputCount: number
  readonly logitsShape: readonly number[]
  readonly queryShape: readonly number[]
  readonly attentionShape: readonly number[]
  readonly mlpShape: readonly number[]
  readonly maximumAttentionRowSumError: number
  readonly maximumFutureWeight: number
  readonly inferenceMilliseconds: number
}

function createFeeds(tokenIds: readonly number[]): Record<string, ort.Tensor> {
  const sequenceLength = tokenIds.length
  const feeds: Record<string, ort.Tensor> = {
    input_ids: new ort.Tensor(
      'int64',
      BigInt64Array.from(tokenIds, (tokenId) => BigInt(tokenId)),
      [1, sequenceLength],
    ),
    attention_mask: new ort.Tensor(
      'int64',
      BigInt64Array.from({ length: sequenceLength }, () => 1n),
      [1, sequenceLength],
    ),
    use_cache_branch: new ort.Tensor('bool', Uint8Array.of(0), [1]),
  }

  for (let layerIndex = 0; layerIndex < 6; layerIndex += 1) {
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

function verifyAttention(weights: ort.Tensor, sequenceLength: number) {
  const [batchSize, headCount, queryCount, keyCount] = weights.dims
  if (
    batchSize !== 1 ||
    headCount !== 12 ||
    queryCount !== sequenceLength ||
    keyCount !== sequenceLength
  ) {
    throw new Error(`Unexpected attention shape ${weights.dims.join('x')}`)
  }

  const values = weights.data as Float32Array
  let maximumAttentionRowSumError = 0
  let maximumFutureWeight = 0
  for (let headIndex = 0; headIndex < headCount; headIndex += 1) {
    for (let queryIndex = 0; queryIndex < queryCount; queryIndex += 1) {
      let rowSum = 0
      for (let keyIndex = 0; keyIndex < keyCount; keyIndex += 1) {
        const index = ((headIndex * queryCount) + queryIndex) * keyCount + keyIndex
        const value = values[index]
        rowSum += value
        if (keyIndex > queryIndex) maximumFutureWeight = Math.max(maximumFutureWeight, value)
      }
      maximumAttentionRowSumError = Math.max(
        maximumAttentionRowSumError,
        Math.abs(1 - rowSum),
      )
    }
  }
  return { maximumAttentionRowSumError, maximumFutureWeight }
}

export async function runBrowserInstrumentationProbe(
  modelUrl: string,
): Promise<BrowserInstrumentationProbeResult> {
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false

  const response = await fetch(modelUrl)
  if (!response.ok) throw new Error(`Model request failed with ${response.status}`)
  const model = await response.arrayBuffer()
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })

  try {
    const tokenIds = [15496, 995, 0]
    const startedAt = performance.now()
    const output = await session.run(createFeeds(tokenIds), [
      'logits',
      'trace.layer.0.query',
      'trace.layer.0.attentionWeights',
      'trace.layer.0.mlpActivated',
    ])
    const inferenceMilliseconds = performance.now() - startedAt
    const attention = verifyAttention(
      output['trace.layer.0.attentionWeights'],
      tokenIds.length,
    )

    return {
      executionProvider: 'wasm',
      modelBytes: model.byteLength,
      outputCount: session.outputNames.length,
      logitsShape: output.logits.dims,
      queryShape: output['trace.layer.0.query'].dims,
      attentionShape: output['trace.layer.0.attentionWeights'].dims,
      mlpShape: output['trace.layer.0.mlpActivated'].dims,
      ...attention,
      inferenceMilliseconds: Number(inferenceMilliseconds.toFixed(2)),
    }
  } finally {
    await session.release()
  }
}
