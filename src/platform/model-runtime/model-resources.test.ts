import { describe, expect, it } from 'vitest'
import {
  DISTILGPT2_DOWNLOAD_BYTES,
  DISTILGPT2_RESOURCE_MANIFEST,
  resolvePinnedModelFileUrl,
} from './model-resources'

describe('real model resource manifest', () => {
  it('pins the runtime and upstream repositories to immutable revisions', () => {
    expect(DISTILGPT2_RESOURCE_MANIFEST.repository.revision).toMatch(/^[a-f0-9]{40}$/)
    expect(DISTILGPT2_RESOURCE_MANIFEST.upstream.revision).toMatch(/^[a-f0-9]{40}$/)

    for (const file of DISTILGPT2_RESOURCE_MANIFEST.files) {
      const url = resolvePinnedModelFileUrl(file.path)
      expect(url).toContain(`/${DISTILGPT2_RESOURCE_MANIFEST.repository.revision}/`)
      expect(url).not.toContain('/main/')
    }
  })

  it('fixes the exact five-file browser download and stays inside the 100 MB budget', () => {
    expect(DISTILGPT2_RESOURCE_MANIFEST.files.map((file) => file.path)).toEqual([
      'config.json',
      'generation_config.json',
      'onnx/decoder_model_merged_quantized.onnx',
      'tokenizer.json',
      'tokenizer_config.json',
    ])
    expect(DISTILGPT2_DOWNLOAD_BYTES).toBe(87_020_477)
    expect(DISTILGPT2_DOWNLOAD_BYTES).toBeLessThanOrEqual(100_000_000)
  })

  it('records SHA-256 integrity metadata for every resource', () => {
    for (const file of DISTILGPT2_RESOURCE_MANIFEST.files) {
      expect(file.bytes).toBeGreaterThan(0)
      expect(file.sha256).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  it('requires the compact merged graph and keeps teaching integration gated', () => {
    expect(DISTILGPT2_RESOURCE_MANIFEST.runtime).toMatchObject({
      dtype: 'q8',
      modelFileName: 'decoder_model_merged',
      maxInputTokens: 12,
    })
    expect(DISTILGPT2_RESOURCE_MANIFEST.license.spdx).toBe('Apache-2.0')
    expect(DISTILGPT2_RESOURCE_MANIFEST.teachingTrace).toMatchObject({
      instrumented: false,
      approved: false,
    })
  })
})
