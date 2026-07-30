import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { verticalSliceTrace } from '../../content/traces/vertical-slice-trace'
import { createExplorerStore } from '../../store/explorer-store'
import {
  RealModelDownload,
  type RealModelDownloadClient,
} from './RealModelDownload'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function client(
  loadModel: RealModelDownloadClient['loadModel'],
  runInference: RealModelDownloadClient['runInference'] = vi.fn(async () => {
    throw new Error('测试未配置真实推理。')
  }),
): RealModelDownloadClient {
  return {
    loadModel,
    runInference,
    disposeModel: vi.fn(async () => undefined),
    terminate: vi.fn(),
  }
}

describe('real model download consent', () => {
  it('does not create a Worker or download before explicit confirmation', async () => {
    const user = userEvent.setup()
    const createClient = vi.fn(() => client(vi.fn()))
    render(<RealModelDownload createClient={createClient} />)

    await user.click(screen.getByRole('button', { name: '加载真实模型' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('87.0MB')
    expect(screen.getByRole('dialog')).toHaveTextContent('只在此浏览器内处理')
    expect(createClient).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '暂不下载' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(createClient).not.toHaveBeenCalled()
  })

  it('shows progress and reaches the verified ready state', async () => {
    const user = userEvent.setup()
    const load = deferred<{
      modelId: string
      executionProvider: 'wasm'
      cacheHit: boolean
    }>()
    const loadModel = vi.fn((_payload, options) => {
      options?.onProgress?.({
        phase: 'downloading', loadedBytes: 43_500_000, totalBytes: 87_000_000,
        file: 'onnx/model.onnx',
      })
      return load.promise
    }) satisfies RealModelDownloadClient['loadModel']
    render(<RealModelDownload createClient={() => client(loadModel)} />)

    await user.click(screen.getByRole('button', { name: '加载真实模型' }))
    await user.click(screen.getByRole('button', { name: '确认并下载' }))
    const progressbar = screen.getByRole('progressbar')
    expect(progressbar).toHaveValue(43_500_000)
    expect(progressbar.parentElement?.querySelector('span')).toHaveTextContent('50%')

    load.resolve({ modelId: 'distilgpt2', executionProvider: 'wasm', cacheHit: false })
    expect(await screen.findByText('真实模型资源已就绪')).toBeVisible()
    expect(screen.getByRole('button', { name: '真实模型已就绪' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '完成' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '真实模型已就绪' })).toBeVisible()
  })

  it('cancels through AbortSignal and terminates the Worker', async () => {
    const user = userEvent.setup()
    const load = deferred<never>()
    let signal: AbortSignal | undefined
    const fakeClient = client(vi.fn((_payload, options) => {
      signal = options?.signal
      return load.promise
    }))
    render(<RealModelDownload createClient={() => fakeClient} />)

    await user.click(screen.getByRole('button', { name: '加载真实模型' }))
    await user.click(screen.getByRole('button', { name: '确认并下载' }))
    await user.click(screen.getByRole('button', { name: '取消下载' }))

    expect(signal?.aborted).toBe(true)
    expect(fakeClient.terminate).toHaveBeenCalledOnce()
  })

  it('offers recovery after a load failure', async () => {
    const user = userEvent.setup()
    const loadModel = vi.fn(async () => {
      throw new Error('网络连接中断')
    })
    const fakeClient = client(loadModel)
    render(<RealModelDownload createClient={() => fakeClient} />)

    await user.click(screen.getByRole('button', { name: '加载真实模型' }))
    await user.click(screen.getByRole('button', { name: '确认并下载' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('网络连接中断')
    expect(screen.getByRole('button', { name: /重试下载/ })).toBeVisible()
    expect(fakeClient.terminate).toHaveBeenCalledOnce()
  })

  it('returns immediate UI feedback and aborts trace processing when inference is cancelled', async () => {
    const user = userEvent.setup()
    const loadModel = vi.fn(async () => ({
      modelId: 'distilgpt2', executionProvider: 'wasm' as const, cacheHit: true,
    }))
    let inferenceSignal: AbortSignal | undefined
    const createTraceAdapter = vi.fn(() => ({
      load: vi.fn(({ signal }: { signal?: AbortSignal } = {}) => {
        inferenceSignal = signal
        return new Promise<typeof verticalSliceTrace>((_, reject) => signal?.addEventListener('abort', () => {
          reject(new DOMException('用户取消真实推理', 'AbortError'))
        }, { once: true }))
      }),
    }))
    render(
      <RealModelDownload
        store={createExplorerStore()}
        createClient={() => client(loadModel)}
        createTraceAdapter={createTraceAdapter}
      />,
    )

    await user.click(screen.getByRole('button', { name: '加载真实模型' }))
    await user.click(screen.getByRole('button', { name: '确认并下载' }))
    await user.click(await screen.findByRole('button', { name: '生成真实轨迹' }))
    await user.click(screen.getByRole('button', { name: '取消推理' }))

    expect(inferenceSignal?.aborted).toBe(true)
    expect(screen.getByRole('button', { name: '生成真实轨迹' })).toBeVisible()
  })

  it('validates parameters, publishes a real trace and restores the preset trace', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    const loadModel = vi.fn(async () => ({
      modelId: 'distilgpt2', executionProvider: 'wasm' as const, cacheHit: true,
    }))
    const realTrace = { ...verticalSliceTrace, source: 'onnx' as const }
    const loadTrace = vi.fn(async () => realTrace)
    const createTraceAdapter = vi.fn(() => ({ load: loadTrace }))
    const fakeClient = client(loadModel)
    render(
      <RealModelDownload
        store={store}
        createClient={() => fakeClient}
        createTraceAdapter={createTraceAdapter}
      />,
    )

    await user.click(screen.getByRole('button', { name: '加载真实模型' }))
    await user.click(screen.getByRole('button', { name: '确认并下载' }))
    expect(await screen.findByRole('textbox', { name: /英文输入/ })).toHaveValue('The sky is blue')

    const temperature = screen.getByLabelText('Temperature')
    await user.clear(temperature)
    await user.type(temperature, '3')
    await user.click(screen.getByRole('button', { name: '生成真实轨迹' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Temperature 必须位于 0.2 到 2')
    expect(createTraceAdapter).not.toHaveBeenCalled()

    await user.clear(temperature)
    await user.type(temperature, '1')
    await user.click(screen.getByRole('button', { name: '生成真实轨迹' }))
    await vi.waitFor(() => expect(store.getState().trace?.source).toBe('onnx'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(createTraceAdapter).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        text: 'The sky is blue', selectedLayerIndex: 5,
        sampling: { temperature: 1, topK: 5, topP: 0.9, seed: 7 },
      }),
    )

    await user.click(screen.getByRole('button', { name: '真实模型已就绪' }))
    const restoreButton = screen.getByRole('button', { name: '恢复预置并释放模型' })
    await user.click(restoreButton)
    expect(store.getState().trace?.source).toBe('preset')
    expect(fakeClient.disposeModel).toHaveBeenCalledOnce()
    expect(fakeClient.terminate).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '加载真实模型' })).toBeVisible()
  })
})
