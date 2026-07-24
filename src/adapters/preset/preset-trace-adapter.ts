import type {
  ModelTrace,
  TraceAdapter,
  TraceLoadOptions,
} from '../../domain/trace/trace'
import { validateModelTrace } from '../../domain/trace/trace-validator'
import { verticalSliceTrace } from '../../content/traces/vertical-slice-trace'

function createAbortError() {
  return new DOMException('模型轨迹加载已取消。', 'AbortError')
}

export class PresetTraceAdapter implements TraceAdapter {
  private readonly source: unknown

  constructor(source: unknown = verticalSliceTrace) {
    this.source = source
  }

  load(options: TraceLoadOptions = {}): Promise<ModelTrace> {
    return Promise.resolve().then(() => {
      if (options.signal?.aborted) throw createAbortError()

      const trace: unknown = structuredClone(this.source)
      validateModelTrace(trace)

      if (options.signal?.aborted) throw createAbortError()
      return trace
    })
  }
}
