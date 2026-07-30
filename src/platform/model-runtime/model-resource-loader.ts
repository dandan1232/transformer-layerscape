import {
  DISTILGPT2_DOWNLOAD_BYTES,
  DISTILGPT2_RESOURCE_MANIFEST,
  resolvePinnedModelFileUrl,
  type ModelResourceFile,
} from './model-resources'
import { sha256Hex } from './model-binary-patch'

export const MODEL_RESOURCE_CACHE_NAME =
  `transformer-layerscape-model-v1-${DISTILGPT2_RESOURCE_MANIFEST.repository.revision.slice(0, 12)}`

export interface ModelResourceCache {
  match(key: string): Promise<ArrayBuffer | null>
  put(key: string, value: ArrayBuffer, contentType: string): Promise<void>
  delete(key: string): Promise<boolean>
}

export interface ModelResourceProgress {
  readonly file: string
  readonly source: 'cache' | 'network'
  readonly fileLoadedBytes: number
  readonly fileTotalBytes: number
  readonly loadedBytes: number
  readonly totalBytes: number
}

export interface LoadedModelResources {
  readonly files: ReadonlyMap<string, ArrayBuffer>
  readonly cacheHit: boolean
  readonly cacheWriteFailures: readonly string[]
}

export type ModelResourceLoadErrorCode =
  | 'NETWORK'
  | 'HTTP'
  | 'SIZE'
  | 'INTEGRITY'
  | 'UNSUPPORTED_STREAM'

export class ModelResourceLoadError extends Error {
  readonly code: ModelResourceLoadErrorCode
  readonly file: string

  constructor(code: ModelResourceLoadErrorCode, file: string, message: string) {
    super(message)
    this.name = 'ModelResourceLoadError'
    this.code = code
    this.file = file
  }
}

export class CacheStorageModelResourceCache implements ModelResourceCache {
  private readonly storage: CacheStorage | null

  constructor(storage: CacheStorage | null = globalThis.caches ?? null) {
    this.storage = storage
  }

  private async cache() {
    if (!this.storage) return null
    return this.storage.open(MODEL_RESOURCE_CACHE_NAME)
  }

  async match(key: string): Promise<ArrayBuffer | null> {
    try {
      const cache = await this.cache()
      const response = await cache?.match(key)
      return response ? response.arrayBuffer() : null
    } catch {
      return null
    }
  }

  async put(key: string, value: ArrayBuffer, contentType: string): Promise<void> {
    const cache = await this.cache()
    if (!cache) throw new Error('当前浏览器不支持 Cache Storage。')
    await cache.put(key, new Response(value, {
      headers: {
        'content-type': contentType,
        'x-layerscape-model-revision': DISTILGPT2_RESOURCE_MANIFEST.repository.revision,
      },
    }))
  }

  async delete(key: string): Promise<boolean> {
    try {
      const cache = await this.cache()
      return cache ? cache.delete(key) : false
    } catch {
      return false
    }
  }
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException(
      typeof signal.reason === 'string' ? signal.reason : '模型下载已取消。',
      'AbortError',
    )
  }
}

async function verifyResource(file: ModelResourceFile, buffer: ArrayBuffer) {
  if (buffer.byteLength !== file.bytes) {
    throw new ModelResourceLoadError(
      'SIZE', file.path,
      `${file.path} 体积不匹配：收到 ${buffer.byteLength}，期望 ${file.bytes}。`,
    )
  }
  if (await sha256Hex(buffer) !== file.sha256) {
    throw new ModelResourceLoadError('INTEGRITY', file.path, `${file.path} SHA-256 不匹配。`)
  }
}

async function readNetworkResponse(
  response: Response,
  file: ModelResourceFile,
  completedBytes: number,
  totalBytes: number,
  signal: AbortSignal | undefined,
  onProgress: ((progress: ModelResourceProgress) => void) | undefined,
): Promise<ArrayBuffer> {
  if (!response.body) {
    throw new ModelResourceLoadError(
      'UNSUPPORTED_STREAM', file.path, `${file.path} 响应不支持流式进度。`,
    )
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let fileLoadedBytes = 0
  try {
    while (true) {
      abortIfNeeded(signal)
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      fileLoadedBytes += value.byteLength
      if (fileLoadedBytes > file.bytes) {
        throw new ModelResourceLoadError('SIZE', file.path, `${file.path} 超出预期体积。`)
      }
      chunks.push(value)
      onProgress?.({
        file: file.path,
        source: 'network',
        fileLoadedBytes,
        fileTotalBytes: file.bytes,
        loadedBytes: completedBytes + fileLoadedBytes,
        totalBytes,
      })
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }

  const buffer = new Uint8Array(fileLoadedBytes)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }
  return buffer.buffer
}

function contentTypeFor(file: ModelResourceFile) {
  return file.path.endsWith('.json') ? 'application/json' : 'application/octet-stream'
}

export async function loadDistilgpt2Resources(options: {
  readonly cache: ModelResourceCache
  readonly fetch: typeof fetch
  readonly signal?: AbortSignal
  readonly onProgress?: (progress: ModelResourceProgress) => void
  readonly resources?: readonly ModelResourceFile[]
  readonly resolveUrl?: (path: string) => string
}): Promise<LoadedModelResources> {
  const resources = options.resources ?? DISTILGPT2_RESOURCE_MANIFEST.files
  const totalBytes = options.resources
    ? resources.reduce((total, file) => total + file.bytes, 0)
    : DISTILGPT2_DOWNLOAD_BYTES
  const resolveUrl = options.resolveUrl ?? resolvePinnedModelFileUrl
  const files = new Map<string, ArrayBuffer>()
  const cacheWriteFailures: string[] = []
  let completedBytes = 0
  let cacheHit = true

  for (const file of resources) {
    abortIfNeeded(options.signal)
    const url = resolveUrl(file.path)
    let buffer = await options.cache.match(url)
    if (buffer) {
      try {
        await verifyResource(file, buffer)
      } catch {
        await options.cache.delete(url)
        buffer = null
      }
    }

    if (buffer) {
      completedBytes += file.bytes
      options.onProgress?.({
        file: file.path,
        source: 'cache',
        fileLoadedBytes: file.bytes,
        fileTotalBytes: file.bytes,
        loadedBytes: completedBytes,
        totalBytes,
      })
      files.set(file.path, buffer)
      continue
    }

    cacheHit = false
    let response: Response
    try {
      response = await options.fetch(url, {
        signal: options.signal,
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
      })
    } catch (error) {
      if (options.signal?.aborted) throw error
      throw new ModelResourceLoadError(
        'NETWORK', file.path,
        `${file.path} 下载失败：${error instanceof Error ? error.message : String(error)}`,
      )
    }
    if (!response.ok) {
      throw new ModelResourceLoadError(
        'HTTP', file.path, `${file.path} 下载返回 HTTP ${response.status}。`,
      )
    }
    buffer = await readNetworkResponse(
      response, file, completedBytes, totalBytes, options.signal, options.onProgress,
    )
    await verifyResource(file, buffer)
    files.set(file.path, buffer)
    try {
      await options.cache.put(url, buffer, contentTypeFor(file))
    } catch {
      cacheWriteFailures.push(file.path)
    }
    completedBytes += file.bytes
  }

  return { files, cacheHit, cacheWriteFailures }
}
