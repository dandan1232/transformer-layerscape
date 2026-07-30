/// <reference lib="webworker" />

import { createBrowserModelWorkerOperations } from './browser-model-worker-operations'
import {
  attachModelWorkerRuntime,
  type ModelWorkerScope,
} from './model-worker-runtime'

attachModelWorkerRuntime(
  globalThis as unknown as ModelWorkerScope,
  createBrowserModelWorkerOperations(),
)
