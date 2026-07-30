import type { ModelBinaryPatch } from './distilgpt2-instrumentation-patch.mjs'

export interface ApplyModelBinaryPatchOptions {
  readonly signal?: AbortSignal
  readonly verifySource?: boolean
}

export class ModelBinaryPatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelBinaryPatchError'
  }
}

function abortIfNeeded(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw new DOMException(
      typeof signal.reason === 'string' ? signal.reason : '模型插桩已取消。',
      'AbortError',
    )
  }
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value)
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index)
  }
  return bytes
}

async function decompressInstructions(value: string): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ModelBinaryPatchError('当前浏览器不支持模型补丁解压。')
  }
  const compressed = decodeBase64(value)
  const compressedStream = new Response(compressed).body
  if (!compressedStream) {
    throw new ModelBinaryPatchError('无法读取模型补丁数据流。')
  }
  const stream = compressedStream.pipeThrough(new DecompressionStream('gzip'))
  return new Response(stream).arrayBuffer()
}

export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
}

export async function applyModelBinaryPatch(
  source: ArrayBuffer,
  patch: ModelBinaryPatch,
  options: ApplyModelBinaryPatchOptions = {},
): Promise<ArrayBuffer> {
  abortIfNeeded(options.signal)
  if (patch.version !== 1 || patch.format !== 'gzip-instructions-v1') {
    throw new ModelBinaryPatchError('无法识别模型补丁格式。')
  }
  if (source.byteLength !== patch.source.bytes) {
    throw new ModelBinaryPatchError(
      `模型源文件体积不匹配：收到 ${source.byteLength}，期望 ${patch.source.bytes}。`,
    )
  }
  if (options.verifySource !== false && await sha256Hex(source) !== patch.source.sha256) {
    throw new ModelBinaryPatchError('模型源文件 SHA-256 不匹配。')
  }

  abortIfNeeded(options.signal)
  const instructions = await decompressInstructions(patch.dataBase64)
  const instructionBytes = new Uint8Array(instructions)
  const instructionView = new DataView(instructions)
  const sourceBytes = new Uint8Array(source)
  const target = new Uint8Array(patch.target.bytes)
  let instructionOffset = 0
  let targetOffset = 0
  let operationCount = 0

  while (instructionOffset < instructionBytes.length) {
    if (operationCount % 256 === 0) abortIfNeeded(options.signal)
    const operation = instructionView.getUint8(instructionOffset)
    if (operation === 0) {
      if (instructionOffset + 9 > instructionBytes.length) {
        throw new ModelBinaryPatchError('模型补丁 Copy 指令不完整。')
      }
      const sourceOffset = instructionView.getUint32(instructionOffset + 1, true)
      const length = instructionView.getUint32(instructionOffset + 5, true)
      if (sourceOffset + length > sourceBytes.length || targetOffset + length > target.length) {
        throw new ModelBinaryPatchError('模型补丁 Copy 指令越界。')
      }
      target.set(sourceBytes.subarray(sourceOffset, sourceOffset + length), targetOffset)
      targetOffset += length
      instructionOffset += 9
    } else if (operation === 1) {
      if (instructionOffset + 5 > instructionBytes.length) {
        throw new ModelBinaryPatchError('模型补丁 Insert 指令不完整。')
      }
      const length = instructionView.getUint32(instructionOffset + 1, true)
      const dataOffset = instructionOffset + 5
      if (dataOffset + length > instructionBytes.length || targetOffset + length > target.length) {
        throw new ModelBinaryPatchError('模型补丁 Insert 指令越界。')
      }
      target.set(instructionBytes.subarray(dataOffset, dataOffset + length), targetOffset)
      targetOffset += length
      instructionOffset = dataOffset + length
    } else {
      throw new ModelBinaryPatchError(`未知模型补丁指令 ${operation}。`)
    }
    operationCount += 1
  }

  if (operationCount !== patch.operationCount || targetOffset !== target.length) {
    throw new ModelBinaryPatchError(
      `模型补丁结果不完整：${operationCount} 个操作，${targetOffset} 字节。`,
    )
  }
  abortIfNeeded(options.signal)
  if (await sha256Hex(target.buffer) !== patch.target.sha256) {
    throw new ModelBinaryPatchError('插桩模型 SHA-256 不匹配。')
  }
  return target.buffer
}
