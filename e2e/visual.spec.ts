import { expect, test, type Page } from '@playwright/test'

async function useDeterministicRendering(page: Page) {
  await page.addInitScript(() => {
    localStorage.clear()
    Object.defineProperty(window, 'WebGLRenderingContext', {
      configurable: true,
      value: undefined,
    })
    Object.defineProperty(window, 'WebGL2RenderingContext', {
      configurable: true,
      value: undefined,
    })
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
}

async function stabilizePage(page: Page) {
  await expect(page.getByText('步骤 01 / 14')).toBeVisible()
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `,
  })
  await page.evaluate(() => document.fonts.ready)
}

test.beforeEach(async ({ page }) => {
  await useDeterministicRendering(page)
})

test('桌面 Token 初始学习视图视觉基线', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await stabilizePage(page)

  await expect(page).toHaveScreenshot('m1-desktop-token.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
  })
})

test('桌面 LayerNorm 分布视觉基线', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await stabilizePage(page)
  await page.getByRole('button', { name: '跳到Attention章节' }).click()
  await expect(
    page.getByRole('img', { name: /^LayerNorm 归一化前后分布图/ }),
  ).toBeVisible()

  await expect(page).toHaveScreenshot('m2-desktop-layernorm.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
  })
})

test('桌面 Attention Head 2 联动视觉基线', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await stabilizePage(page)
  await page.getByRole('button', { name: '跳到第 6 步：遮住未来 Token' }).click()
  await page.getByRole('button', { name: 'Head 2', exact: true }).click()
  await expect(page.getByRole('img', { name: /^Attention Head 2 权重矩阵/ })).toBeVisible()

  await expect(page).toHaveScreenshot('m1-desktop-attention-head-2.png', {
    animations: 'disabled',
    maxDiffPixelRatio: 0.01,
  })
})

test('移动端二维 QKV 视觉基线', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')
  await stabilizePage(page)
  await page.getByRole('button', { name: '跳到Attention章节' }).click()
  await page.getByRole('button', { name: '下一项' }).click()
  await page.getByRole('tab', { name: '二维计算' }).click()
  await expect(page.getByRole('img', { name: /^Q、K、V 投影二维图/ })).toBeVisible()
  const layout = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.trace2d-panel')!
    const figure = document.querySelector<HTMLElement>('.trace2d-figure')!
    const hint = document.querySelector<HTMLElement>('.trace2d-scroll-hint')!
    return {
      viewportWidth: window.innerWidth,
      panelRight: panel.getBoundingClientRect().right,
      figureRight: figure.getBoundingClientRect().right,
      hintRight: hint.getBoundingClientRect().right,
      figureClientWidth: figure.clientWidth,
      figureScrollWidth: figure.scrollWidth,
    }
  })
  expect(layout.panelRight).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.figureRight).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.hintRight).toBeLessThanOrEqual(layout.viewportWidth)
  expect(layout.figureScrollWidth).toBeGreaterThan(layout.figureClientWidth)

  await expect(page).toHaveScreenshot('m1-mobile-qkv.png', {
    animations: 'disabled',
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  })
})

test('移动端多头注意力对比视觉基线', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')
  await stabilizePage(page)
  await page.getByRole('button', { name: '跳到Attention章节' }).click()
  await page.getByRole('button', { name: '下一项' }).click()
  await page.getByRole('button', { name: '下一项' }).click()
  await page.getByRole('tab', { name: '二维计算' }).click()
  await page.getByRole('button', { name: 'Head 2', exact: true }).click()
  await expect(page.getByRole('img', { name: /^Attention Head 2 权重矩阵/ })).toBeVisible()
  await expect(page.getByRole('region', { name: '多头注意力校验' })).toContainText(
    '12 / 12 行 Σ = 1',
  )
  await page.getByRole('group', { name: '可横向滚动的二维计算图' }).evaluate(
    (figure) => {
      figure.scrollLeft = figure.scrollWidth
    },
  )

  await expect(page).toHaveScreenshot('m2-mobile-multi-head.png', {
    animations: 'disabled',
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  })
})

test('移动端 Residual 与 MLP 视觉基线', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')
  await stabilizePage(page)
  await page.getByRole('button', { name: '跳到Residual + MLP章节' }).click()
  await page.getByRole('button', { name: '下一项' }).click()
  await page.getByRole('button', { name: '下一项' }).click()
  await page.getByRole('tab', { name: '二维计算' }).click()
  await expect(page.getByRole('img', { name: /^Residual 与 MLP 计算路径图/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Residual 与 MLP 校验' })).toContainText(
    '8D → 32D → 8D',
  )
  await page.getByRole('group', { name: '可横向滚动的二维计算图' }).evaluate(
    (figure) => {
      figure.scrollLeft = Math.round(figure.scrollWidth / 3)
    },
  )

  await expect(page).toHaveScreenshot('m2-mobile-residual-mlp.png', {
    animations: 'disabled',
    fullPage: true,
    maxDiffPixelRatio: 0.01,
  })
})
