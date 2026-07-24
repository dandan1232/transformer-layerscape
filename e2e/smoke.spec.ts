import { expect, test } from '@playwright/test'

test('应用能够在浏览器中启动', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/Transformer LayerScape/)
  await expect(
    page.getByRole('heading', { name: '把句子切成模型的词块' }),
  ).toBeVisible()

  await expect(page.getByText('步骤 01 / 08')).toBeVisible()
  await page.getByRole('button', { name: '下一项' }).click()
  await expect(
    page.getByRole('heading', { name: '把编号换成可以计算的向量' }),
  ).toBeVisible()
  await expect(page.getByText('步骤 02 / 08')).toBeVisible()
  await page.getByRole('button', { name: '上一项' }).click()
  await expect(page.getByText('步骤 01 / 08')).toBeVisible()

  await page.getByRole('button', { name: '下一步' }).click()
  await expect(page.getByText('步骤 02 / 08')).toBeVisible()
  await expect(page.getByText('查找 Token 向量')).toBeVisible()

  await page.getByRole('button', { name: '播放计算过程' }).click()
  await expect(page.getByRole('button', { name: '暂停计算过程' })).toBeVisible()
  await page.getByRole('button', { name: '重置' }).click()
  await expect(page.getByText('步骤 01 / 08')).toBeVisible()

  await page.getByRole('button', { name: '跳到Attention章节' }).click()
  await expect(page.getByRole('heading', { name: '为信息准备三种角色' })).toBeVisible()
  await page.getByText('深入理解：线性投影').click()
  await expect(page.getByText('Q = XW_Q，K = XW_K，V = XW_V')).toBeVisible()
})

test('移动端可以切换到二维计算且没有页面横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')

  await page.getByRole('tab', { name: '二维计算' }).click()

  await expect(page.getByRole('heading', { name: 'Token → Attention' })).toBeVisible()

  await page.getByRole('tab', { name: '课程' }).click()
  await page.getByRole('button', { name: '跳到Attention章节' }).click()
  await page.getByText('深入理解：线性投影').click()
  await expect(page.getByText('Q = XW_Q，K = XW_K，V = XW_V')).toBeVisible()
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})
