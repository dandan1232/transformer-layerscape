import { describe, expect, it } from 'vitest'
import { verticalSliceTrace } from '../../content/traces/vertical-slice-trace'
import { TraceValidationError } from '../../domain/trace/trace-validation-error'
import { PresetTraceAdapter } from './preset-trace-adapter'

describe('PresetTraceAdapter', () => {
  it('加载经过校验且与源数据隔离的预置轨迹', async () => {
    const adapter = new PresetTraceAdapter()

    const first = await adapter.load()
    const second = await adapter.load()

    expect(first).toEqual(verticalSliceTrace)
    expect(first).not.toBe(verticalSliceTrace)
    expect(second).not.toBe(first)
  })

  it('拒绝无效预置数据', async () => {
    const adapter = new PresetTraceAdapter({ schemaVersion: 99 })

    await expect(adapter.load()).rejects.toBeInstanceOf(TraceValidationError)
  })

  it('在加载前响应取消信号', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(new PresetTraceAdapter().load({ signal: controller.signal })).rejects.toMatchObject(
      { name: 'AbortError' },
    )
  })
})
