import { describe, expect, it } from 'vitest'
import {
  createWorkerTensorPayload,
  isModelWorkerCommand,
  isModelWorkerEvent,
  MODEL_WORKER_PROTOCOL_VERSION,
  transferListForModelWorkerEvent,
  type InferenceResultEvent,
} from './worker-protocol'

describe('model Worker protocol', () => {
  it('accepts versioned commands and rejects incomplete or drifting envelopes', () => {
    expect(isModelWorkerCommand({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'load-model',
      requestId: 'load-1',
      payload: {
        resourceId: 'distilgpt2-q8-browser-candidate',
        preferredExecutionProviders: ['webgpu', 'wasm'],
      },
    })).toBe(true)
    expect(isModelWorkerCommand({
      version: 2,
      type: 'dispose-model',
      requestId: 'dispose-1',
    })).toBe(false)
    expect(isModelWorkerCommand({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'run-inference',
      requestId: '',
      payload: {},
    })).toBe(false)
    expect(isModelWorkerCommand({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'load-model',
      requestId: 'load-2',
      payload: { resourceId: 'distilgpt2', preferredExecutionProviders: ['cuda'] },
    })).toBe(false)
  })

  it('validates ready, progress and terminal Worker events', () => {
    expect(isModelWorkerEvent({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'worker-ready',
      payload: { supportedExecutionProviders: ['wasm'] },
    })).toBe(true)
    expect(isModelWorkerEvent({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'model-load-progress',
      requestId: 'load-1',
      payload: { phase: 'downloading', loadedBytes: 10, totalBytes: 100 },
    })).toBe(true)
    expect(isModelWorkerEvent({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'worker-error',
      payload: { code: 'INTERNAL_ERROR', message: 'boom', retryable: false },
    })).toBe(false)
    expect(isModelWorkerEvent({
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'model-load-progress',
      requestId: 'load-1',
      payload: { phase: 'downloading', loadedBytes: 101, totalBytes: 100 },
    })).toBe(false)
  })

  it('reuses whole buffers and safely copies partial typed-array views', () => {
    const whole = new Float32Array([1, 2, 3])
    const wholePayload = createWorkerTensorPayload({
      id: 'whole',
      role: 'embedding',
      name: 'Whole',
      dtype: 'float32',
      shape: [3],
      sampleMethod: 'full',
    }, whole)
    expect(wholePayload.data).toBe(whole.buffer)
    expect(wholePayload.length).toBe(3)

    const partial = new Float32Array(whole.buffer, Float32Array.BYTES_PER_ELEMENT, 1)
    const partialPayload = createWorkerTensorPayload({
      id: 'partial',
      role: 'embedding',
      name: 'Partial',
      dtype: 'float32',
      shape: [1],
      sampleMethod: 'full',
    }, partial)
    expect(partialPayload.data).not.toBe(whole.buffer)
    expect([...new Float32Array(partialPayload.data)]).toEqual([2])
  })

  it('deduplicates transferable tensor buffers on inference results', () => {
    const buffer = new Float32Array([1, 2]).buffer
    const event: InferenceResultEvent = {
      version: MODEL_WORKER_PROTOCOL_VERSION,
      type: 'inference-result',
      requestId: 'infer-1',
      payload: {
        modelId: 'distilgpt2',
        executionProvider: 'wasm',
        input: { text: 'Hello', tokenIds: [15496], tokens: ['Hello'] },
        output: { sampledTokenId: 995, sampledToken: ' world', candidates: [] },
        inferenceMilliseconds: 12,
        tensors: [
          {
            id: 'a', role: 'embedding', name: 'A', dtype: 'float32',
            shape: [2], sampleMethod: 'full', length: 2, data: buffer,
          },
          {
            id: 'b', role: 'normalized', name: 'B', dtype: 'float32',
            shape: [2], sampleMethod: 'full', length: 2, data: buffer,
          },
        ],
      },
    }
    expect(transferListForModelWorkerEvent(event)).toEqual([buffer])
  })
})
