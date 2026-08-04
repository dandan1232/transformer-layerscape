import { spawn } from 'node:child_process'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const HOST = '127.0.0.1'
const REVISION = 'a41c10485c18a64b6606729b6a082330cbd8f49e'
const CACHE_NAME = `transformer-layerscape-model-v1-${REVISION.slice(0, 12)}`
const LOCAL_RESOURCES = [
  ['config.json', '.cache/wp30/config.json'],
  ['generation_config.json', '.cache/wp30/generation_config.json'],
  ['onnx/decoder_model_merged_quantized.onnx', '.cache/wp31/decoder_model_merged_quantized.onnx'],
  ['tokenizer.json', '.cache/wp30/tokenizer.json'],
  ['tokenizer_config.json', '.cache/wp30/tokenizer_config.json'],
]

function findChromiumExecutable() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean)
  return candidates.find((candidate) => existsSync(candidate))
}

async function findAvailablePort() {
  const server = createNetServer()
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, HOST, resolveListen)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Unable to reserve a port')
  await new Promise((resolveClose) => server.close(resolveClose))
  return address.port
}

async function waitForServer(processHandle, baseUrl) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (processHandle.exitCode !== null) {
      throw new Error(`Vite exited with code ${processHandle.exitCode}`)
    }
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // The server is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
  }
  throw new Error('Vite did not become ready within 30 seconds')
}

function verifyLocalResources() {
  for (const [, localPath] of LOCAL_RESOURCES) {
    if (!existsSync(resolve(localPath))) {
      throw new Error(`Missing ${localPath}; restore the pinned WP-30/WP-31 cache first`)
    }
  }
}

export async function main() {
  verifyLocalResources()
  const port = await findAvailablePort()
  const resourcePort = await findAvailablePort()
  const baseUrl = `http://${HOST}:${port}`
  const modelResourceBaseUrl = `http://${HOST}:${resourcePort}`
  const resources = LOCAL_RESOURCES.map(([remotePath, localPath]) => ({
    remotePath,
    remoteUrl: `${modelResourceBaseUrl}/${remotePath}`,
    localUrl: `${modelResourceBaseUrl}/${remotePath}`,
    localPath: resolve(localPath),
  }))
  const resourceServer = createHttpServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url ?? '/', modelResourceBaseUrl).pathname)
      .replace(/^\//, '')
    const resource = resources.find((entry) => entry.remotePath === requestPath)
    if (!resource) {
      response.writeHead(404).end()
      return
    }
    const { size } = statSync(resource.localPath)
    response.writeHead(200, {
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
      'content-length': String(size),
      'content-type': requestPath.endsWith('.json')
        ? 'application/json'
        : 'application/octet-stream',
    })
    createReadStream(resource.localPath).pipe(response)
  })
  await new Promise((resolveListen, rejectListen) => {
    resourceServer.once('error', rejectListen)
    resourceServer.listen(resourcePort, HOST, resolveListen)
  })
  const server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', HOST, '--port', String(port), '--strictPort'],
    {
      cwd: resolve('.'),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        VITE_MODEL_RESOURCE_BASE_URL: modelResourceBaseUrl,
      },
    },
  )
  const serverErrors = []
  server.stderr.on('data', (chunk) => serverErrors.push(String(chunk)))

  let browser
  let page
  let browserCdp
  const diagnostics = []
  const runtimeWarnings = []
  const networkModelRequests = []
  const privacyLeaks = []
  let privacyProbeActive = false
  let currentStage = 'startup'
  const attachPageDiagnostics = (targetPage) => {
    targetPage.on('crash', () => diagnostics.push('page crashed'))
    targetPage.on('pageerror', (error) => diagnostics.push(`page error: ${error.message}`))
    targetPage.on('console', (message) => {
      if (message.type() !== 'error') return
      if (message.text().includes('[W:onnxruntime:')) runtimeWarnings.push(message.text())
      else diagnostics.push(`console error: ${message.text()}`)
    })
    targetPage.on('request', (request) => {
      if (
        currentStage === 'initial-cache-hit-load' &&
        request.url().startsWith(modelResourceBaseUrl)
      ) networkModelRequests.push(request.url())
      if (privacyProbeActive) {
        const serialized = `${request.url()}\n${request.postData() ?? ''}\n${JSON.stringify(request.headers())}`
          .toLowerCase()
        if (serialized.includes('the sky is blue') || serialized.includes('the%20sky%20is%20blue')) {
          privacyLeaks.push(request.url())
        }
      }
    })
  }
  try {
    await waitForServer(server, baseUrl)
    browser = await chromium.launch({
      executablePath: findChromiumExecutable(),
      headless: true,
      args: ['--enable-precise-memory-info'],
    })
    page = await browser.newPage()
    browserCdp = await browser.newBrowserCDPSession()
    const countModelWorkers = async () => {
      const { targetInfos } = await browserCdp.send('Target.getTargets')
      return targetInfos.filter((target) =>
        target.type === 'worker' && target.url.includes('model-runtime.worker'),
      ).length
    }
    const waitForModelWorkerCount = async (expected) => {
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const count = await countModelWorkers()
        if (count === expected) return count
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100))
      }
      return countModelWorkers()
    }
    attachPageDiagnostics(page)

    currentStage = 'seed-cache'
    await page.goto(baseUrl)
    const initialModelWorkers = await countModelWorkers()
    await page.evaluate(async ({ cacheName, resourceEntries }) => {
      await caches.delete(cacheName)
      const cache = await caches.open(cacheName)
      for (const resource of resourceEntries) {
        const response = await fetch(resource.localUrl)
        if (!response.ok) throw new Error(`Unable to seed ${resource.localUrl}: ${response.status}`)
        await cache.put(resource.remoteUrl, response)
      }
    }, { cacheName: CACHE_NAME, resourceEntries: resources })

    await page.evaluate(() => {
      const probe = globalThis
      probe.__modelDownloadTicks = 0
      probe.__modelDownloadPhases = []
      probe.__modelDownloadTimer = setInterval(() => { probe.__modelDownloadTicks += 1 }, 16)
      const observer = new MutationObserver(() => {
        const value = document.querySelector('#real-model-description')?.textContent?.trim()
        if (value && probe.__modelDownloadPhases.at(-1) !== value) {
          probe.__modelDownloadPhases.push(value)
        }
      })
      observer.observe(document.body, { childList: true, subtree: true, characterData: true })
      probe.__modelDownloadObserver = observer
    })

    currentStage = 'initial-cache-hit-load'
    const startedAt = performance.now()
    await page.getByRole('button', { name: '加载真实模型' }).click()
    await page.getByRole('button', { name: '确认并下载' }).click()
    const readyMessage = page.getByText('真实模型资源已就绪')
    const errorMessage = page.getByRole('alert')
    await Promise.race([
      readyMessage.waitFor({ timeout: 120_000 }),
      errorMessage.waitFor({ timeout: 120_000 }),
    ])
    if (await errorMessage.isVisible()) {
      throw new Error(`Model load UI failed: ${await errorMessage.textContent()}`)
    }
    const elapsedMs = performance.now() - startedAt
    const probe = await page.evaluate(async ({ cacheName, remoteUrls }) => {
      clearInterval(globalThis.__modelDownloadTimer)
      globalThis.__modelDownloadObserver.disconnect()
      const cache = await caches.open(cacheName)
      const cacheEntries = await Promise.all(remoteUrls.map(async (url) => {
        const response = await cache.match(url)
        return { url, bytes: response ? (await response.arrayBuffer()).byteLength : 0 }
      }))
      return {
        ticks: globalThis.__modelDownloadTicks,
        phases: globalThis.__modelDownloadPhases,
        cacheEntries,
        readyState: document.querySelector('.real-model-trigger')?.getAttribute('data-state'),
      }
    }, { cacheName: CACHE_NAME, remoteUrls: resources.map(({ remoteUrl }) => remoteUrl) })

    if (probe.ticks < 5) throw new Error(`Main-thread responsiveness probe only ticked ${probe.ticks} times`)
    if (probe.readyState !== 'ready') throw new Error(`Unexpected ready state ${probe.readyState}`)
    if (probe.cacheEntries.some(({ bytes }) => bytes === 0)) throw new Error('A seeded cache entry disappeared')
    if (networkModelRequests.length > 0) {
      throw new Error(`Worker unexpectedly fetched ${networkModelRequests.length} model resources from the network`)
    }
    const loadedModelWorkers = await countModelWorkers()
    if (loadedModelWorkers <= initialModelWorkers) {
      throw new Error('The loaded model Worker was not observable in the browser target list')
    }

    const experimentInput = page.getByRole('textbox', { name: /英文输入/ })
    await experimentInput.fill(
      'one two three four five six seven eight nine ten eleven twelve thirteen fourteen',
    )
    await page.getByRole('button', { name: '生成真实轨迹' }).click()
    const tokenLimitAlert = page.getByRole('alert')
    await tokenLimitAlert.waitFor({ timeout: 30_000 })
    const tokenLimitMessage = await tokenLimitAlert.textContent()
    if (!tokenLimitMessage?.includes('最多支持 12 个')) {
      throw new Error(`Unexpected token limit message: ${tokenLimitMessage}`)
    }

    await experimentInput.fill('The sky is blue')
    await page.getByRole('combobox', { name: '观察 Layer' }).selectOption('5')
    await page.evaluate(() => {
      const probe = globalThis
      probe.__modelInferenceTicks = [performance.now()]
      probe.__modelInferenceLongTasks = []
      probe.__modelInferenceHeapBefore = performance.memory?.usedJSHeapSize
      probe.__modelInferenceTimer = setInterval(() => {
        probe.__modelInferenceTicks.push(performance.now())
      }, 16)
      probe.__modelInferenceLongTaskObserver = new PerformanceObserver((entries) => {
        probe.__modelInferenceLongTasks.push(
          ...entries.getEntries().map((entry) => entry.duration),
        )
      })
      try {
        probe.__modelInferenceLongTaskObserver.observe({ type: 'longtask' })
      } catch {
        // Tick gaps below remain the cross-browser responsiveness fallback.
      }
    })
    currentStage = 'webgpu-inference'
    const traceStartedAt = performance.now()
    privacyProbeActive = true
    await page.getByRole('button', { name: '生成真实轨迹' }).click()
    await page.locator('.real-model-modal').waitFor({ state: 'hidden', timeout: 120_000 })
    privacyProbeActive = false
    const traceMilliseconds = performance.now() - traceStartedAt
    if (privacyLeaks.length > 0) {
      throw new Error(`User input leaked into ${privacyLeaks.length} network requests`)
    }
    const inferencePerformance = await page.evaluate(() => {
      clearInterval(globalThis.__modelInferenceTimer)
      globalThis.__modelInferenceLongTaskObserver?.disconnect()
      const ticks = globalThis.__modelInferenceTicks
      const gaps = ticks.slice(1).map((value, index) => value - ticks[index])
      return {
        tickCount: ticks.length,
        maximumTickGapMs: gaps.length > 0 ? Math.max(...gaps) : 0,
        longTaskCount: globalThis.__modelInferenceLongTasks.length,
        maximumLongTaskMs: globalThis.__modelInferenceLongTasks.length > 0
          ? Math.max(...globalThis.__modelInferenceLongTasks)
          : 0,
        heapBeforeBytes: globalThis.__modelInferenceHeapBefore,
      }
    })

    const readTraceProbe = () => page.evaluate(async () => {
      const { explorerStore } = await import('/src/store/explorer-store.ts')
      const trace = explorerStore.getState().trace
      if (!trace) throw new Error('Explorer Store did not receive a trace')
      const tensorByRole = (role) =>
        Object.values(trace.tensors).find((tensor) => tensor.role === role)
      const blockInput = tensorByRole('block-input')
      const embedding = tensorByRole('embedding')
      const probabilities = tensorByRole('probabilities')
      const logits = tensorByRole('logits')
      const attentionWeights = tensorByRole('attention-weights')
      const tokenCount = trace.input.tokens.length
      const rowSums = []
      for (let head = 0; head < trace.model.heads; head += 1) {
        for (let row = 0; row < tokenCount; row += 1) {
          const offset = (head * tokenCount + row) * tokenCount
          rowSums.push(attentionWeights.values
            .slice(offset, offset + tokenCount)
            .reduce((total, value) => total + value, 0))
        }
      }
      return {
        schemaVersion: trace.schemaVersion,
        source: trace.source,
        model: trace.model,
        tokenIds: trace.input.tokenIds,
        tokens: trace.input.tokens,
        tensorCount: Object.keys(trace.tensors).length,
        candidateCount: trace.output.candidates.length,
        sampledTokenId: trace.output.sampledTokenId,
        sampledToken: trace.output.sampledToken,
        executionProvider: trace.metadata.description.includes('WEBGPU') ? 'webgpu' : 'wasm',
        logitSignature: [0, 11, 262, 4171].map((index) => logits.values[index]),
        probabilitySignature: [0, 11, 262, 4171].map((index) => probabilities.values[index]),
        attentionSignature: attentionWeights.values.slice(0, 8),
        probabilitySum: probabilities.values.reduce((total, value) => total + value, 0),
        maximumAttentionRowError: Math.max(...rowSums.map((sum) => Math.abs(1 - sum))),
        selectedLayerInputDiffersFromEmbedding: blockInput.values.some(
          (value, index) => Math.abs(value - embedding.values[index]) > 1e-5,
        ),
      }
    })
    const firstTraceProbe = await readTraceProbe()

    await page.getByRole('button', { name: '真实模型已就绪' }).click()
    await page.getByRole('button', { name: '生成真实轨迹' }).click()
    await page.locator('.real-model-modal').waitFor({ state: 'hidden', timeout: 120_000 })
    const secondTraceProbe = await readTraceProbe()
    const traceProbe = {
      ...firstTraceProbe,
      traceMilliseconds: Number(traceMilliseconds.toFixed(1)),
      tokenLimitMessage,
      deterministicSeed:
        firstTraceProbe.sampledTokenId === secondTraceProbe.sampledTokenId &&
        firstTraceProbe.sampledToken === secondTraceProbe.sampledToken,
    }
    if (!traceProbe.deterministicSeed) throw new Error('Identical Seed did not reproduce sampling')

    await page.getByRole('button', { name: '真实模型已就绪' }).click()
    await page.getByRole('button', { name: '恢复预置并释放模型' }).click()
    await page.locator('.source-badge').filter({ hasText: '预置案例已就绪' }).waitFor()
    await page.getByRole('button', { name: '加载真实模型' }).waitFor({ timeout: 120_000 })
    const releasedModelWorkers = await waitForModelWorkerCount(initialModelWorkers)
    if (releasedModelWorkers !== initialModelWorkers) {
      throw new Error(
        `Model Worker count did not return to baseline: ${initialModelWorkers} -> ${releasedModelWorkers}`,
      )
    }
    const heapAfterReleaseBytes = await page.evaluate(() => performance.memory?.usedJSHeapSize)
    if (
      inferencePerformance.maximumTickGapMs > 300 ||
      inferencePerformance.maximumLongTaskMs > 300
    ) {
      throw new Error(
        `Main-thread inference responsiveness exceeded its 300ms budget on ` +
        `${traceProbe.executionProvider}: ${JSON.stringify(inferencePerformance)}`,
      )
    }
    if (
      inferencePerformance.heapBeforeBytes &&
      heapAfterReleaseBytes - inferencePerformance.heapBeforeBytes > 32_000_000
    ) {
      throw new Error('The released model retained more than 32MB of additional page heap')
    }
    currentStage = 'forced-wasm-inference'
    const wasmProbe = await page.evaluate(async () => {
      const [{ createModelWorkerClient }, { OnnxTraceAdapter }, { DISTILGPT2_RESOURCE_MANIFEST }] =
        await Promise.all([
          import('/src/platform/model-runtime/create-model-worker-client.ts'),
          import('/src/adapters/onnx/onnx-trace-adapter.ts'),
          import('/src/platform/model-runtime/model-resources.ts'),
        ])
      const client = createModelWorkerClient()
      try {
        const loaded = await client.loadModel({
          resourceId: DISTILGPT2_RESOURCE_MANIFEST.id,
          preferredExecutionProviders: ['wasm'],
        })
        const trace = await new OnnxTraceAdapter(client, {
          text: 'The sky is blue',
          selectedLayerIndex: 5,
          sampling: { temperature: 1, topK: 5, topP: 0.9, seed: 7 },
        }).load()
        const tensorByRole = (role) =>
          Object.values(trace.tensors).find((tensor) => tensor.role === role)
        const logits = tensorByRole('logits')
        const probabilities = tensorByRole('probabilities')
        const attention = tensorByRole('attention-weights')
        const result = {
          executionProvider: loaded.executionProvider,
          cacheHit: loaded.cacheHit,
          sampledTokenId: trace.output.sampledTokenId,
          logitSignature: [0, 11, 262, 4171].map((index) => logits.values[index]),
          probabilitySignature: [0, 11, 262, 4171].map((index) => probabilities.values[index]),
          attentionSignature: attention.values.slice(0, 8),
        }
        await client.disposeModel()
        globalThis.__m3AcceptanceModelClient = client
        return result
      } catch (error) {
        client.terminate()
        throw error
      }
    })
    if (wasmProbe.executionProvider !== 'wasm' || !wasmProbe.cacheHit) {
      throw new Error(`Forced WASM cache probe failed: ${JSON.stringify(wasmProbe)}`)
    }
    const maximumDifference = (left, right) => Math.max(
      ...left.map((value, index) => Math.abs(value - right[index])),
    )
    const backendComparison = {
      sampledTokenMatches: traceProbe.sampledTokenId === wasmProbe.sampledTokenId,
      maximumLogitDifference: maximumDifference(traceProbe.logitSignature, wasmProbe.logitSignature),
      maximumProbabilityDifference: maximumDifference(
        traceProbe.probabilitySignature, wasmProbe.probabilitySignature,
      ),
      maximumAttentionDifference: maximumDifference(
        traceProbe.attentionSignature, wasmProbe.attentionSignature,
      ),
    }
    if (
      !backendComparison.sampledTokenMatches ||
      backendComparison.maximumLogitDifference > 1e-3 ||
      backendComparison.maximumProbabilityDifference > 1e-4 ||
      backendComparison.maximumAttentionDifference > 1e-4
    ) {
      throw new Error(`WebGPU/WASM comparison failed: ${JSON.stringify(backendComparison)}`)
    }

    currentStage = 'offline-cache-hit'
    const context = page.context()
    await context.setOffline(true)
    const offlineCacheProbe = await page.evaluate(async () => {
      const [{ DISTILGPT2_RESOURCE_MANIFEST }] = await Promise.all([
        import('/src/platform/model-runtime/model-resources.ts'),
      ])
      const client = globalThis.__m3AcceptanceModelClient
      const loaded = await client.loadModel({
        resourceId: DISTILGPT2_RESOURCE_MANIFEST.id,
        preferredExecutionProviders: ['wasm'],
      })
      await client.disposeModel()
      return loaded
    })
    if (!offlineCacheProbe.cacheHit || offlineCacheProbe.executionProvider !== 'wasm') {
      throw new Error(`Offline cache probe failed: ${JSON.stringify(offlineCacheProbe)}`)
    }
    await page.evaluate((cacheName) => caches.delete(cacheName), CACHE_NAME)
    const offlineMissProbe = await page.evaluate(async () => {
      const { DISTILGPT2_RESOURCE_MANIFEST } =
        await import('/src/platform/model-runtime/model-resources.ts')
      const client = globalThis.__m3AcceptanceModelClient
      try {
        await client.loadModel({
          resourceId: DISTILGPT2_RESOURCE_MANIFEST.id,
          preferredExecutionProviders: ['wasm'],
        })
        return { failed: false, message: '' }
      } catch (error) {
        return {
          failed: true,
          message: error instanceof Error ? error.message : String(error),
        }
      } finally {
        client.terminate()
        delete globalThis.__m3AcceptanceModelClient
      }
    })
    await context.setOffline(false)
    await waitForModelWorkerCount(initialModelWorkers)
    if (!offlineMissProbe.failed) throw new Error('Cold cache unexpectedly loaded while offline')

    currentStage = 'restart-browser-for-cold-cache-scenarios'
    await browser.close()
    browser = await chromium.launch({
      executablePath: findChromiumExecutable(),
      headless: true,
      args: ['--enable-precise-memory-info'],
    })
    page = await browser.newPage()
    browserCdp = await browser.newBrowserCDPSession()
    attachPageDiagnostics(page)
    await page.goto(baseUrl)
    await page.locator('.source-badge').filter({ hasText: '预置案例已就绪' }).waitFor()

    currentStage = 'cold-cache-failure'
    const presetBeforeRecoveryFailure = await page.evaluate(async () => {
      const { explorerStore } = await import('/src/store/explorer-store.ts')
      return {
        source: explorerStore.getState().trace?.source,
        step: explorerStore.getState().currentStepIndex,
      }
    })
    let routeMode = 'fail'
    let routeDelayMs = 0
    const routedModelRequests = []
    const fulfilledModelRequests = []
    await page.route(`${modelResourceBaseUrl}/**`, async (route) => {
      const entry = resources.find((resource) => resource.remoteUrl === route.request().url())
      if (!entry) return route.abort()
      routedModelRequests.push(entry.remoteUrl)
      if (routeMode === 'fail') return route.abort('internetdisconnected')
      if (routeDelayMs > 0) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, routeDelayMs))
      }
      try {
        await route.continue()
        fulfilledModelRequests.push(entry.remoteUrl)
      } catch {
        await route.abort().catch(() => undefined)
      }
    })
    await page.getByRole('button', { name: '加载真实模型' }).click()
    await page.getByRole('button', { name: '确认并下载' }).click()
    const recoveryFailure = page.getByRole('alert')
    await recoveryFailure.waitFor({ timeout: 30_000 })
    const recoveryFailureMessage = await recoveryFailure.textContent()
    const presetAfterRecoveryFailure = await page.evaluate(async () => {
      const { explorerStore } = await import('/src/store/explorer-store.ts')
      return {
        source: explorerStore.getState().trace?.source,
        step: explorerStore.getState().currentStepIndex,
      }
    })
    if (
      presetAfterRecoveryFailure.source !== 'preset' ||
      presetAfterRecoveryFailure.step !== presetBeforeRecoveryFailure.step
    ) {
      throw new Error('Model recovery failure changed the active preset lesson')
    }

    currentStage = 'cold-cache-recovery'
    routeMode = 'fulfill'
    await page.getByRole('button', { name: /重试下载/ }).click()
    const recoveredReady = page.getByText('真实模型资源已就绪')
    const recoveredError = page.getByRole('alert')
    await Promise.race([
      recoveredReady.waitFor({ timeout: 120_000 }),
      recoveredError.waitFor({ timeout: 120_000 }),
    ])
    if (await recoveredError.isVisible()) {
      throw new Error(`Cold-cache recovery failed: ${await recoveredError.textContent()}`)
    }
    const recoveredCacheHit = await page.locator('.real-model-trigger').getAttribute('data-cache-hit')
    if (recoveredCacheHit !== 'false' || fulfilledModelRequests.length !== resources.length) {
      throw new Error(
        `Cold-cache recovery mismatch: cache=${recoveredCacheHit}, requests=${fulfilledModelRequests.length}`,
      )
    }
    await page.getByRole('button', { name: '释放模型内存' }).click()
    await page.getByRole('button', { name: '加载真实模型' }).waitFor({ timeout: 120_000 })

    currentStage = 'cancelled-cold-download'
    await page.evaluate((cacheName) => caches.delete(cacheName), CACHE_NAME)
    routeDelayMs = 1_500
    const cancelStartedAt = performance.now()
    await page.getByRole('button', { name: '加载真实模型' }).click()
    await page.getByRole('button', { name: '确认并下载' }).click()
    await page.getByRole('button', { name: '取消下载' }).click()
    await page.getByRole('button', { name: '加载真实模型' }).waitFor()
    const cancelFeedbackMilliseconds = performance.now() - cancelStartedAt
    if (cancelFeedbackMilliseconds > 1_000) {
      throw new Error(`Download cancellation feedback took ${cancelFeedbackMilliseconds}ms`)
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, routeDelayMs + 100))
    const cachedAfterCancel = await page.evaluate(async ({ cacheName, remoteUrls }) => {
      const cache = await caches.open(cacheName)
      const matches = await Promise.all(remoteUrls.map((url) => cache.match(url)))
      return matches.filter(Boolean).length
    }, { cacheName: CACHE_NAME, remoteUrls: resources.map(({ remoteUrl }) => remoteUrl) })
    if (cachedAfterCancel !== 0) {
      throw new Error(`Cancelled cold download retained ${cachedAfterCancel} cache entries`)
    }

    currentStage = 'low-memory-preset-only'
    const lowMemoryContext = await browser.newContext()
    await lowMemoryContext.addInitScript(() => {
      Object.defineProperty(navigator, 'deviceMemory', { configurable: true, value: 2 })
    })
    const lowMemoryPage = await lowMemoryContext.newPage()
    const lowMemoryModelRequests = []
    lowMemoryPage.on('request', (request) => {
      if (request.url().startsWith(modelResourceBaseUrl)) lowMemoryModelRequests.push(request.url())
    })
    await lowMemoryPage.goto(baseUrl)
    await lowMemoryPage.locator('.capability-badge').filter({ hasText: '简化 3D' }).waitFor()
    await lowMemoryPage.getByRole('button', { name: '加载真实模型' }).click()
    await lowMemoryPage.getByText(/低内存等级/).waitFor()
    await lowMemoryPage.getByRole('button', { name: '暂不下载' }).click()
    await lowMemoryContext.close()
    if (lowMemoryModelRequests.length > 0) {
      throw new Error('Low-memory preset-only path unexpectedly requested model resources')
    }

    const acceptanceMatrix = {
      preferredBackend: traceProbe.executionProvider,
      forcedWasm: wasmProbe.executionProvider,
      offlineCacheHit: offlineCacheProbe.cacheHit,
      coldCacheRecovered: recoveredCacheHit === 'false',
      coldCacheRequestCount: fulfilledModelRequests.length,
      offlineFailureMessage: offlineMissProbe.message,
      recoveryFailureMessage,
      presetPreservedAfterFailure: presetAfterRecoveryFailure,
      cancelFeedbackMilliseconds: Number(cancelFeedbackMilliseconds.toFixed(1)),
      cancelledCacheEntries: cachedAfterCancel,
      lowMemoryPresetOnlyRequests: lowMemoryModelRequests.length,
      privacyLeaks: privacyLeaks.length,
    }
    if (traceProbe.source !== 'onnx' || traceProbe.tensorCount !== 22) {
      throw new Error(`Unexpected ONNX trace summary ${JSON.stringify(traceProbe)}`)
    }
    if (traceProbe.candidateCount !== 50_257) {
      throw new Error(`ONNX trace only returned ${traceProbe.candidateCount} candidates`)
    }
    if (Math.abs(traceProbe.probabilitySum - 1) > 1e-5) {
      throw new Error(`ONNX trace probability sum was ${traceProbe.probabilitySum}`)
    }
    if (traceProbe.maximumAttentionRowError > 1e-4) {
      throw new Error(`ONNX trace attention row error was ${traceProbe.maximumAttentionRowError}`)
    }
    if (!traceProbe.selectedLayerInputDiffersFromEmbedding) {
      throw new Error('Layer 6 input unexpectedly reused the original embedding')
    }

    process.stdout.write(`${JSON.stringify({
      cacheName: CACHE_NAME,
      elapsedMs: Number(elapsedMs.toFixed(1)),
      mainThreadTicks: probe.ticks,
      phases: probe.phases,
      cachedBytes: probe.cacheEntries.reduce((total, entry) => total + entry.bytes, 0),
      networkModelRequests: networkModelRequests.length,
      readyState: probe.readyState,
      modelWorkers: {
        initial: initialModelWorkers,
        loaded: loadedModelWorkers,
        released: releasedModelWorkers,
      },
      inferencePerformance: {
        ...inferencePerformance,
        heapAfterReleaseBytes,
      },
      wasmProbe,
      backendComparison,
      acceptanceMatrix,
      trace: traceProbe,
      runtimeWarnings: runtimeWarnings.length,
      diagnostics,
    }, null, 2)}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (page) {
      const state = await page.evaluate(() => ({
        title: document.querySelector('#real-model-title')?.textContent,
        description: document.querySelector('#real-model-description')?.textContent,
        triggerState: document.querySelector('.real-model-trigger')?.getAttribute('data-state'),
      })).catch(() => null)
      if (state) diagnostics.push(`UI state: ${JSON.stringify(state)}`)
    }
    throw new Error(
      `${message}\nStage: ${currentStage}\n` +
      `Diagnostics: ${diagnostics.join(' | ') || 'none'}`,
    )
  } finally {
    if (browser) await browser.close()
    server.kill()
    await new Promise((resolveClose) => resourceServer.close(resolveClose))
    if (server.exitCode && server.exitCode !== 0) process.stderr.write(serverErrors.join(''))
  }
}

await main()
