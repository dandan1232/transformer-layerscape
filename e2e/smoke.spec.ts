import { expect, test } from '@playwright/test'

test('应用能够在浏览器中启动', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/Transformer LayerScape/)
  await expect(
    page.getByRole('heading', { name: '让文字成为模型能读懂的坐标' }),
  ).toBeVisible()
})

test('移动端可以切换到二维计算且没有页面横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')

  await page.getByRole('tab', { name: '二维计算' }).click()

  await expect(page.getByRole('heading', { name: 'Token → Attention' })).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})
