import { describe, expect, it } from 'vitest'

describe('URL 状态同步', () => {
  it('模块可导入', async () => {
    const mod = await import('./use-url-state')
    expect(mod.useUrlStateSync).toBeDefined()
  })
})
