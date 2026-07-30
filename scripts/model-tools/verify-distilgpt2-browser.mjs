import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { resolve } from 'node:path'
import { chromium } from '@playwright/test'

const HOST = '127.0.0.1'

function usage() {
  throw new Error(
    'Usage: node scripts/model-tools/verify-distilgpt2-browser.mjs <instrumented.onnx>',
  )
}

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

async function runProbe(page, modelUrl) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.evaluate(async (url) => {
        const probe = await import(
          '/src/platform/model-runtime/browser-instrumentation-probe.ts'
        )
        return probe.runBrowserInstrumentationProbe(url)
      }, modelUrl)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('Execution context was destroyed') || attempt === 2) throw error
      await page.waitForLoadState('domcontentloaded')
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250))
    }
  }
  throw new Error('Browser probe did not return a result')
}

export async function main(args) {
  if (args.length !== 1) usage()
  const modelPath = resolve(args[0])
  if (!existsSync(modelPath)) throw new Error(`Missing model ${modelPath}`)
  const port = await findAvailablePort()
  const baseUrl = `http://${HOST}:${port}`

  const server = spawn(
    process.execPath,
    ['node_modules/vite/bin/vite.js', '--host', HOST, '--port', String(port), '--strictPort'],
    { cwd: resolve('.'), stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const serverErrors = []
  server.stderr.on('data', (chunk) => serverErrors.push(String(chunk)))

  let browser
  const diagnostics = []
  try {
    await waitForServer(server, baseUrl)
    const executablePath = findChromiumExecutable()
    browser = await chromium.launch({
      executablePath,
      headless: true,
    })
    browser.on('disconnected', () => diagnostics.push('browser disconnected'))
    const page = await browser.newPage()
    page.on('crash', () => diagnostics.push('page crashed'))
    page.on('pageerror', (error) => diagnostics.push(`page error: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() === 'error') diagnostics.push(`console error: ${message.text()}`)
    })
    await page.goto(baseUrl)
    const modelUrl = `${baseUrl}/@fs/${modelPath.replaceAll('\\', '/')}`
    let result
    try {
      result = await runProbe(page, modelUrl)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`${message}\nDiagnostics: ${diagnostics.join(' | ') || 'none'}`)
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    if (browser) await browser.close()
    server.kill()
    if (server.exitCode && server.exitCode !== 0) {
      process.stderr.write(serverErrors.join(''))
    }
  }
}

await main(process.argv.slice(2))
