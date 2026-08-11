import { expect, test, type Page } from '@playwright/test'

interface PerformanceSample {
  readonly interactiveMs: number
  readonly firstContentfulPaintMs: number | null
  readonly sceneReadyMs: number
  readonly stepFeedbackMs: number
  readonly averageFps: number
  readonly longestTaskMs: number
  readonly externalRequests: readonly string[]
}

async function installLongTaskObserver(page: Page) {
  await page.addInitScript(() => {
    const target = window as Window & { __layerscapeLongTasks?: number[] }
    target.__layerscapeLongTasks = []
    if (typeof PerformanceObserver === 'undefined') return
    try {
      const observer = new PerformanceObserver((list) => {
        target.__layerscapeLongTasks?.push(
          ...list.getEntries().map((entry) => entry.duration),
        )
      })
      observer.observe({ entryTypes: ['longtask'] })
    } catch {
      // Older browsers may not expose the Long Tasks API.
    }
  })
}

async function sampleAnimationFps(page: Page, frameCount: number) {
  return page.evaluate(
    (count) =>
      new Promise<number>((resolve) => {
        const frames: number[] = []
        const tick = (timestamp: number) => {
          frames.push(timestamp)
          if (frames.length >= count) {
            const elapsed = frames.at(-1)! - frames[0]
            resolve(elapsed > 0 ? ((frames.length - 1) * 1000) / elapsed : 0)
            return
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    frameCount,
  )
}

async function measureStepFeedback(page: Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const button = document.querySelector<HTMLButtonElement>(
          'button[aria-label="跳到第 6 步：遮住未来 Token"]',
        )
        if (!button) {
          reject(new Error('找不到第 6 步导航按钮'))
          return
        }

        const startedAt = performance.now()
        const deadline = startedAt + 1_000
        const readVisibleState = () => {
          const measuredAt = performance.now()
          const heading = document.querySelector('#calculation-heading')
          if (heading?.textContent === '遮住未来 Token') {
            resolve(measuredAt - startedAt)
            return
          }
          if (measuredAt >= deadline) {
            reject(new Error('步骤反馈未在 1 秒内显示'))
            return
          }
          requestAnimationFrame(readVisibleState)
        }

        button.click()
        requestAnimationFrame(readVisibleState)
      }),
  )
}

test.describe.configure({ mode: 'serial' })

test('M2 桌面首次交互、步骤反馈和三维帧率预算', async ({ page }) => {
  const externalRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
      externalRequests.push(request.url())
    }
  })
  await installLongTaskObserver(page)

  const navigationStart = Date.now()
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: '把句子切成模型的词块' }),
  ).toBeVisible()
  const interactiveMs = Date.now() - navigationStart
  await expect(
    page.getByRole('img', { name: '可旋转的 Transformer 三维模型空间' }),
  ).toBeVisible()
  const sceneReadyMs = Date.now() - navigationStart

  const stepFeedbackMs = await measureStepFeedback(page)
  await expect(page.getByRole('group', { name: /^Attention Head 1 权重矩阵/ })).toBeVisible()
  const averageFps = await sampleAnimationFps(page, 60)
  const browserMetrics = await page.evaluate(() => {
    const paint = performance
      .getEntriesByName('first-contentful-paint')
      .at(0)
    const longTasks =
      (window as Window & { __layerscapeLongTasks?: number[] })
        .__layerscapeLongTasks ?? []
    return {
      firstContentfulPaintMs: paint?.startTime ?? null,
      longestTaskMs: Math.max(0, ...longTasks),
    }
  })
  const sample: PerformanceSample = {
    interactiveMs,
    firstContentfulPaintMs: browserMetrics.firstContentfulPaintMs,
    sceneReadyMs,
    stepFeedbackMs,
    averageFps,
    longestTaskMs: browserMetrics.longestTaskMs,
    externalRequests,
  }

  console.log(`M2_PERF_DESKTOP ${JSON.stringify(sample)}`)
  expect(sample.interactiveMs).toBeLessThan(3_000)
  expect(sample.sceneReadyMs).toBeLessThan(5_000)
  expect(sample.stepFeedbackMs).toBeGreaterThanOrEqual(0)
  expect(sample.stepFeedbackMs).toBeLessThanOrEqual(100)
  expect(sample.averageFps).toBeGreaterThanOrEqual(30)
  expect(sample.longestTaskMs).toBeLessThan(500)
  expect(sample.externalRequests).toEqual([])
})

test('M2 移动视口简化三维帧率与页面宽度预算', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query: string) => {
      if (query !== '(pointer: coarse)') return nativeMatchMedia(query)

      return {
        matches: true,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }
    }
  })
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')
  await expect(page.locator('.capability-badge')).toHaveAttribute(
    'data-mode',
    'reduced',
  )
  await page.getByRole('tab', { name: '三维空间' }).click()
  await expect(
    page.getByRole('img', { name: '可旋转的 Transformer 三维模型空间' }),
  ).toBeVisible()

  const averageFps = await sampleAnimationFps(page, 45)
  const hasOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  )
  console.log(
    `M2_PERF_MOBILE ${JSON.stringify({ averageFps, hasOverflow })}`,
  )

  expect(averageFps).toBeGreaterThanOrEqual(20)
  expect(hasOverflow).toBe(false)
})
