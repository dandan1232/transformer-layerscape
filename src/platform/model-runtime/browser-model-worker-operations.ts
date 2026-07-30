import type { Tensor as OrtTensor } from 'onnxruntime-web'
import { DISTILGPT2_INSTRUMENTATION_PATCH } from './distilgpt2-instrumentation-patch.mjs'
import { applyModelBinaryPatch, ModelBinaryPatchError } from './model-binary-patch'
import {
  CacheStorageModelResourceCache,
  loadDistilgpt2Resources,
  ModelResourceLoadError,
  type LoadedModelResources,
  type ModelResourceProgress,
} from './model-resource-loader'
import { DISTILGPT2_RESOURCE_MANIFEST } from './model-resources'
import {
  createDistilgpt2InferencePayload,
  type RuntimeInferenceTensor,
  type RuntimeInferenceTokenizer,
} from './distilgpt2-inference'
import {
  ModelWorkerOperationError,
  type ModelWorkerOperations,
} from './model-worker-runtime'

interface RuntimeSession {
  run(tokenIds: readonly number[]): Promise<Readonly<Record<string, RuntimeInferenceTensor>>>
  release(): Promise<void>
}

export interface BrowserModelWorkerDependencies {
  readonly loadResources: (options: {
    readonly signal: AbortSignal
    readonly onProgress: (progress: ModelResourceProgress) => void
  }) => Promise<LoadedModelResources>
  readonly instrumentModel: (
    source: ArrayBuffer,
    signal: AbortSignal,
  ) => Promise<ArrayBuffer>
  readonly createSession: (model: ArrayBuffer) => Promise<RuntimeSession>
  readonly createTokenizer: (resources: LoadedModelResources) => Promise<RuntimeInferenceTokenizer>
  readonly createInferencePayload: typeof createDistilgpt2InferencePayload
}

async function createWasmSession(model: ArrayBuffer): Promise<RuntimeSession> {
  const ort = await import('onnxruntime-web/wasm')
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })
  return {
    async run(tokenIds) {
      const sequenceLength = tokenIds.length
      const feeds: Record<string, OrtTensor> = {
        input_ids: new ort.Tensor(
          'int64', BigInt64Array.from(tokenIds, (value) => BigInt(value)),
          [1, sequenceLength],
        ),
        attention_mask: new ort.Tensor(
          'int64', BigInt64Array.from({ length: sequenceLength }, () => 1n),
          [1, sequenceLength],
        ),
        use_cache_branch: new ort.Tensor('bool', Uint8Array.of(0), [1]),
      }
      for (let layerIndex = 0; layerIndex < 6; layerIndex += 1) {
        for (const kind of ['key', 'value']) {
          feeds[`past_key_values.${layerIndex}.${kind}`] = new ort.Tensor(
            'float32', new Float32Array(0), [1, 12, 0, 64],
          )
        }
      }
      const result = await session.run(feeds)
      return result
    },
    release: () => session.release(),
  }
}

async function createBrowserTokenizer(
  resources: LoadedModelResources,
): Promise<RuntimeInferenceTokenizer> {
  const tokenizerBytes = resources.files.get('tokenizer.json')
  const configBytes = resources.files.get('tokenizer_config.json')
  if (!tokenizerBytes || !configBytes) throw new Error('模型资源缺少 Tokenizer 文件。')
  const decoder = new TextDecoder()
  const tokenizerJson = JSON.parse(decoder.decode(tokenizerBytes)) as object
  const tokenizerConfig = JSON.parse(decoder.decode(configBytes)) as object
  const { Tokenizer } = await import('@huggingface/tokenizers')
  const tokenizer = new Tokenizer(tokenizerJson, tokenizerConfig)
  const decodedTokens = new Map<number, string>()
  const decodeToken = (tokenId: number) => {
    const cached = decodedTokens.get(tokenId)
    if (cached !== undefined) return cached
    const decoded = tokenizer.decode([tokenId], {
      skip_special_tokens: false,
      clean_up_tokenization_spaces: false,
    })
    decodedTokens.set(tokenId, decoded)
    return decoded
  }

  return {
    tokenize(text) {
      const encoded = tokenizer.encode(text, { add_special_tokens: false })
      return {
        tokenIds: encoded.ids,
        tokens: encoded.ids.map(decodeToken),
      }
    },
    decodeToken,
  }
}

function defaultDependencies(): BrowserModelWorkerDependencies {
  return {
    loadResources: (options) => loadDistilgpt2Resources({
      cache: new CacheStorageModelResourceCache(),
      fetch: globalThis.fetch.bind(globalThis),
      ...options,
    }),
    instrumentModel: (source, signal) => applyModelBinaryPatch(
      source,
      DISTILGPT2_INSTRUMENTATION_PATCH,
      { signal, verifySource: false },
    ),
    createSession: createWasmSession,
    createTokenizer: createBrowserTokenizer,
    createInferencePayload: createDistilgpt2InferencePayload,
  }
}

function abortIfNeeded(signal: AbortSignal) {
  if (signal.aborted) {
    throw new DOMException(
      typeof signal.reason === 'string' ? signal.reason : '真实模型推理已取消。',
      'AbortError',
    )
  }
}

function loadingError(error: unknown): ModelWorkerOperationError {
  if (error instanceof ModelWorkerOperationError) return error
  if (error instanceof ModelResourceLoadError) {
    const integrityFailure = error.code === 'SIZE' || error.code === 'INTEGRITY'
    return new ModelWorkerOperationError(
      integrityFailure ? 'INTEGRITY_FAILED' : 'DOWNLOAD_FAILED',
      error.message,
      { retryable: !integrityFailure },
    )
  }
  if (error instanceof ModelBinaryPatchError) {
    return new ModelWorkerOperationError('INTEGRITY_FAILED', error.message)
  }
  return new ModelWorkerOperationError(
    'INITIALIZATION_FAILED',
    error instanceof Error ? error.message : '真实模型初始化失败。',
    { retryable: true },
  )
}

export function createBrowserModelWorkerOperations(
  dependencies: BrowserModelWorkerDependencies = defaultDependencies(),
): ModelWorkerOperations {
  let session: RuntimeSession | null = null
  let tokenizer: RuntimeInferenceTokenizer | null = null
  let loading = false

  return {
    supportedExecutionProviders: ['wasm'],

    async loadModel(payload, context) {
      if (payload.resourceId !== DISTILGPT2_RESOURCE_MANIFEST.id) {
        throw new ModelWorkerOperationError(
          'INVALID_MESSAGE', `未知模型资源 ${payload.resourceId}。`,
        )
      }
      if (!payload.preferredExecutionProviders.includes('wasm')) {
        throw new ModelWorkerOperationError(
          'UNSUPPORTED_RUNTIME', '当前版本需要浏览器 WASM 推理能力。',
        )
      }
      if (loading) {
        throw new ModelWorkerOperationError('INVALID_MESSAGE', '模型正在加载，请勿重复请求。')
      }

      loading = true
      let nextSession: RuntimeSession | null = null
      let nextTokenizer: RuntimeInferenceTokenizer | null = null
      try {
        const resources = await dependencies.loadResources({
          signal: context.signal,
          onProgress: (progress) => context.reportProgress({
            phase: 'downloading',
            loadedBytes: progress.loadedBytes,
            totalBytes: progress.totalBytes,
            file: progress.file,
          }),
        })
        context.reportProgress({
          phase: 'verifying',
          loadedBytes: DISTILGPT2_RESOURCE_MANIFEST.teachingTrace.artifact.bytes,
          totalBytes: DISTILGPT2_RESOURCE_MANIFEST.teachingTrace.artifact.bytes,
        })
        const sourceModel = resources.files.get(
          'onnx/decoder_model_merged_quantized.onnx',
        )
        if (!sourceModel) {
          throw new ModelWorkerOperationError(
            'INTEGRITY_FAILED', '模型资源缺少固定 ONNX 文件。',
          )
        }

        context.reportProgress({
          phase: 'instrumenting',
          loadedBytes: 0,
          totalBytes: DISTILGPT2_RESOURCE_MANIFEST.teachingTrace.artifact.bytes,
        })
        const instrumentedModel = await dependencies.instrumentModel(
          sourceModel,
          context.signal,
        )
        context.reportProgress({
          phase: 'instrumenting',
          loadedBytes: instrumentedModel.byteLength,
          totalBytes: DISTILGPT2_RESOURCE_MANIFEST.teachingTrace.artifact.bytes,
        })
        context.reportProgress({
          phase: 'initializing',
          loadedBytes: 0,
          totalBytes: instrumentedModel.byteLength,
        })
        nextTokenizer = await dependencies.createTokenizer(resources)
        nextSession = await dependencies.createSession(instrumentedModel)
        if (context.signal.aborted) {
          await nextSession.release()
          nextSession = null
          throw new DOMException('模型加载已取消。', 'AbortError')
        }
        context.reportProgress({
          phase: 'initializing',
          loadedBytes: instrumentedModel.byteLength,
          totalBytes: instrumentedModel.byteLength,
        })

        await session?.release()
        session = nextSession
        tokenizer = nextTokenizer
        nextSession = null
        nextTokenizer = null
        return {
          modelId: DISTILGPT2_RESOURCE_MANIFEST.id,
          executionProvider: 'wasm',
          cacheHit: resources.cacheHit,
        }
      } catch (error) {
        await nextSession?.release()
        if (context.signal.aborted) throw error
        throw loadingError(error)
      } finally {
        loading = false
      }
    },

    async runInference(payload, context) {
      if (!session || !tokenizer) {
        throw new ModelWorkerOperationError('MODEL_NOT_LOADED', '请先加载真实模型。')
      }
      try {
        abortIfNeeded(context.signal)
        const tokenized = tokenizer.tokenize(payload.text)
        const startedAt = performance.now()
        const outputs = await session.run(tokenized.tokenIds)
        abortIfNeeded(context.signal)
        return dependencies.createInferencePayload({
          text: payload.text,
          tokenized,
          tokenizer,
          outputs,
          selectedLayerIndex: payload.selectedLayerIndex,
          sampling: payload.sampling,
          inferenceMilliseconds: performance.now() - startedAt,
        })
      } catch (error) {
        if (context.signal.aborted) throw error
        if (error instanceof ModelWorkerOperationError) throw error
        throw new ModelWorkerOperationError(
          'INFERENCE_FAILED',
          error instanceof Error ? error.message : '真实模型推理失败。',
          { retryable: true },
        )
      }
    },

    async disposeModel() {
      await session?.release()
      session = null
      tokenizer = null
    },
  }
}
