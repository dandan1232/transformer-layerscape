export interface ModelBinaryPatch {
  readonly version: 1
  readonly format: 'gzip-instructions-v1'
  readonly source: { readonly bytes: number; readonly sha256: string }
  readonly target: { readonly bytes: number; readonly sha256: string }
  readonly operationCount: number
  readonly dataBase64: string
}

export const DISTILGPT2_INSTRUMENTATION_PATCH: ModelBinaryPatch
