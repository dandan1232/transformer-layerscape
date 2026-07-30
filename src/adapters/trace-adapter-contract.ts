import type { ModelTrace, TraceAdapter, TraceLoadOptions } from '../domain/trace/trace'
import { validateModelTrace } from '../domain/trace/trace-validator'

export async function loadTraceAdapterContract(
  adapter: TraceAdapter,
  options: TraceLoadOptions = {},
): Promise<ModelTrace> {
  const trace = await adapter.load(options)
  validateModelTrace(trace)
  return trace
}
