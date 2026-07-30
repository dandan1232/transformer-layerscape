import { describe, expect, it, vi } from 'vitest'
import type { ModelResourceFile } from './model-resources'
import {
  CacheStorageModelResourceCache,
  loadDistilgpt2Resources,
  ModelResourceLoadError,
  type ModelResourceCache,
} from './model-resource-loader'
import { sha256Hex } from './model-binary-patch'

class FakeCache implements ModelResourceCache {
  readonly values = new Map<string, ArrayBuffer>()
  readonly put = vi.fn(async (key: string, value: ArrayBuffer) => {
    this.values.set(key, value.slice(0))
  })
  readonly delete = vi.fn(async (key: string) => this.values.delete(key))

  async match(key: string) {
    return this.values.get(key)?.slice(0) ?? null
  }
}

async function resource(
  path: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<ModelResourceFile> {
  return {
    role: path.endsWith('.onnx') ? 'onnx-weights' : 'model-config',
    path,
    bytes: bytes.byteLength,
    sha256: await sha256Hex(bytes.buffer),
  }
}

const resolveUrl = (path: string) => `https://models.example.test/revision/${path}`

describe('model resource loader', () => {
  it('degrades to memory-only loading when Cache Storage is unavailable', async () => {
    const cache = new CacheStorageModelResourceCache(null)
    const config = Uint8Array.from([1, 2, 3])
    const resources = [await resource('config.json', config)]
    const fetchMock = vi.fn(async () => new Response(config)) as typeof fetch

    const result = await loadDistilgpt2Resources({
      cache, fetch: fetchMock, resources, resolveUrl,
    })

    expect(result.cacheHit).toBe(false)
    expect(result.cacheWriteFailures).toEqual(['config.json'])
    expect(new Uint8Array(result.files.get('config.json')!)).toEqual(config)
  })

  it('uses verified cache entries without issuing network requests', async () => {
    const cache = new FakeCache()
    const config = Uint8Array.from([1, 2])
    const model = Uint8Array.from([3, 4, 5])
    const resources = await Promise.all([
      resource('config.json', config),
      resource('onnx/model.onnx', model),
    ])
    cache.values.set(resolveUrl('config.json'), config.buffer)
    cache.values.set(resolveUrl('onnx/model.onnx'), model.buffer)
    const fetchMock = vi.fn<typeof fetch>()
    const onProgress = vi.fn()

    const result = await loadDistilgpt2Resources({
      cache, fetch: fetchMock, resources, resolveUrl, onProgress,
    })

    expect(result.cacheHit).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    expect([...result.files.keys()]).toEqual(['config.json', 'onnx/model.onnx'])
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      source: 'cache', loadedBytes: 5, totalBytes: 5,
    }))
  })

  it('streams network progress, verifies resources and caches complete responses', async () => {
    const cache = new FakeCache()
    const config = Uint8Array.from([1, 2, 3])
    const model = Uint8Array.from([4, 5, 6, 7])
    const resources = await Promise.all([
      resource('config.json', config),
      resource('onnx/model.onnx', model),
    ])
    const values = new Map([
      [resolveUrl('config.json'), config],
      [resolveUrl('onnx/model.onnx'), model],
    ])
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const value = values.get(String(input))
      return value ? new Response(value) : new Response(null, { status: 404 })
    }) as typeof fetch
    const onProgress = vi.fn()

    const result = await loadDistilgpt2Resources({
      cache, fetch: fetchMock, resources, resolveUrl, onProgress,
    })

    expect(result).toMatchObject({ cacheHit: false, cacheWriteFailures: [] })
    expect(cache.put).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      source: 'network', loadedBytes: 7, totalBytes: 7,
    }))
  })

  it('evicts a corrupt cache entry and recovers from the pinned network source', async () => {
    const cache = new FakeCache()
    const config = Uint8Array.from([1, 2, 3])
    const resources = [await resource('config.json', config)]
    cache.values.set(resolveUrl('config.json'), Uint8Array.from([9, 9, 9]).buffer)
    const fetchMock = vi.fn(async () => new Response(config)) as typeof fetch

    const result = await loadDistilgpt2Resources({
      cache, fetch: fetchMock, resources, resolveUrl,
    })

    expect(result.cacheHit).toBe(false)
    expect(cache.delete).toHaveBeenCalledWith(resolveUrl('config.json'))
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('does not cache a response whose integrity check fails', async () => {
    const cache = new FakeCache()
    const expected = Uint8Array.from([1, 2, 3])
    const resources = [await resource('config.json', expected)]
    const fetchMock = vi.fn(async () =>
      new Response(Uint8Array.from([1, 2, 4]))) as typeof fetch

    await expect(loadDistilgpt2Resources({
      cache, fetch: fetchMock, resources, resolveUrl,
    })).rejects.toMatchObject({ code: 'INTEGRITY' } satisfies Partial<ModelResourceLoadError>)
    expect(cache.put).not.toHaveBeenCalled()
  })

  it('cancels a streamed response without caching a partial file', async () => {
    const cache = new FakeCache()
    const expected = Uint8Array.from([1, 2, 3, 4])
    const resources = [await resource('onnx/model.onnx', expected)]
    const controller = new AbortController()
    const fetchMock = vi.fn(async () => new Response(new ReadableStream({
      start(streamController) {
        streamController.enqueue(Uint8Array.from([1, 2]))
        streamController.enqueue(Uint8Array.from([3, 4]))
        streamController.close()
      },
    }))) as typeof fetch

    const promise = loadDistilgpt2Resources({
      cache,
      fetch: fetchMock,
      resources,
      resolveUrl,
      signal: controller.signal,
      onProgress: () => controller.abort('用户取消'),
    })
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' })
    expect(cache.put).not.toHaveBeenCalled()
  })
})
