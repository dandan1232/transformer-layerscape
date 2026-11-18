import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('transformer-layerscape:tour-dismissed', 'true')
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

async function expectNoWcagViolations(page: Page, state: string, selector?: string) {
  const scanner = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
  if (selector) scanner.include(selector)
  const results = await scanner.analyze()

  expect(
    results.violations.map(({ id, impact, help, nodes }) => ({
      id,
      impact,
      help,
      nodes: nodes.map((node) => ({
        target: node.target.join(' '),
        summary: node.failureSummary,
      })),
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
  await expect(page.getByRole('button', { name: '重置' })).toBeEnabled()
  await page.waitForTimeout(50)
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

test('章末练习答题反馈通过 WCAG A/AA 自动扫描', async ({ page }) => {
  await page.goto('/?step=2&mode=guided')
  const quiz = page.getByRole('region', { name: '章末小练习' })
  await quiz.getByRole('radio', { name: '告诉模型词块的先后顺序' }).check()
  await expect(quiz.getByRole('status')).toContainText('答对了')
  await expectNoWcagViolations(page, '章末练习')
})

for (const theme of ['dark', 'light'] as const) {
  test(`${theme} 主题帮助与重开引导通过扫描、保持焦点且适合当前屏幕`, async ({ page }) => {
    await page.goto('/')
    if (theme === 'light') {
      await page.getByRole('button', { name: '切换到浅色主题' }).click()
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)

    const trigger = page.getByRole('button', { name: '打开帮助' })
    const help = page.getByRole('dialog', { name: '学习帮助' })
    const closeHelp = help.getByRole('button', { name: '关闭学习帮助' })
    const restart = help.getByRole('button', { name: '重新查看引导' })
    await trigger.click()
    await expect(help).toBeVisible()
    await expect(help).toHaveAttribute('aria-modal', 'true')
    await expect(closeHelp).toBeFocused()
    await expectNoWcagViolations(page, `${theme} 主题学习帮助`, '[role="dialog"][aria-label="学习帮助"]')

    expect(await help.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.left >= 0 && bounds.top >= 0 &&
        bounds.right <= window.innerWidth + 1 && bounds.bottom <= window.innerHeight + 1 &&
        element.scrollWidth <= element.clientWidth + 1
    })).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await page.keyboard.press('Shift+Tab')
    await expect(restart).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(closeHelp).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(help).not.toBeVisible()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await restart.click()
    const tour = page.getByRole('dialog', { name: '首次使用引导' })
    const start = tour.getByRole('button', { name: '开始学习' })
    await expect(tour).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(1)
    await expect(start).toBeFocused()
    await expectNoWcagViolations(page, `${theme} 主题重新查看引导`, '[role="dialog"][aria-label="首次使用引导"]')
    expect(await tour.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return bounds.left >= 0 && bounds.top >= 0 &&
        bounds.right <= window.innerWidth + 1 && bounds.bottom <= window.innerHeight + 1 &&
        element.scrollWidth <= element.clientWidth + 1
    })).toBe(true)

    await page.keyboard.press('Tab')
    await expect(start).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(start).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(tour).not.toBeVisible()
    await expect(trigger).toBeFocused()

    await trigger.click()
    await restart.click()
    await start.click()
    await expect(tour).not.toBeVisible()
    await expect(trigger).toBeFocused()
    expect(await page.evaluate(() => localStorage.getItem('transformer-layerscape:tour-dismissed'))).toBe('true')
  })
}
