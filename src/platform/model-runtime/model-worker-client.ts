import {
  isModelWorkerEvent,
  MODEL_WORKER_PROTOCOL_VERSION,
  type LoadModelPayload,
  type ModelLoadProgressEvent,
  type ModelLoadedEvent,
  type ModelWorkerCommand,
  type ModelWorkerErrorCode,
  type ModelWorkerEvent,
  type RunInferencePayload,
  type WorkerInferencePayload,
  type WorkerReadyEvent,
} from './worker-protocol'

export interface ModelWorkerClientPort {
  postMessage(message: ModelWorkerCommand): void
  addEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void
  removeEventListener(type: 'message', listener: (event: MessageEvent<unknown>) => void): void
  removeEventListener(type: 'error', listener: (event: ErrorEvent) => void): void
  terminate(): void
}

export interface ModelWorkerRequestOptions {
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: ModelLoadProgressEvent['payload']) => void
}

export class ModelWorkerRequestError extends Error {
  readonly code: ModelWorkerErrorCode
  readonly retryable: boolean
  readonly details?: string

  constructor(event: Extract<ModelWorkerEvent, { type: 'worker-error' }>) {
    super(event.payload.message)
    this.name = 'ModelWorkerRequestError'
    this.code = event.payload.code
    this.retryable = event.payload.retryable
    this.details = event.payload.details
  }
}

interface PendingRequest {
  readonly expectedType: ModelWorkerEvent['type']
  readonly resolve: (value: unknown) => void
  readonly reject: (reason: unknown) => void
  readonly onProgress?: ModelWorkerRequestOptions['onProgress']
  readonly cleanupAbort?: () => void
}

function abortError(reason?: unknown) {
  return new DOMException(
    typeof reason === 'string' && reason.length > 0 ? reason : '模型请求已取消。',
    'AbortError',
  )
}

export class ModelWorkerClient {
  private readonly port: ModelWorkerClientPort
  private readonly pending = new Map<string, PendingRequest>()
  private requestSequence = 0
  private terminated = false
  private readonly readyPromise: Promise<WorkerReadyEvent['payload']>
  private resolveReady!: (payload: WorkerReadyEvent['payload']) => void
  private rejectReady!: (reason: unknown) => void

  constructor(port: ModelWorkerClientPort) {
    this.port = port
    this.readyPromise = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    port.addEventListener('message', this.onMessage)
    port.addEventListener('error', this.onError)
  }

  ready(): Promise<WorkerReadyEvent['payload']> {
    return this.readyPromise
  }

  async loadModel(
    payload: LoadModelPayload,
    options: ModelWorkerRequestOptions = {},
  ): Promise<ModelLoadedEvent['payload']> {
    return this.request('load-model', payload, 'model-loaded', options)
  }

  async runInference(
    payload: RunInferencePayload,
    options: Omit<ModelWorkerRequestOptions, 'onProgress'> = {},
  ): Promise<WorkerInferencePayload> {
    return this.request('run-inference', payload, 'inference-result', options)
  }

  async disposeModel(options: Omit<ModelWorkerRequestOptions, 'onProgress'> = {}): Promise<void> {
    await this.request('dispose-model', undefined, 'model-disposed', options)
  }

  terminate() {
    if (this.terminated) return
    this.terminated = true
    this.port.removeEventListener('message', this.onMessage)
    this.port.removeEventListener('error', this.onError)
    this.port.terminate()
    const error = new Error('模型 Worker 已终止。')
    this.rejectReady(error)
    this.rejectAll(error)
  }

  private nextRequestId() {
    this.requestSequence += 1
    return `model-worker-${this.requestSequence}`
  }

  private async request<TResult>(
    type: 'load-model' | 'run-inference' | 'dispose-model',
    payload: LoadModelPayload | RunInferencePayload | undefined,
    expectedType: ModelWorkerEvent['type'],
    options: ModelWorkerRequestOptions,
  ): Promise<TResult> {
    if (this.terminated) throw new Error('模型 Worker 已终止。')
    if (options.signal?.aborted) throw abortError(options.signal.reason)
    await this.ready()
    if (options.signal?.aborted) throw abortError(options.signal.reason)

    const requestId = this.nextRequestId()
    return new Promise<TResult>((resolve, reject) => {
      const onAbort = () => {
        this.pending.delete(requestId)
        reject(abortError(options.signal?.reason))
        this.port.postMessage({
          version: MODEL_WORKER_PROTOCOL_VERSION,
          type: 'cancel-request',
          requestId,
          payload: {
            reason: typeof options.signal?.reason === 'string'
              ? options.signal.reason
              : undefined,
          },
        })
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })
      this.pending.set(requestId, {
        expectedType,
        resolve: (value) => resolve(value as TResult),
        reject,
        onProgress: options.onProgress,
        cleanupAbort: options.signal
          ? () => options.signal?.removeEventListener('abort', onAbort)
          : undefined,
      })

      const command = type === 'dispose-model'
        ? { version: MODEL_WORKER_PROTOCOL_VERSION, type, requestId } as const
        : { version: MODEL_WORKER_PROTOCOL_VERSION, type, requestId, payload } as ModelWorkerCommand
      this.port.postMessage(command)
    })
  }

  private readonly onMessage = (message: MessageEvent<unknown>) => {
    const event = message.data
    if (!isModelWorkerEvent(event)) {
      const error = new Error('模型 Worker 返回了无法识别的消息。')
      this.rejectReady(error)
      this.rejectAll(error)
      return
    }
    if (event.type === 'worker-ready') {
      this.resolveReady(event.payload)
      return
    }

    const pending = this.pending.get(event.requestId)
    if (!pending) return
    if (event.type === 'model-load-progress') {
      pending.onProgress?.(event.payload)
      return
    }
    this.pending.delete(event.requestId)
    pending.cleanupAbort?.()

    if (event.type === 'worker-error') {
      pending.reject(new ModelWorkerRequestError(event))
    } else if (event.type === 'request-cancelled') {
      pending.reject(abortError(event.payload.reason))
    } else if (event.type !== pending.expectedType) {
      pending.reject(new Error(
        `模型 Worker 响应类型不匹配：期望 ${pending.expectedType}，收到 ${event.type}。`,
      ))
    } else if (event.type === 'model-disposed') {
      pending.resolve(undefined)
    } else {
      pending.resolve(event.payload)
    }
  }

  private readonly onError = (event: ErrorEvent) => {
    const error = new Error(event.message || '模型 Worker 运行失败。')
    this.rejectReady(error)
    this.rejectAll(error)
  }

  private rejectAll(error: unknown) {
    for (const pending of this.pending.values()) {
      pending.cleanupAbort?.()
      pending.reject(error)
    }
    this.pending.clear()
  }
}
