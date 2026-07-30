import { describe, expect, it, vi } from 'vitest'
import {
  createBrowserModelWorkerOperations,
  type BrowserModelWorkerDependencies,
} from './browser-model-worker-operations'
import { DISTILGPT2_RESOURCE_MANIFEST } from './model-resources'

const inferenceResult = {
  modelId: 'distilgpt2',
  executionProvider: 'wasm' as const,
  input: { text: 'Hello', tokenIds: [15496], tokens: ['Hello'] },
  output: {
    sampledTokenId: 0,
    sampledToken: '!',
    candidates: [{ tokenId: 0, token: '!', logit: 1, probability: 1 }],
  },
  tensors: [],
  inferenceMilliseconds: 1,
}

function dependencies(
  overrides: Partial<BrowserModelWorkerDependencies> = {},
): BrowserModelWorkerDependencies {
  return {
    loadResources: vi.fn(async ({ onProgress }) => {
      onProgress({
        file: 'onnx/decoder_model_merged_quantized.onnx',
        source: 'network',
        fileLoadedBytes: 3,
        fileTotalBytes: 3,
        loadedBytes: 3,
        totalBytes: 3,
      })
      return {
        files: new Map([[
          'onnx/decoder_model_merged_quantized.onnx',
          Uint8Array.from([1, 2, 3]).buffer,
        ]]),
        cacheHit: false,
        cacheWriteFailures: [],
      }
    }),
    instrumentModel: vi.fn(async () => Uint8Array.from([4, 5, 6]).buffer),
    createSession: vi.fn(async () => ({
      run: vi.fn(async () => ({})),
      release: vi.fn(async () => undefined),
    })),
    createTokenizer: vi.fn(async () => ({
      tokenize: () => ({ tokenIds: [15496], tokens: ['Hello'] }),
      decodeToken: () => '!',
    })),
    createInferencePayload: vi.fn(() => inferenceResult),
    ...overrides,
  }
}

function context(signal = new AbortController().signal) {
  return { signal, reportProgress: vi.fn() }
}

describe('browser model Worker operations', () => {
  it('downloads, verifies, instruments and initializes without blocking the caller thread', async () => {
    const deps = dependencies()
    const operations = createBrowserModelWorkerOperations(deps)
    const operationContext = context()
    const result = await operations.loadModel({
      resourceId: DISTILGPT2_RESOURCE_MANIFEST.id,
      preferredExecutionProviders: ['webgpu', 'wasm'],
    }, operationContext)

    expect(result).toEqual({
      modelId: DISTILGPT2_RESOURCE_MANIFEST.id,
      executionProvider: 'wasm',
      cacheHit: false,
    })
    expect(operationContext.reportProgress.mock.calls.map(([value]) => value.phase)).toEqual([
      'downloading', 'verifying', 'instrumenting', 'instrumenting',
      'initializing', 'initializing',
    ])
    expect(deps.createSession).toHaveBeenCalledWith(Uint8Array.from([4, 5, 6]).buffer)
  })

  it('rejects unknown resources and unavailable execution providers', async () => {
    const operations = createBrowserModelWorkerOperations(dependencies())
    await expect(operations.loadModel({
      resourceId: 'unknown', preferredExecutionProviders: ['wasm'],
    }, context())).rejects.toMatchObject({ code: 'INVALID_MESSAGE' })
    await expect(operations.loadModel({
      resourceId: DISTILGPT2_RESOURCE_MANIFEST.id,
      preferredExecutionProviders: ['webgpu'],
    }, context())).rejects.toMatchObject({ code: 'UNSUPPORTED_RUNTIME' })
  })

  it('releases a newly created Session when cancellation wins the initialization race', async () => {
    const controller = new AbortController()
    const release = vi.fn(async () => undefined)
    const deps = dependencies({
      createSession: vi.fn(async () => {
        controller.abort('用户取消')
        return { run: vi.fn(async () => ({})), release }
      }),
    })
    const operations = createBrowserModelWorkerOperations(deps)

    await expect(operations.loadModel({
      resourceId: DISTILGPT2_RESOURCE_MANIFEST.id,
      preferredExecutionProviders: ['wasm'],
    }, context(controller.signal))).rejects.toMatchObject({ name: 'AbortError' })
    expect(release).toHaveBeenCalledOnce()
  })

  it('requires a loaded Session, runs inference and releases it on disposal', async () => {
    const release = vi.fn(async () => undefined)
    const run = vi.fn(async () => ({}))
    const createInferencePayload = vi.fn(() => inferenceResult)
    const operations = createBrowserModelWorkerOperations(dependencies({
      createSession: vi.fn(async () => ({ run, release })),
      createInferencePayload,
    }))
    const inferenceContext = context()
    await expect(operations.runInference({
      text: 'Hello', selectedLayerIndex: 0,
      sampling: { temperature: 1, topK: 5, topP: 0.9, seed: 7 },
    }, inferenceContext)).rejects.toMatchObject({
      code: 'MODEL_NOT_LOADED',
    })

    await operations.loadModel({
      resourceId: DISTILGPT2_RESOURCE_MANIFEST.id,
      preferredExecutionProviders: ['wasm'],
    }, context())
    await expect(operations.runInference({
      text: 'Hello', selectedLayerIndex: 0,
      sampling: { temperature: 1, topK: 5, topP: 0.9, seed: 7 },
    }, context())).resolves.toBe(inferenceResult)
    expect(run).toHaveBeenCalledWith([15496])
    expect(createInferencePayload).toHaveBeenCalledOnce()
    await operations.disposeModel(context())
    expect(release).toHaveBeenCalledOnce()
  })

  it('rejects more than 12 exact tokenizer tokens before ONNX inference', async () => {
    const run = vi.fn(async () => ({}))
    const operations = createBrowserModelWorkerOperations(dependencies({
      createSession: vi.fn(async () => ({
        run,
        release: vi.fn(async () => undefined),
      })),
      createTokenizer: vi.fn(async () => ({
        tokenize: () => ({
          tokenIds: Array.from({ length: 13 }, (_, index) => index),
          tokens: Array.from({ length: 13 }, (_, index) => `T${index}`),
        }),
        decodeToken: (tokenId: number) => `T${tokenId}`,
      })),
    }))
    await operations.loadModel({
      resourceId: DISTILGPT2_RESOURCE_MANIFEST.id,
      preferredExecutionProviders: ['wasm'],
    }, context())

    await expect(operations.runInference({
      text: 'too many tokens', selectedLayerIndex: 0,
      sampling: { temperature: 1, topK: 5, topP: 0.9, seed: 7 },
    }, context())).rejects.toMatchObject({
      code: 'INPUT_VALIDATION_FAILED', retryable: false,
    })
    expect(run).not.toHaveBeenCalled()
  })
})
