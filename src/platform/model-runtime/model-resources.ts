export type ModelResourceRole =
  | 'model-config'
  | 'generation-config'
  | 'onnx-weights'
  | 'tokenizer'
  | 'tokenizer-config'

export interface ModelResourceFile {
  readonly role: ModelResourceRole
  readonly path: string
  readonly bytes: number
  readonly sha256: string
}

const repositoryId = 'Xenova/distilgpt2'
const repositoryRevision = 'a41c10485c18a64b6606729b6a082330cbd8f49e'

export const DISTILGPT2_RESOURCE_MANIFEST = {
  id: 'distilgpt2-q8-browser-candidate',
  repository: {
    id: repositoryId,
    revision: repositoryRevision,
  },
  upstream: {
    id: 'distilbert/distilgpt2',
    revision: '2290a62682d06624634c1f46a6ad5be0f47f38aa',
  },
  license: {
    spdx: 'Apache-2.0',
    url: 'https://www.apache.org/licenses/LICENSE-2.0',
  },
  runtime: {
    library: '@huggingface/transformers',
    testedLibraryVersion: '4.2.0',
    task: 'text-generation',
    dtype: 'q8',
    modelFileName: 'decoder_model_merged',
    maxInputTokens: 12,
  },
  teachingTrace: {
    instrumented: false,
    approved: false,
    gate: 'WP-31 must verify trustworthy intermediate outputs before UI integration.',
  },
  files: [
    {
      role: 'model-config',
      path: 'config.json',
      bytes: 987,
      sha256: '0e0fb9cdeb3a605afc6ce8f1c9830a2d78c7ad2596e498acc66b4ab2338edf51',
    },
    {
      role: 'generation-config',
      path: 'generation_config.json',
      bytes: 124,
      sha256: 'fa12d604e4ab52705c56eb9394c5d6a451cee884607fc25a8cd3388fc775c2be',
    },
    {
      role: 'onnx-weights',
      path: 'onnx/decoder_model_merged_quantized.onnx',
      bytes: 84_911_479,
      sha256: 'dfd02dcbfccb31d289cac235f71cecad357030866fe7019f05a36b1c5692afba',
    },
    {
      role: 'tokenizer',
      path: 'tokenizer.json',
      bytes: 2_107_653,
      sha256: 'cda20b8ca044949aa07ac4078420c80d1a57139d5f9f33700e46fb2d891e7c66',
    },
    {
      role: 'tokenizer-config',
      path: 'tokenizer_config.json',
      bytes: 234,
      sha256: '551e26ec611d8d0c8edc3ef72e518a38418cb71f40de1347dd486a595e1557d7',
    },
  ] satisfies readonly ModelResourceFile[],
} as const

export const DISTILGPT2_DOWNLOAD_BYTES =
  DISTILGPT2_RESOURCE_MANIFEST.files.reduce((total, file) => total + file.bytes, 0)

export function resolvePinnedModelFileUrl(path: string): string {
  return `https://huggingface.co/${repositoryId}/resolve/${repositoryRevision}/${path}`
}
