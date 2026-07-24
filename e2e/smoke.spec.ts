import { expect, test } from '@playwright/test'

test('应用能够在浏览器中启动', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/Transformer LayerScape/)
  await expect(
    page.getByRole('heading', { name: '让文字成为模型能读懂的坐标' }),
  ).toBeVisible()

  await expect(page.getByText('步骤 01 / 08')).toBeVisible()
  await page.getByRole('button', { name: '下一步' }).click()
  await expect(page.getByText('步骤 02 / 08')).toBeVisible()
  await expect(page.getByText('查找 Token 向量')).toBeVisible()

  await page.getByRole('button', { name: '播放计算过程' }).click()
  await expect(page.getByRole('button', { name: '暂停计算过程' })).toBeVisible()
  await page.getByRole('button', { name: '重置' }).click()
  await expect(page.getByText('步骤 01 / 08')).toBeVisible()
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
