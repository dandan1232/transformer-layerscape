import { Download, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useStore } from 'zustand'
import { OnnxTraceAdapter } from '../../adapters/onnx/onnx-trace-adapter'
import type { TraceAdapter } from '../../domain/trace/trace'
import { createModelWorkerClient } from '../../platform/model-runtime/create-model-worker-client'
import type { ModelWorkerClient } from '../../platform/model-runtime/model-worker-client'
import type {
  ModelLoadProgressEvent,
  RunInferencePayload,
} from '../../platform/model-runtime/worker-protocol'
import { DISTILGPT2_RESOURCE_MANIFEST } from '../../platform/model-runtime/model-resources'
import {
  explorerStore,
  type ExplorerStoreApi,
} from '../../store/explorer-store'
import {
  validateRealModelExperiment,
  type RealModelExperimentDraft,
  type RealModelExperimentField,
} from './real-model-experiment'
import './RealModelDownload.css'

type DownloadState =
  | 'idle'
  | 'confirming'
  | 'loading'
  | 'ready'
  | 'ready-closed'
  | 'error'

export interface RealModelDownloadClient {
  loadModel(
    payload: Parameters<ModelWorkerClient['loadModel']>[0],
    options: Parameters<ModelWorkerClient['loadModel']>[1],
  ): ReturnType<ModelWorkerClient['loadModel']>
  runInference(
    payload: Parameters<ModelWorkerClient['runInference']>[0],
    options: Parameters<ModelWorkerClient['runInference']>[1],
  ): ReturnType<ModelWorkerClient['runInference']>
  terminate(): void
}

const initialExperiment: RealModelExperimentDraft = {
  text: 'The sky is blue',
  selectedLayerIndex: '5',
  temperature: '1',
  topK: '5',
  topP: '0.9',
  seed: '7',
}

function defaultCreateTraceAdapter(
  client: RealModelDownloadClient,
  payload: RunInferencePayload,
): TraceAdapter {
  return new OnnxTraceAdapter(client, payload)
}

const phaseLabels: Record<ModelLoadProgressEvent['payload']['phase'], string> = {
  downloading: '正在下载固定模型资源',
  verifying: '正在校验文件完整性',
  instrumenting: '正在构造教学观测输出',
  initializing: '正在初始化浏览器推理',
}

function formatMegabytes(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

export function RealModelDownload({
  createClient = createModelWorkerClient,
  createTraceAdapter = defaultCreateTraceAdapter,
  store = explorerStore,
}: {
  readonly createClient?: () => RealModelDownloadClient
  readonly createTraceAdapter?: (
    client: RealModelDownloadClient,
    payload: RunInferencePayload,
  ) => TraceAdapter
  readonly store?: ExplorerStoreApi
}) {
  const [state, setState] = useState<DownloadState>('idle')
  const [progress, setProgress] = useState<ModelLoadProgressEvent['payload'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [experiment, setExperiment] = useState<RealModelExperimentDraft>(initialExperiment)
  const [experimentErrors, setExperimentErrors] = useState<Partial<
    Record<RealModelExperimentField, string>
  >>({})
  const [experimentError, setExperimentError] = useState<string | null>(null)
  const [inferencePending, setInferencePending] = useState(false)
  const clientRef = useRef<RealModelDownloadClient | null>(null)
  const controllerRef = useRef<AbortController | null>(null)
  const inferenceControllerRef = useRef<AbortController | null>(null)
  const presetTraceRef = useRef(store.getState().trace?.source === 'preset'
    ? store.getState().trace
    : null)
  const traceSource = useStore(store, (value) => value.trace?.source)

  useEffect(() => () => {
    controllerRef.current?.abort('页面已关闭')
    inferenceControllerRef.current?.abort('页面已关闭')
    clientRef.current?.terminate()
  }, [])

  useEffect(() => store.subscribe((value) => {
    if (value.trace?.source === 'preset') presetTraceRef.current = value.trace
  }), [store])

  const startLoading = async () => {
    setState('loading')
    setError(null)
    setProgress({
      phase: 'downloading', loadedBytes: 0,
      totalBytes: DISTILGPT2_RESOURCE_MANIFEST.teachingTrace.artifact.bytes,
    })
    clientRef.current?.terminate()
    const client = createClient()
    const controller = new AbortController()
    clientRef.current = client
    controllerRef.current = controller

    try {
      await client.loadModel({
        resourceId: DISTILGPT2_RESOURCE_MANIFEST.id,
        preferredExecutionProviders: ['webgpu', 'wasm'],
      }, {
        signal: controller.signal,
        onProgress: setProgress,
      })
      if (controller.signal.aborted) return
      setState('ready')
      setExperimentError(null)
    } catch (loadError) {
      if (controller.signal.aborted) {
        setState('idle')
        setProgress(null)
        return
      }
      setError(loadError instanceof Error ? loadError.message : '真实模型加载失败。')
      setState('error')
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }

  const cancelLoading = () => {
    controllerRef.current?.abort('用户取消下载')
    controllerRef.current = null
    clientRef.current?.terminate()
    clientRef.current = null
    setProgress(null)
    setState('idle')
  }

  const updateExperiment = (field: RealModelExperimentField, value: string) => {
    setExperiment((current) => ({ ...current, [field]: value }))
    setExperimentErrors((current) => ({ ...current, [field]: undefined }))
    setExperimentError(null)
  }

  const runExperiment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validation = validateRealModelExperiment(experiment)
    if (!validation.ok) {
      setExperimentErrors(validation.errors)
      setExperimentError(Object.values(validation.errors)[0] ?? '请修正实验参数。')
      return
    }
    const client = clientRef.current
    if (!client) {
      setExperimentError('真实模型 Session 已释放，请重新加载。')
      return
    }

    setExperimentErrors({})
    setExperimentError(null)
    setInferencePending(true)
    const controller = new AbortController()
    inferenceControllerRef.current = controller
    try {
      const trace = await createTraceAdapter(client, validation.payload).load({
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      store.getState().setTrace(trace)
      setState('ready-closed')
    } catch (inferenceError) {
      if (controller.signal.aborted) return
      setExperimentError(
        inferenceError instanceof Error ? inferenceError.message : '真实模型轨迹生成失败。',
      )
    } finally {
      if (inferenceControllerRef.current === controller) {
        inferenceControllerRef.current = null
      }
      setInferencePending(false)
    }
  }

  const cancelInference = () => {
    inferenceControllerRef.current?.abort('用户取消真实推理')
    inferenceControllerRef.current = null
    setInferencePending(false)
  }

  const restorePresetTrace = () => {
    if (!presetTraceRef.current) return
    store.getState().setTrace(presetTraceRef.current)
    setState('ready-closed')
  }

  const percentage = progress && progress.totalBytes > 0
    ? Math.min(100, Math.round((progress.loadedBytes / progress.totalBytes) * 100))
    : 0
  const isReady = state === 'ready' || state === 'ready-closed'

  return (
    <>
      <button
        className="real-model-trigger"
        type="button"
        aria-label={isReady ? '真实模型已就绪' : '加载真实模型'}
        title={isReady ? '真实模型已就绪' : '加载真实模型'}
        data-state={isReady ? 'ready' : state}
        onClick={() => setState(isReady ? 'ready' : 'confirming')}
      >
        {state === 'loading' || inferencePending ? (
          <LoaderCircle className="real-model-trigger__spinner" size={19} aria-hidden="true" />
        ) : (
          <Download size={19} aria-hidden="true" />
        )}
      </button>

      {state !== 'idle' && state !== 'ready-closed' && (
        <div className="real-model-modal" role="presentation">
          <section
            className="real-model-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="real-model-title"
            aria-describedby="real-model-description"
          >
            <header>
              <div>
                <span>浏览器本地实验</span>
                <h2 id="real-model-title">
                  {state === 'confirming' && '加载真实 DistilGPT-2？'}
                  {state === 'loading' && '正在准备真实模型'}
                  {state === 'ready' && '真实模型资源已就绪'}
                  {state === 'error' && '真实模型加载失败'}
                </h2>
              </div>
              {state !== 'loading' && !inferencePending && (
                <button
                  type="button"
                  aria-label="关闭真实模型对话框"
                  onClick={() => setState(state === 'ready' ? 'ready-closed' : 'idle')}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              )}
            </header>

            {state === 'confirming' && (
              <>
                <p id="real-model-description">
                  将主动下载约 87.0MB 的固定模型资源。模型和你的输入只在此浏览器内处理，不会发送给项目服务器。
                </p>
                <dl>
                  <div><dt>模型</dt><dd>DistilGPT-2 · 6 Layers · 12 Heads</dd></div>
                  <div><dt>下载</dt><dd>87.03MB · SHA-256 完整性校验</dd></div>
                  <div><dt>缓存</dt><dd>按固定 Revision 存入浏览器版本化缓存</dd></div>
                </dl>
                <div className="real-model-dialog__actions">
                  <button type="button" className="secondary-action" onClick={() => setState('idle')}>
                    暂不下载
                  </button>
                  <button type="button" className="primary-action" onClick={() => void startLoading()}>
                    确认并下载
                  </button>
                </div>
              </>
            )}

            {state === 'loading' && progress && (
              <>
                <p id="real-model-description" aria-live="polite">
                  {phaseLabels[progress.phase]}
                  {progress.file ? ` · ${progress.file}` : ''}
                </p>
                <div className="real-model-progress">
                  <progress value={progress.loadedBytes} max={progress.totalBytes}>
                    {percentage}%
                  </progress>
                  <span>{percentage}% · {formatMegabytes(progress.loadedBytes)} / {formatMegabytes(progress.totalBytes)}</span>
                </div>
                <div className="real-model-dialog__actions">
                  <button type="button" className="secondary-action" onClick={cancelLoading}>
                    取消下载
                  </button>
                </div>
              </>
            )}

            {state === 'ready' && (
              <form
                className="real-model-experiment"
                noValidate
                onSubmit={(event) => void runExperiment(event)}
              >
                <p id="real-model-description" role="status">
                  文件、插桩图和 WASM Session 已通过校验。输入最多 12 个 GPT-2 Token，所有推理仍只在此浏览器内完成。
                </p>
                <label className="real-model-experiment__text">
                  <span>英文输入</span>
                  <textarea
                    rows={3}
                    value={experiment.text}
                    aria-invalid={Boolean(experimentErrors.text)}
                    onChange={(event) => updateExperiment('text', event.currentTarget.value)}
                  />
                  <small>{experimentErrors.text ?? '精确 Token 数会在 Worker 推理前检查，最多 12 个。'}</small>
                </label>
                <div className="real-model-experiment__grid">
                  <label>
                    <span>观察 Layer</span>
                    <select
                      value={experiment.selectedLayerIndex}
                      aria-invalid={Boolean(experimentErrors.selectedLayerIndex)}
                      onChange={(event) => updateExperiment('selectedLayerIndex', event.currentTarget.value)}
                    >
                      {Array.from({ length: 6 }, (_, index) => (
                        <option key={index} value={index}>Layer {index + 1}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Temperature</span>
                    <input type="number" min="0.2" max="2" step="0.1" value={experiment.temperature} aria-invalid={Boolean(experimentErrors.temperature)} onChange={(event) => updateExperiment('temperature', event.currentTarget.value)} />
                  </label>
                  <label>
                    <span>Top-k</span>
                    <input type="number" min="1" max="50257" step="1" value={experiment.topK} aria-invalid={Boolean(experimentErrors.topK)} onChange={(event) => updateExperiment('topK', event.currentTarget.value)} />
                  </label>
                  <label>
                    <span>Top-p</span>
                    <input type="number" min="0.1" max="1" step="0.05" value={experiment.topP} aria-invalid={Boolean(experimentErrors.topP)} onChange={(event) => updateExperiment('topP', event.currentTarget.value)} />
                  </label>
                  <label>
                    <span>Seed</span>
                    <input type="number" min="0" max="999999" step="1" value={experiment.seed} aria-invalid={Boolean(experimentErrors.seed)} onChange={(event) => updateExperiment('seed', event.currentTarget.value)} />
                  </label>
                </div>
                {experimentError && <p className="real-model-experiment__error" role="alert">{experimentError}</p>}
                <div className="real-model-dialog__actions">
                  {traceSource === 'onnx' && presetTraceRef.current && (
                    <button type="button" className="secondary-action" onClick={restorePresetTrace}>
                      恢复预置案例
                    </button>
                  )}
                  <button type="button" className="secondary-action" onClick={() => setState('ready-closed')}>
                    完成
                  </button>
                  {inferencePending ? (
                    <button type="button" className="secondary-action" onClick={cancelInference}>
                      取消推理
                    </button>
                  ) : (
                    <button type="submit" className="primary-action">
                      生成真实轨迹
                    </button>
                  )}
                </div>
              </form>
            )}

            {state === 'error' && (
              <>
                <p id="real-model-description" role="alert">{error}</p>
                <div className="real-model-dialog__actions">
                  <button type="button" className="secondary-action" onClick={() => setState('idle')}>
                    稍后再试
                  </button>
                  <button type="button" className="primary-action" onClick={() => void startLoading()}>
                    <RotateCcw size={16} aria-hidden="true" />
                    重试下载
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  )
}
