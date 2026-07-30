import {
  isModelWorkerCommand,
  MODEL_WORKER_PROTOCOL_VERSION,
  transferListForModelWorkerEvent,
  type LoadModelPayload,
  type ModelExecutionProvider,
  type ModelLoadPhase,
  type ModelWorkerCommand,
  type ModelWorkerErrorCode,
  type ModelWorkerEvent,
  type RunInferencePayload,
  type WorkerInferencePayload,
} from './worker-protocol'

export interface ModelWorkerOperationContext {
  readonly signal: AbortSignal
  readonly reportProgress: (progress: {
    readonly phase: ModelLoadPhase
    readonly loadedBytes: number
    readonly totalBytes: number
    readonly file?: string
  }) => void
}

export interface ModelWorkerOperations {
  readonly supportedExecutionProviders: readonly ModelExecutionProvider[]
  loadModel(
    payload: LoadModelPayload,
    context: ModelWorkerOperationContext,
  ): Promise<{
    readonly modelId: string
    readonly executionProvider: ModelExecutionProvider
    readonly cacheHit: boolean
  }>
  runInference(
    payload: RunInferencePayload,
    context: ModelWorkerOperationContext,
  ): Promise<WorkerInferencePayload>
  disposeModel(context: ModelWorkerOperationContext): Promise<void>
}

export interface ModelWorkerScope {
  postMessage(message: ModelWorkerEvent, transfer?: readonly Transferable[]): void
  addEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void
  removeEventListener(
    type: 'message',
    listener: (event: MessageEvent<unknown>) => void,
  ): void
}

export class ModelWorkerOperationError extends Error {
  readonly code: ModelWorkerErrorCode
  readonly retryable: boolean
  readonly details?: string

  constructor(
    code: ModelWorkerErrorCode,
    message: string,
    options: { readonly retryable?: boolean; readonly details?: string } = {},
  ) {
    super(message)
    this.name = 'ModelWorkerOperationError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.details = options.details
  }
}

function errorEvent(requestId: string, error: unknown): ModelWorkerEvent {
  const operationError = error instanceof ModelWorkerOperationError
    ? error
    : new ModelWorkerOperationError(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : '模型 Worker 发生未知错误。',
      { details: error instanceof Error ? error.stack : String(error) },
    )
  return {
    version: MODEL_WORKER_PROTOCOL_VERSION,
    type: 'worker-error',
    requestId,
    payload: {
      code: operationError.code,
      message: operationError.message,
      retryable: operationError.retryable,
      details: operationError.details,
    },
  }
}

export function attachModelWorkerRuntime(
  scope: ModelWorkerScope,
  operations: ModelWorkerOperations,
): () => void {
  const activeRequests = new Map<string, AbortController>()
  let attached = true

  const send = (event: ModelWorkerEvent) => {
    if (!attached) return
    scope.postMessage(event, transferListForModelWorkerEvent(event))
  }

  const run = async (command: Exclude<ModelWorkerCommand, { type: 'cancel-request' }>) => {
    if (activeRequests.has(command.requestId)) {
      send(errorEvent(command.requestId, new ModelWorkerOperationError(
        'INVALID_MESSAGE',
        '请求 ID 已在使用。',
      )))
      return
    }

    const controller = new AbortController()
    activeRequests.set(command.requestId, controller)
    const context: ModelWorkerOperationContext = {
      signal: controller.signal,
      reportProgress: (payload) => {
        if (!controller.signal.aborted) {
          send({
            version: MODEL_WORKER_PROTOCOL_VERSION,
            type: 'model-load-progress',
            requestId: command.requestId,
            payload,
          })
        }
      },
    }

    try {
      if (command.type === 'load-model') {
        const payload = await operations.loadModel(command.payload, context)
        if (!controller.signal.aborted) {
          send({
            version: MODEL_WORKER_PROTOCOL_VERSION,
            type: 'model-loaded',
            requestId: command.requestId,
            payload,
          })
        }
      } else if (command.type === 'run-inference') {
        const payload = await operations.runInference(command.payload, context)
        if (!controller.signal.aborted) {
          send({
            version: MODEL_WORKER_PROTOCOL_VERSION,
            type: 'inference-result',
            requestId: command.requestId,
            payload,
          })
        }
      } else {
        await operations.disposeModel(context)
        if (!controller.signal.aborted) {
          send({
            version: MODEL_WORKER_PROTOCOL_VERSION,
            type: 'model-disposed',
            requestId: command.requestId,
          })
        }
      }
    } catch (error) {
      if (!controller.signal.aborted) send(errorEvent(command.requestId, error))
    } finally {
      activeRequests.delete(command.requestId)
    }
  }

  const onMessage = (event: MessageEvent<unknown>) => {
    const command = event.data
    if (!isModelWorkerCommand(command)) {
      const requestId = typeof command === 'object' && command &&
        'requestId' in command && typeof command.requestId === 'string'
        ? command.requestId
        : 'protocol-error'
      send(errorEvent(requestId, new ModelWorkerOperationError(
        'INVALID_MESSAGE',
        '无法识别模型 Worker 消息。',
      )))
      return
    }

    if (command.type === 'cancel-request') {
      activeRequests.get(command.requestId)?.abort(command.payload.reason)
      send({
        version: MODEL_WORKER_PROTOCOL_VERSION,
        type: 'request-cancelled',
        requestId: command.requestId,
        payload: { reason: command.payload.reason ?? '请求已取消。' },
      })
      return
    }
    void run(command)
  }

  scope.addEventListener('message', onMessage)
  send({
    version: MODEL_WORKER_PROTOCOL_VERSION,
    type: 'worker-ready',
    payload: {
      supportedExecutionProviders: operations.supportedExecutionProviders,
    },
  })

  return () => {
    attached = false
    scope.removeEventListener('message', onMessage)
    for (const controller of activeRequests.values()) controller.abort('Worker runtime disposed')
    activeRequests.clear()
  }
}
