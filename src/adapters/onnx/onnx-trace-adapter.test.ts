import { describe, expect, it, vi } from 'vitest'
import { verticalSliceTrace } from '../../content/traces/vertical-slice-trace'
import { loadTraceAdapterContract } from '../trace-adapter-contract'
import { createWorkerTensorPayload, type WorkerInferencePayload } from '../../platform/model-runtime/worker-protocol'
import { OnnxTraceAdapter, OnnxTraceAdapterError } from './onnx-trace-adapter'

function inferencePayload(): WorkerInferencePayload {
  return {
    modelId: verticalSliceTrace.model.id,
    executionProvider: 'wasm',
    input: { ...verticalSliceTrace.input },
    output: {
      sampledTokenId: verticalSliceTrace.output.sampledTokenId,
      sampledToken: verticalSliceTrace.output.sampledToken,
      candidates: verticalSliceTrace.output.candidates,
    },
    tensors: Object.values(verticalSliceTrace.tensors).map((tensor) => {
      const values = tensor.dtype === 'float32'
        ? Float32Array.from(tensor.values)
        : tensor.dtype === 'int32'
          ? Int32Array.from(tensor.values)
          : Uint8Array.from(tensor.values)
      return createWorkerTensorPayload({
        id: tensor.id,
        role: tensor.role,
        name: tensor.name,
        dtype: tensor.dtype,
        shape: tensor.shape,
        sampleMethod: tensor.sampleMethod,
        min: tensor.min,
        max: tensor.max,
        mean: tensor.mean,
      }, values)
    }),
    inferenceMilliseconds: 14,
  }
}

const request = {
  text: verticalSliceTrace.input.text,
  selectedLayerIndex: 0,
  sampling: verticalSliceTrace.output.defaultSampling,
}
const model = verticalSliceTrace.model

describe('OnnxTraceAdapter', () => {
  it('passes the same validated ModelTrace contract as the preset adapter', async () => {
    const runInference = vi.fn(async () => inferencePayload())
    const trace = await loadTraceAdapterContract(new OnnxTraceAdapter(
      { runInference }, request, model,
    ))

    expect(trace.source).toBe('onnx')
    expect(trace.model).toEqual(model)
    expect(trace.tensors['tensor:attention-concatenated'].role).toBe('attention-concatenated')
    expect(trace.steps).toHaveLength(14)
    expect(runInference).toHaveBeenCalledWith(request, { signal: undefined })
  })

  it('rejects malformed transferred tensor buffers', async () => {
    const payload = inferencePayload()
    const tensor = payload.tensors.find((value) => value.id === 'tensor:q')!
    const malformed = {
      ...payload,
      tensors: payload.tensors.map((value) => value === tensor
        ? { ...value, data: new ArrayBuffer(4) }
        : value),
    }
    const adapter = new OnnxTraceAdapter({ runInference: vi.fn(async () => malformed) }, request, model)

    await expect(adapter.load()).rejects.toBeInstanceOf(OnnxTraceAdapterError)
  })

  it('forwards cancellation to the model Worker', async () => {
    const controller = new AbortController()
    controller.abort('用户取消')
    const runInference = vi.fn(async () => inferencePayload())

    await expect(new OnnxTraceAdapter(
      { runInference }, request, model,
    ).load({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(runInference).not.toHaveBeenCalled()
  })
})
