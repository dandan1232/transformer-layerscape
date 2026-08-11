import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function expectNoWcagViolations(page: Page, state: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze()

  expect(
    results.violations.map(({ id, impact, help, nodes }) => ({
      id,
      impact,
      help,
      targets: nodes.map((node) => node.target.join(' ')),
    })),
    `${state} 存在 WCAG A/AA 违规`,
  ).toEqual([])
}

test('初始课程和 Attention 关键状态通过 WCAG A/AA 自动扫描', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '把句子切成模型的词块' })).toBeVisible()
  await expectNoWcagViolations(page, '初始课程')

  await page.getByRole('button', { name: '跳到Attention章节' }).click()
  await page.getByRole('button', { name: '下一项' }).click()
  await expect(page.getByRole('heading', { name: '为信息准备三种角色' })).toBeVisible()
  await expectNoWcagViolations(page, 'Attention 课程')
})

test('真实模型确认弹窗通过扫描并保持键盘焦点', async ({ page }) => {
  await page.goto('/')
  const trigger = page.getByRole('button', { name: '加载真实模型' })
  await trigger.click()

  const dialog = page.getByRole('dialog', { name: '加载真实 DistilGPT-2？' })
  await expect(dialog).toBeVisible()
  await expect(dialog.locator(':focus')).toHaveCount(1)
  await expectNoWcagViolations(page, '真实模型确认弹窗')

  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
})

