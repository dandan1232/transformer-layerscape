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
  ModelWorkerOperationError,
  type ModelWorkerOperations,
} from './model-worker-runtime'

interface RuntimeSession {
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
}

async function createWasmSession(model: ArrayBuffer): Promise<RuntimeSession> {
  const ort = await import('onnxruntime-web/wasm')
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = false
  return ort.InferenceSession.create(model, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })
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
        nextSession = null
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

    async runInference() {
      if (!session) {
        throw new ModelWorkerOperationError('MODEL_NOT_LOADED', '请先加载真实模型。')
      }
      throw new ModelWorkerOperationError(
        'INFERENCE_FAILED', '真实模型 Trace 适配器将在 WP-34 接入。',
      )
    },

    async disposeModel() {
      await session?.release()
      session = null
    },
  }
}
