import { expect, test } from '@playwright/test'

test('发布入口、课程联动和响应式布局可用', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle(/Transformer LayerScape/)
  await expect(page.getByRole('heading', { name: '把句子切成模型的词块' })).toBeVisible()
  await expect(page.getByText('步骤 01 / 14')).toBeVisible()

  await page.getByRole('button', { name: '跳到Attention章节' }).click()
  await expect(page.getByText('步骤 04 / 14')).toBeVisible()
  await page.getByRole('button', { name: '下一项' }).click()
  await expect(page.getByRole('heading', { name: '为信息准备三种角色' })).toBeVisible()

  const calculationTab = page.getByRole('tab', { name: '二维计算' })
  if (await calculationTab.isVisible()) await calculationTab.click()
  await expect(page.getByRole('group', { name: /^Q、K、V 投影二维图/ })).toBeVisible()

  expect(await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  )).toBe(true)
})

test('键盘可以跳过导航并操作二维实体', async ({ page }, testInfo) => {
  await page.goto('/')
  const skipLink = page.getByRole('link', { name: '跳到主要内容' })
  if (testInfo.project.name.includes('webkit') || testInfo.project.name.includes('safari')) {
    await skipLink.focus()
  }
  else await page.keyboard.press('Tab')
  await expect(skipLink).toBeFocused()
  await skipLink.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()

  const calculationTab = page.getByRole('tab', { name: '二维计算' })
  if (await calculationTab.isVisible()) await calculationTab.click()
  const token = page.getByRole('button', { name: '选择 Token 1：The，ID 4' })
  await token.focus()
  await token.press('Enter')
  await expect(token).toHaveAttribute('aria-pressed', 'true')
})

test('减少动态效果时仍提供完整的二维安全路径', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  await expect(page.locator('.capability-badge')).toHaveAttribute(
    'data-reduced-motion',
    'true',
  )
  const calculationTab = page.getByRole('tab', { name: '二维计算' })
  if (await calculationTab.isVisible()) await calculationTab.click()
  await expect(page.getByRole('heading', { name: '把句子切成 Token' })).toBeVisible()
})
