import {
  ModelWorkerClient,
  type ModelWorkerClientPort,
} from './model-worker-client'

export function createModelWorkerClient(): ModelWorkerClient {
  const worker = new Worker(
    new URL('./model-runtime.worker.ts', import.meta.url),
    { type: 'module', name: 'layerscape-model-runtime' },
  )
  return new ModelWorkerClient(worker as ModelWorkerClientPort)
}
