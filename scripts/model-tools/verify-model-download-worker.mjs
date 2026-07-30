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
  const diagnostics = []
  const networkModelRequests = []
  try {
    await waitForServer(server, baseUrl)
    browser = await chromium.launch({
      executablePath: findChromiumExecutable(),
      headless: true,
    })
    const page = await browser.newPage()
    page.on('crash', () => diagnostics.push('page crashed'))
    page.on('pageerror', (error) => diagnostics.push(`page error: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.push(`console error: ${message.text()}`)
    })
    page.on('request', (request) => {
      if (request.url().startsWith(REPOSITORY_URL)) networkModelRequests.push(request.url())
    })

    await page.goto(baseUrl)
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
    await page.getByText('真实模型资源已就绪').waitFor({ timeout: 120_000 })
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

    process.stdout.write(`${JSON.stringify({
      cacheName: CACHE_NAME,
      elapsedMs: Number(elapsedMs.toFixed(1)),
      mainThreadTicks: probe.ticks,
      phases: probe.phases,
      cachedBytes: probe.cacheEntries.reduce((total, entry) => total + entry.bytes, 0),
      networkModelRequests: networkModelRequests.length,
      readyState: probe.readyState,
      diagnostics,
    }, null, 2)}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${message}\nDiagnostics: ${diagnostics.join(' | ') || 'none'}`)
  } finally {
    if (browser) await browser.close()
    server.kill()
    if (server.exitCode && server.exitCode !== 0) process.stderr.write(serverErrors.join(''))
  }
}

await main()
