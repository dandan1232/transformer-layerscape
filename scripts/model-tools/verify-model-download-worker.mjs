import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const HOST = '127.0.0.1'
const REVISION = 'a41c10485c18a64b6606729b6a082330cbd8f49e'
const CACHE_NAME = `transformer-layerscape-model-v1-${REVISION.slice(0, 12)}`
const REPOSITORY_URL = `https://huggingface.co/Xenova/distilgpt2/resolve/${REVISION}`
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
  const server = createServer()
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
  const baseUrl = `http://${HOST}:${port}`
  const resources = LOCAL_RESOURCES.map(([remotePath, localPath]) => ({
    remoteUrl: `${REPOSITORY_URL}/${remotePath}`,
    localUrl: `${baseUrl}/@fs/${resolve(localPath).replaceAll('\\', '/')}`,
  }))
  const server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', HOST, '--port', String(port), '--strictPort'],
    { cwd: resolve('.'), stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const serverErrors = []
  server.stderr.on('data', (chunk) => serverErrors.push(String(chunk)))

  let browser
  let page
  const diagnostics = []
  const networkModelRequests = []
  try {
    await waitForServer(server, baseUrl)
    browser = await chromium.launch({
      executablePath: findChromiumExecutable(),
      headless: true,
      args: ['--enable-precise-memory-info'],
    })
    page = await browser.newPage()
    const browserCdp = await browser.newBrowserCDPSession()
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
    page.on('crash', () => diagnostics.push('page crashed'))
    page.on('pageerror', (error) => diagnostics.push(`page error: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.push(`console error: ${message.text()}`)
    })
    page.on('request', (request) => {
      if (request.url().startsWith(REPOSITORY_URL)) networkModelRequests.push(request.url())
    })

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
    const traceStartedAt = performance.now()
    await page.getByRole('button', { name: '生成真实轨迹' }).click()
    await page.locator('.real-model-modal').waitFor({ state: 'hidden', timeout: 120_000 })
    const traceMilliseconds = performance.now() - traceStartedAt

    const readTraceProbe = () => page.evaluate(async () => {
      const { explorerStore } = await import('/src/store/explorer-store.ts')
      const trace = explorerStore.getState().trace
      if (!trace) throw new Error('Explorer Store did not receive a trace')
      const tensorByRole = (role) =>
        Object.values(trace.tensors).find((tensor) => tensor.role === role)
      const blockInput = tensorByRole('block-input')
      const embedding = tensorByRole('embedding')
      const probabilities = tensorByRole('probabilities')
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
        heapAfterReleaseBytes: performance.memory?.usedJSHeapSize,
      }
    })
    if (inferencePerformance.maximumTickGapMs > 300) {
      throw new Error(
        `Main-thread inference tick gap was ${inferencePerformance.maximumTickGapMs}ms`,
      )
    }
    if (inferencePerformance.maximumLongTaskMs > 300) {
      throw new Error(
        `Main-thread inference long task was ${inferencePerformance.maximumLongTaskMs}ms`,
      )
    }
    if (
      inferencePerformance.heapBeforeBytes &&
      inferencePerformance.heapAfterReleaseBytes - inferencePerformance.heapBeforeBytes > 32_000_000
    ) {
      throw new Error('The released model retained more than 32MB of additional page heap')
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
      },
      trace: traceProbe,
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
    throw new Error(`${message}\nDiagnostics: ${diagnostics.join(' | ') || 'none'}`)
  } finally {
    if (browser) await browser.close()
    server.kill()
    if (server.exitCode && server.exitCode !== 0) process.stderr.write(serverErrors.join(''))
  }
}

await main()
