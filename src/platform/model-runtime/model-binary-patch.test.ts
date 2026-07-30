import { describe, expect, it } from 'vitest'
import type { ModelBinaryPatch } from './distilgpt2-instrumentation-patch.mjs'
import {
  applyModelBinaryPatch,
  ModelBinaryPatchError,
  sha256Hex,
} from './model-binary-patch'

async function patchFor(
  source: Uint8Array<ArrayBuffer>,
  target: Uint8Array<ArrayBuffer>,
): Promise<ModelBinaryPatch> {
  return {
    version: 1,
    format: 'gzip-instructions-v1',
    source: { bytes: source.byteLength, sha256: await sha256Hex(source.buffer) },
    target: { bytes: target.byteLength, sha256: await sha256Hex(target.buffer) },
    operationCount: 3,
    dataBase64: 'H4sIAAAAAAAACmNgYGBgYGJgYGAEEZwcDMxQPgAa6fNpGQAAAA==',
  }
}

describe('model binary patch', () => {
  it('reconstructs and verifies a deterministic target', async () => {
    const source = Uint8Array.from([1, 2, 3, 4, 5])
    const target = Uint8Array.from([1, 2, 9, 8, 4, 5])
    const result = await applyModelBinaryPatch(source.buffer, await patchFor(source, target))
    expect([...new Uint8Array(result)]).toEqual([...target])
  })

  it('rejects the wrong source before applying instructions', async () => {
    const source = Uint8Array.from([1, 2, 3, 4, 5])
    const target = Uint8Array.from([1, 2, 9, 8, 4, 5])
    const patch = await patchFor(source, target)
    await expect(applyModelBinaryPatch(
      Uint8Array.from([1, 2, 0, 4, 5]).buffer,
      patch,
    )).rejects.toBeInstanceOf(ModelBinaryPatchError)
  })

  it('honors cancellation before allocating the target', async () => {
    const source = Uint8Array.from([1, 2, 3, 4, 5])
    const target = Uint8Array.from([1, 2, 9, 8, 4, 5])
    const controller = new AbortController()
    controller.abort('用户取消')
    await expect(applyModelBinaryPatch(
      source.buffer,
      await patchFor(source, target),
      { signal: controller.signal },
    )).rejects.toMatchObject({ name: 'AbortError' })
  })
})
