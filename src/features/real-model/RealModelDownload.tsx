import { Download, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createModelWorkerClient } from '../../platform/model-runtime/create-model-worker-client'
import type { ModelWorkerClient } from '../../platform/model-runtime/model-worker-client'
import type { ModelLoadProgressEvent } from '../../platform/model-runtime/worker-protocol'
import { DISTILGPT2_RESOURCE_MANIFEST } from '../../platform/model-runtime/model-resources'
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
  terminate(): void
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
}: {
  readonly createClient?: () => RealModelDownloadClient
}) {
  const [state, setState] = useState<DownloadState>('idle')
  const [progress, setProgress] = useState<ModelLoadProgressEvent['payload'] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const clientRef = useRef<RealModelDownloadClient | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => {
    controllerRef.current?.abort('页面已关闭')
    clientRef.current?.terminate()
  }, [])

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
        {state === 'loading' ? (
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
              {state !== 'loading' && (
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
              <>
                <p id="real-model-description" role="status">
                  文件、插桩图和 WASM Session 已通过校验，真实轨迹适配器已经就绪。下一步将开放输入与参数实验。
                </p>
                <div className="real-model-dialog__actions">
                  <button type="button" className="primary-action" onClick={() => setState('ready-closed')}>
                    完成
                  </button>
                </div>
              </>
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
