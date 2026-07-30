import { describe, expect, it, vi } from 'vitest'
import {
  attachModelWorkerRuntime,
  ModelWorkerOperationError,
  type ModelWorkerOperations,
  type ModelWorkerScope,
} from './model-worker-runtime'
import {
  createWorkerTensorPayload,
  MODEL_WORKER_PROTOCOL_VERSION,
  type ModelWorkerCommand,
  type ModelWorkerEvent,
} from './worker-protocol'

class FakeScope implements ModelWorkerScope {
  readonly messages: Array<{
    readonly event: ModelWorkerEvent
    readonly transfer: readonly Transferable[]
  }> = []
  private listener: ((event: MessageEvent<unknown>) => void) | null = null

  postMessage(event: ModelWorkerEvent, transfer: readonly Transferable[] = []) {
    this.messages.push({ event, transfer })
  }

  addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
    this.listener = listener
  }

  removeEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
    if (this.listener === listener) this.listener = null
  }

  dispatch(command: unknown) {
    this.listener?.({ data: command } as MessageEvent<unknown>)
  }
}

function operations(overrides: Partial<ModelWorkerOperations> = {}): ModelWorkerOperations {
  return {
    supportedExecutionProviders: ['webgpu', 'wasm'],
    loadModel: vi.fn(async () => ({
      modelId: 'distilgpt2',
      executionProvider: 'wasm' as const,
      cacheHit: false,
    })),
    runInference: vi.fn(async () => ({
      modelId: 'distilgpt2',
      executionProvider: 'wasm' as const,
      input: { text: 'Hello', tokenIds: [15496], tokens: ['Hello'] },
      output: { sampledTokenId: 995, sampledToken: ' world', candidates: [] },
      tensors: [],
      inferenceMilliseconds: 10,
    })),
    disposeModel: vi.fn(async () => undefined),
    ...overrides,
  }
}

function command(
  value: Omit<Extract<ModelWorkerCommand, { type: 'load-model' }>, 'version'>,
): ModelWorkerCommand {
  return { version: MODEL_WORKER_PROTOCOL_VERSION, ...value }
}

async function nextTurn() {
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('model Worker runtime', () => {
  it('announces supported execution providers when attached', () => {
    const scope = new FakeScope()
    attachModelWorkerRuntime(scope, operations())
    expect(scope.messages[0].event).toEqual({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'worker-ready',
      payload: { supportedExecutionProviders: ['webgpu', 'wasm'] },
    })
  })

  it('correlates load progress and the loaded result with the request', async () => {
    const scope = new FakeScope()
    attachModelWorkerRuntime(scope, operations({
      loadModel: vi.fn(async (_payload, context) => {
        context.reportProgress({
          phase: 'downloading', loadedBytes: 25, totalBytes: 100,
        })
        return {
          modelId: 'distilgpt2', executionProvider: 'wasm' as const, cacheHit: false,
        }
      }),
    }))
    scope.dispatch(command({
      type: 'load-model',
      requestId: 'load-1',
      payload: {
        resourceId: 'distilgpt2-q8-browser-candidate',
        preferredExecutionProviders: ['webgpu', 'wasm'],
      },
    }))
    await nextTurn()

    expect(scope.messages.slice(1).map(({ event }) => event.type)).toEqual([
      'model-load-progress',
      'model-loaded',
    ])
    expect(scope.messages[1].event).toMatchObject({ requestId: 'load-1' })
    expect(scope.messages[2].event).toMatchObject({ requestId: 'load-1' })
  })

  it('posts inference ArrayBuffers as a deduplicated transfer list', async () => {
    const scope = new FakeScope()
    const tensor = createWorkerTensorPayload({
      id: 'embedding', role: 'embedding', name: 'Embedding', dtype: 'float32',
      shape: [2], sampleMethod: 'full',
    }, new Float32Array([1, 2]))
    attachModelWorkerRuntime(scope, operations({
      runInference: vi.fn(async () => ({
        modelId: 'distilgpt2', executionProvider: 'wasm' as const,
        input: { text: 'Hello', tokenIds: [15496], tokens: ['Hello'] },
        output: { sampledTokenId: 995, sampledToken: ' world', candidates: [] },
        tensors: [tensor], inferenceMilliseconds: 10,
      })),
    }))
    scope.dispatch({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'run-inference',
      requestId: 'infer-1',
      payload: {
        text: 'Hello', selectedLayerIndex: 0,
        sampling: { temperature: 1, topK: 5, topP: 0.9, seed: 7 },
      },
    })
    await nextTurn()

    expect(scope.messages.at(-1)?.event.type).toBe('inference-result')
    expect(scope.messages.at(-1)?.transfer).toEqual([tensor.data])
  })

  it('aborts active work and suppresses a late terminal result', async () => {
    const scope = new FakeScope()
    let resolveLoad: (() => void) | undefined
    const loadModel = vi.fn((_payload, context) => new Promise<{
      modelId: string
      executionProvider: 'wasm'
      cacheHit: boolean
    }>((resolvePromise) => {
      resolveLoad = () => resolvePromise({
        modelId: 'distilgpt2', executionProvider: 'wasm', cacheHit: false,
      })
      context.signal.addEventListener('abort', resolveLoad)
    }))
    attachModelWorkerRuntime(scope, operations({ loadModel }))
    scope.dispatch(command({
      type: 'load-model', requestId: 'load-cancel',
      payload: { resourceId: 'distilgpt2', preferredExecutionProviders: ['wasm'] },
    }))
    scope.dispatch({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'cancel-request',
      requestId: 'load-cancel',
      payload: { reason: '用户取消' },
    })
    resolveLoad?.()
    await nextTurn()

    expect(scope.messages.map(({ event }) => event.type)).toContain('request-cancelled')
    expect(scope.messages.map(({ event }) => event.type)).not.toContain('model-loaded')
  })

  it('normalizes operation failures and rejects malformed commands', async () => {
    const scope = new FakeScope()
    attachModelWorkerRuntime(scope, operations({
      runInference: vi.fn(async () => {
        throw new ModelWorkerOperationError('MODEL_NOT_LOADED', '请先加载模型。')
      }),
    }))
    scope.dispatch({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'run-inference',
      requestId: 'infer-error',
      payload: {
        text: 'Hello', selectedLayerIndex: 0,
        sampling: { temperature: 1, topK: 5, topP: 0.9, seed: 7 },
      },
    })
    scope.dispatch({ type: 'unknown', requestId: 'bad' })
    await nextTurn()

    expect(scope.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: expect.objectContaining({
          type: 'worker-error', requestId: 'infer-error',
          payload: expect.objectContaining({ code: 'MODEL_NOT_LOADED' }),
        }),
      }),
      expect.objectContaining({
        event: expect.objectContaining({
          type: 'worker-error', requestId: 'bad',
          payload: expect.objectContaining({ code: 'INVALID_MESSAGE' }),
        }),
      }),
    ]))
  })
})
