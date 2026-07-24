export type MemoryTier = 'low' | 'standard' | 'high' | 'unknown'
export type ThreeDMode = 'full' | 'reduced' | 'none'

interface MediaQueryListLike {
  readonly matches: boolean
  addEventListener?: (type: 'change', listener: () => void) => void
  removeEventListener?: (type: 'change', listener: () => void) => void
  addListener?: (listener: () => void) => void
  removeListener?: (listener: () => void) => void
}

interface CanvasLike {
  getContext: (contextId: string) => unknown
}

export interface CapabilityScope {
  readonly WebAssembly?: unknown
  readonly WebGLRenderingContext?: unknown
  readonly WebGL2RenderingContext?: unknown
  readonly navigator?: {
    readonly gpu?: unknown
    readonly deviceMemory?: number
  }
  readonly document?: {
    createElement: (tagName: 'canvas') => CanvasLike
  }
  readonly matchMedia?: (query: string) => MediaQueryListLike
}

export interface DeviceCapabilities {
  readonly webgl: boolean
  readonly webgl2: boolean
  readonly webgpu: boolean
  readonly wasm: boolean
  readonly reducedMotion: boolean
  readonly deviceMemoryGB: number | null
  readonly memoryTier: MemoryTier
  readonly threeDMode: ThreeDMode
}

function readMemoryTier(deviceMemoryGB: number | null): MemoryTier {
  if (deviceMemoryGB === null) return 'unknown'
  if (deviceMemoryGB <= 4) return 'low'
  if (deviceMemoryGB >= 8) return 'high'
  return 'standard'
}

function probeContext(scope: CapabilityScope, contextId: 'webgl2' | 'webgl') {
  try {
    return Boolean(scope.document?.createElement('canvas').getContext(contextId))
  } catch {
    return false
  }
}

function hasWebGLConstructor(scope: CapabilityScope, version: 1 | 2) {
  return version === 2
    ? typeof scope.WebGL2RenderingContext !== 'undefined'
    : typeof scope.WebGLRenderingContext !== 'undefined'
}

export function detectDeviceCapabilities(
  scope: CapabilityScope = globalThis as unknown as CapabilityScope,
): DeviceCapabilities {
  const hasWebGL2 = hasWebGLConstructor(scope, 2)
  const hasWebGL1 = hasWebGLConstructor(scope, 1)
  const webgl2 = hasWebGL2 && probeContext(scope, 'webgl2')
  const webgl = webgl2 || (hasWebGL1 && probeContext(scope, 'webgl'))
  const rawMemory = scope.navigator?.deviceMemory
  const deviceMemoryGB =
    typeof rawMemory === 'number' && Number.isFinite(rawMemory) && rawMemory > 0
      ? rawMemory
      : null
  const memoryTier = readMemoryTier(deviceMemoryGB)
  const threeDMode: ThreeDMode = !webgl
    ? 'none'
    : memoryTier === 'low'
      ? 'reduced'
      : 'full'

  return {
    webgl,
    webgl2,
    webgpu: typeof scope.navigator?.gpu !== 'undefined',
    wasm: typeof scope.WebAssembly !== 'undefined',
    reducedMotion: scope.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
    deviceMemoryGB,
    memoryTier,
    threeDMode,
  }
}

export function observeCapabilityChanges(
  listener: () => void,
  scope: CapabilityScope = globalThis as unknown as CapabilityScope,
) {
  const mediaQuery = scope.matchMedia?.('(prefers-reduced-motion: reduce)')
  if (!mediaQuery) return () => undefined

  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener?.('change', listener)
  }

  mediaQuery.addListener?.(listener)
  return () => mediaQuery.removeListener?.(listener)
}
