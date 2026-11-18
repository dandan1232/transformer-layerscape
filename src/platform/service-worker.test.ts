/// <reference types="node" />
// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { MODEL_RESOURCE_CACHE_NAME } from './model-runtime/model-resource-loader'

describe('网站离线缓存升级', () => {
  it('只清理旧页面缓存，保留已下载模型、当前页面和其他应用缓存', async () => {
    const currentCache = 'transformer-layerscape-v1'
    const oldPageCache = 'transformer-layerscape-v0'
    const oldModelCache = 'transformer-layerscape-model-v1-older-revision'
    const names = new Set([
      currentCache,
      oldPageCache,
      MODEL_RESOURCE_CACHE_NAME,
      oldModelCache,
      'another-app-cache',
      'transformer-layerscape-v1-backup',
    ])
    const deleteCache = vi.fn(async (name: string) => names.delete(name))
    const claim = vi.fn(async () => {})
    type ActivationEvent = { waitUntil: (promise: Promise<unknown>) => void }
    const listeners = new Map<string, (event: ActivationEvent) => void>()
    runInNewContext(readFileSync(resolve('public/sw.js'), 'utf8'), {
      self: {
        addEventListener: (name: string, listener: (event: ActivationEvent) => void) => {
          listeners.set(name, listener)
        },
        clients: { claim },
      },
      caches: { keys: async () => [...names], delete: deleteCache },
    })

    let activation: Promise<unknown> | undefined
    listeners.get('activate')!({ waitUntil: (promise) => { activation = promise } })
    expect(activation).toBeDefined()
    await activation

    expect(deleteCache).toHaveBeenCalledExactlyOnceWith(oldPageCache)
    expect(names).toEqual(new Set([
      currentCache,
      MODEL_RESOURCE_CACHE_NAME,
      oldModelCache,
      'another-app-cache',
      'transformer-layerscape-v1-backup',
    ]))
    expect(claim).toHaveBeenCalledOnce()
  })
})
