import { describe, expect, it, vi } from 'vitest'
import {
  ModelWorkerClient,
  ModelWorkerRequestError,
  type ModelWorkerClientPort,
} from './model-worker-client'
import {
  MODEL_WORKER_PROTOCOL_VERSION,
  type ModelWorkerCommand,
  type ModelWorkerEvent,
} from './worker-protocol'

class FakeWorkerPort implements ModelWorkerClientPort {
  readonly commands: ModelWorkerCommand[] = []
  readonly terminate = vi.fn()
  private messageListener: ((event: MessageEvent<unknown>) => void) | null = null
  private errorListener: ((event: ErrorEvent) => void) | null = null

  postMessage(message: ModelWorkerCommand) {
    this.commands.push(message)
  }

  addEventListener(type: 'message' | 'error', listener: never) {
    if (type === 'message') {
      this.messageListener = listener as (event: MessageEvent<unknown>) => void
    } else {
      this.errorListener = listener as (event: ErrorEvent) => void
    }
  }

  removeEventListener(type: 'message' | 'error', listener: never) {
    if (type === 'message' && this.messageListener === listener) this.messageListener = null
    if (type === 'error' && this.errorListener === listener) this.errorListener = null
  }

  emit(event: ModelWorkerEvent | unknown) {
    this.messageListener?.({ data: event } as MessageEvent<unknown>)
  }

  fail(message: string) {
    this.errorListener?.({ message } as ErrorEvent)
  }
}

const readyEvent = {
  version: MODEL_WORKER_PROTOCOL_VERSION,
  type: 'worker-ready',
  payload: { supportedExecutionProviders: ['wasm'] },
} as const

describe('model Worker client', () => {
  it('waits for readiness and correlates progress with a load request', async () => {
    const port = new FakeWorkerPort()
    const client = new ModelWorkerClient(port)
    const onProgress = vi.fn()
    const promise = client.loadModel({
      resourceId: 'distilgpt2', preferredExecutionProviders: ['wasm'],
    }, { onProgress })
    expect(port.commands).toHaveLength(0)

    port.emit(readyEvent)
    await Promise.resolve()
    expect(port.commands[0]).toMatchObject({ type: 'load-model', requestId: 'model-worker-1' })
    port.emit({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'model-load-progress',
      requestId: 'model-worker-1',
      payload: { phase: 'downloading', loadedBytes: 50, totalBytes: 100 },
    })
    port.emit({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'model-loaded',
      requestId: 'model-worker-1',
      payload: { modelId: 'distilgpt2', executionProvider: 'wasm', cacheHit: false },
    })

    await expect(promise).resolves.toMatchObject({ modelId: 'distilgpt2' })
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({ loadedBytes: 50 }))
  })

  it('keeps concurrent inference responses associated when they arrive out of order', async () => {
    const port = new FakeWorkerPort()
    const client = new ModelWorkerClient(port)
    port.emit(readyEvent)
    const input = {
      text: 'Hello', selectedLayerIndex: 0,
      sampling: { temperature: 1, topK: 5, topP: 0.9, seed: 7 },
    }
    const first = client.runInference(input)
    const second = client.runInference({ ...input, text: 'World' })
    await Promise.resolve()

    const payload = (text: string) => ({
      modelId: 'distilgpt2', executionProvider: 'wasm' as const,
      input: { text, tokenIds: [1], tokens: [text] },
      output: { sampledTokenId: 2, sampledToken: '!', candidates: [] },
      tensors: [], inferenceMilliseconds: 5,
    })
    port.emit({
      version: MODEL_WORKER_PROTOCOL_VERSION, type: 'inference-result',
      requestId: 'model-worker-2', payload: payload('World'),
    })
    port.emit({
      version: MODEL_WORKER_PROTOCOL_VERSION, type: 'inference-result',
      requestId: 'model-worker-1', payload: payload('Hello'),
    })

    await expect(first).resolves.toMatchObject({ input: { text: 'Hello' } })
    await expect(second).resolves.toMatchObject({ input: { text: 'World' } })
  })

  it('propagates structured Worker errors', async () => {
    const port = new FakeWorkerPort()
    const client = new ModelWorkerClient(port)
    port.emit(readyEvent)
    const promise = client.runInference({
      text: 'Hello', selectedLayerIndex: 0,
      sampling: { temperature: 1, topK: 5, topP: 0.9, seed: 7 },
    })
    await Promise.resolve()
    port.emit({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'worker-error',
      requestId: 'model-worker-1',
      payload: {
        code: 'MODEL_NOT_LOADED', message: '请先加载模型。', retryable: false,
      },
    })

    const error = await promise.catch((reason: unknown) => reason)
    expect(error).toBeInstanceOf(ModelWorkerRequestError)
    expect(error).toMatchObject({ code: 'MODEL_NOT_LOADED', retryable: false })
  })

  it('uses AbortSignal to reject locally and send a correlated cancellation', async () => {
    const port = new FakeWorkerPort()
    const client = new ModelWorkerClient(port)
    port.emit(readyEvent)
    const controller = new AbortController()
    const promise = client.loadModel({
      resourceId: 'distilgpt2', preferredExecutionProviders: ['wasm'],
    }, { signal: controller.signal })
    await Promise.resolve()
    controller.abort('用户取消')

    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(port.commands.at(-1)).toEqual({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'cancel-request',
      requestId: 'model-worker-1',
      payload: { reason: '用户取消' },
    })
  })

  it('rejects pending work on transport failure and terminates idempotently', async () => {
    const port = new FakeWorkerPort()
    const client = new ModelWorkerClient(port)
    port.emit(readyEvent)
    const promise = client.disposeModel()
    await Promise.resolve()
    port.fail('Worker crashed')
    await expect(promise).rejects.toThrow('Worker crashed')

    client.terminate()
    client.terminate()
    expect(port.terminate).toHaveBeenCalledOnce()
  })
})
