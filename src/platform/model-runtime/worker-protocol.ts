import type { SamplingParameters } from '../../domain/sampling/sampling'
import type {
  TensorDType,
  TensorRole,
  TensorSampleMethod,
  TraceCandidate,
} from '../../domain/trace/trace'

export const MODEL_WORKER_PROTOCOL_VERSION = 1 as const

export type ModelExecutionProvider = 'webgpu' | 'wasm'
export type ModelLoadPhase =
  | 'downloading'
  | 'verifying'
  | 'instrumenting'
  | 'initializing'

export type ModelWorkerErrorCode =
  | 'INVALID_MESSAGE'
  | 'MODEL_NOT_LOADED'
  | 'DOWNLOAD_FAILED'
  | 'INTEGRITY_FAILED'
  | 'INITIALIZATION_FAILED'
  | 'INPUT_VALIDATION_FAILED'
  | 'INFERENCE_FAILED'
  | 'UNSUPPORTED_RUNTIME'
  | 'INTERNAL_ERROR'

export interface LoadModelPayload {
  readonly resourceId: string
  readonly preferredExecutionProviders: readonly ModelExecutionProvider[]
}

export interface RunInferencePayload {
  readonly text: string
  readonly sampling: SamplingParameters
  readonly selectedLayerIndex: number
}

export interface WorkerTensorPayload {
  readonly id: string
  readonly role: TensorRole
  readonly name: string
  readonly dtype: TensorDType
  readonly shape: readonly number[]
  readonly sampleMethod: TensorSampleMethod
  readonly length: number
  readonly data: ArrayBuffer
  readonly min?: number
  readonly max?: number
  readonly mean?: number
}

export interface WorkerInferencePayload {
  readonly modelId: string
  readonly executionProvider: ModelExecutionProvider
  readonly input: {
    readonly text: string
    readonly tokenIds: readonly number[]
    readonly tokens: readonly string[]
  }
  readonly output: {
    readonly sampledTokenId: number
    readonly sampledToken: string
    readonly candidates: readonly TraceCandidate[]
  }
  readonly tensors: readonly WorkerTensorPayload[]
  readonly inferenceMilliseconds: number
}

interface CommandBase {
  readonly version: typeof MODEL_WORKER_PROTOCOL_VERSION
  readonly requestId: string
}

export interface LoadModelCommand extends CommandBase {
  readonly type: 'load-model'
  readonly payload: LoadModelPayload
}

export interface RunInferenceCommand extends CommandBase {
  readonly type: 'run-inference'
  readonly payload: RunInferencePayload
}

export interface CancelRequestCommand extends CommandBase {
  readonly type: 'cancel-request'
  readonly payload: {
    readonly reason?: string
  }
}

export interface DisposeModelCommand extends CommandBase {
  readonly type: 'dispose-model'
}

export type ModelWorkerCommand =
  | LoadModelCommand
  | RunInferenceCommand
  | CancelRequestCommand
  | DisposeModelCommand

interface EventBase {
  readonly version: typeof MODEL_WORKER_PROTOCOL_VERSION
}

interface RequestEventBase extends EventBase {
  readonly requestId: string
}

export interface WorkerReadyEvent extends EventBase {
  readonly type: 'worker-ready'
  readonly payload: {
    readonly supportedExecutionProviders: readonly ModelExecutionProvider[]
  }
}

export interface ModelLoadProgressEvent extends RequestEventBase {
  readonly type: 'model-load-progress'
  readonly payload: {
    readonly phase: ModelLoadPhase
    readonly loadedBytes: number
    readonly totalBytes: number
    readonly file?: string
  }
}

export interface ModelLoadedEvent extends RequestEventBase {
  readonly type: 'model-loaded'
  readonly payload: {
    readonly modelId: string
    readonly executionProvider: ModelExecutionProvider
    readonly cacheHit: boolean
  }
}

export interface InferenceResultEvent extends RequestEventBase {
  readonly type: 'inference-result'
  readonly payload: WorkerInferencePayload
}

export interface RequestCancelledEvent extends RequestEventBase {
  readonly type: 'request-cancelled'
  readonly payload: {
    readonly reason: string
  }
}

export interface ModelDisposedEvent extends RequestEventBase {
  readonly type: 'model-disposed'
}

export interface ModelWorkerErrorEvent extends RequestEventBase {
  readonly type: 'worker-error'
  readonly payload: {
    readonly code: ModelWorkerErrorCode
    readonly message: string
    readonly retryable: boolean
    readonly details?: string
  }
}

export type ModelWorkerEvent =
  | WorkerReadyEvent
  | ModelLoadProgressEvent
  | ModelLoadedEvent
  | InferenceResultEvent
  | RequestCancelledEvent
  | ModelDisposedEvent
  | ModelWorkerErrorEvent

export type TransferTensorValues = Float32Array | Int32Array | Uint8Array

const executionProviders = new Set<ModelExecutionProvider>(['webgpu', 'wasm'])
const loadPhases = new Set<ModelLoadPhase>([
  'downloading', 'verifying', 'instrumenting', 'initializing',
])
const workerErrorCodes = new Set<ModelWorkerErrorCode>([
  'INVALID_MESSAGE',
  'MODEL_NOT_LOADED',
  'DOWNLOAD_FAILED',
  'INTEGRITY_FAILED',
  'INITIALIZATION_FAILED',
  'INPUT_VALIDATION_FAILED',
  'INFERENCE_FAILED',
  'UNSUPPORTED_RUNTIME',
  'INTERNAL_ERROR',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasProtocolEnvelope(value: unknown): value is Record<string, unknown> {
  return isRecord(value) &&
    value.version === MODEL_WORKER_PROTOCOL_VERSION &&
    typeof value.type === 'string'
}

function isExecutionProvider(value: unknown): value is ModelExecutionProvider {
  return typeof value === 'string' && executionProviders.has(value as ModelExecutionProvider)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value) && value >= 0
}

function isSamplingParameters(value: unknown): value is SamplingParameters {
  return isRecord(value) &&
    isFiniteNumber(value.temperature) &&
    isFiniteNumber(value.topK) &&
    isFiniteNumber(value.topP) &&
    isFiniteNumber(value.seed)
}

export function isModelWorkerCommand(value: unknown): value is ModelWorkerCommand {
  if (!hasProtocolEnvelope(value) || typeof value.requestId !== 'string') return false
  if (value.requestId.length === 0) return false

  switch (value.type) {
    case 'load-model':
      return isRecord(value.payload) &&
        typeof value.payload.resourceId === 'string' && value.payload.resourceId.length > 0 &&
        Array.isArray(value.payload.preferredExecutionProviders) &&
        value.payload.preferredExecutionProviders.length > 0 &&
        value.payload.preferredExecutionProviders.every(isExecutionProvider)
    case 'run-inference':
      return isRecord(value.payload) &&
        typeof value.payload.text === 'string' &&
        isSamplingParameters(value.payload.sampling) &&
        isNonNegativeInteger(value.payload.selectedLayerIndex)
    case 'cancel-request':
      return isRecord(value.payload) &&
        (value.payload.reason === undefined || typeof value.payload.reason === 'string')
    case 'dispose-model':
      return true
    default:
      return false
  }
}

export function isModelWorkerEvent(value: unknown): value is ModelWorkerEvent {
  if (!hasProtocolEnvelope(value)) return false
  if (value.type === 'worker-ready') {
    return isRecord(value.payload) &&
      Array.isArray(value.payload.supportedExecutionProviders) &&
      value.payload.supportedExecutionProviders.every(isExecutionProvider)
  }
  if (typeof value.requestId !== 'string' || value.requestId.length === 0) return false

  switch (value.type) {
    case 'model-load-progress': {
      if (!isRecord(value.payload)) return false
      const phase = value.payload.phase
      return typeof phase === 'string' && loadPhases.has(phase as ModelLoadPhase) &&
        isFiniteNumber(value.payload.loadedBytes) && value.payload.loadedBytes >= 0 &&
        isFiniteNumber(value.payload.totalBytes) &&
        value.payload.totalBytes >= value.payload.loadedBytes
    }
    case 'model-loaded':
      return isRecord(value.payload) &&
        typeof value.payload.modelId === 'string' && value.payload.modelId.length > 0 &&
        isExecutionProvider(value.payload.executionProvider) &&
        typeof value.payload.cacheHit === 'boolean'
    case 'inference-result':
      return isRecord(value.payload) &&
        typeof value.payload.modelId === 'string' &&
        isExecutionProvider(value.payload.executionProvider) &&
        Array.isArray(value.payload.tensors)
    case 'request-cancelled':
      return isRecord(value.payload) && typeof value.payload.reason === 'string'
    case 'worker-error': {
      if (!isRecord(value.payload)) return false
      const code = value.payload.code
      return typeof code === 'string' && workerErrorCodes.has(code as ModelWorkerErrorCode) &&
        typeof value.payload.message === 'string' &&
        typeof value.payload.retryable === 'boolean'
    }
    case 'model-disposed':
      return true
    default:
      return false
  }
}

export function createWorkerTensorPayload(
  metadata: Omit<WorkerTensorPayload, 'data' | 'length'>,
  values: TransferTensorValues,
): WorkerTensorPayload {
  const data = values.buffer instanceof ArrayBuffer &&
    values.byteOffset === 0 &&
    values.byteLength === values.buffer.byteLength
    ? values.buffer
    : new Uint8Array(values.buffer, values.byteOffset, values.byteLength).slice().buffer

  return {
    ...metadata,
    length: values.length,
    data,
  }
}

export function transferListForModelWorkerEvent(
  event: ModelWorkerEvent,
): readonly Transferable[] {
  if (event.type !== 'inference-result') return []
  return [...new Set(event.payload.tensors.map((tensor) => tensor.data))]
}
