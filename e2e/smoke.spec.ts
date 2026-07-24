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
  await expect(page.getByRole('heading', { name: '查找 Token 向量' })).toBeVisible()

  await page.getByRole('button', { name: '播放计算过程' }).click()
  await expect(page.getByRole('button', { name: '暂停计算过程' })).toBeVisible()
  await page.getByRole('button', { name: '重置' }).click()
  await expect(page.getByText('步骤 01 / 08')).toBeVisible()

  await page.getByRole('button', { name: '跳到Attention章节' }).click()
  await expect(page.getByRole('heading', { name: '为信息准备三种角色' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '生成 Q、K、V' })).toBeVisible()
  await expect(page.getByRole('img', { name: /^Q、K、V 投影二维图/ })).toBeVisible()

  await page.getByRole('button', { name: '跳到第 4 步：遮住未来 Token' }).click()
  await expect(page.getByRole('img', { name: /^Attention Head 1 权重矩阵/ })).toBeVisible()
  await page.getByRole('button', { name: 'Head 2', exact: true }).click()
  await expect(page.getByRole('img', { name: /^Attention Head 2 权重矩阵/ })).toBeVisible()

  await page.getByRole('button', { name: '跳到第 7 步：把分数变成概率' }).click()
  await expect(page.getByRole('img', { name: /^输出候选概率图/ })).toBeVisible()
  await expect(page.getByText('18.0%')).toBeVisible()

  await page.getByRole('button', { name: '跳到Attention章节' }).click()
  await page.getByText('深入理解：线性投影').click()
  await expect(page.getByText('Q = XW_Q，K = XW_K，V = XW_V')).toBeVisible()
})

test('真实三维场景可以旋转、复位并与二维 Head 选择联动', async ({ page }) => {
  await page.goto('/')

  const scene = page.getByRole('img', {
    name: '可旋转的 Transformer 三维模型空间',
  })
  await expect(scene).toBeVisible()
  await page.getByRole('button', { name: '跳到第 4 步：遮住未来 Token' }).click()
  await expect(page.getByRole('img', { name: /^Attention Head 1 权重矩阵/ })).toBeVisible()

  const head2 = page.getByRole('button', {
    name: '三维实体：Attention Head 2',
  })
  await head2.click()
  await expect(head2).toHaveAttribute('aria-pressed', 'true')
  await expect(
    page.getByRole('button', { name: 'Head 2', exact: true }),
  ).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  const bounds = await scene.boundingBox()
  expect(bounds).not.toBeNull()
  if (bounds) {
    await page.mouse.move(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.42)
    await page.mouse.up()
  }

  const resetCamera = page.getByRole('button', { name: '返回讲解视角' })
  await expect(resetCamera).toBeEnabled()
  await expect(page.locator('.scene3d-readout')).toContainText('手动观察')
  await resetCamera.click()
  await expect(resetCamera).toBeDisabled()
  await expect(page.locator('.scene3d-readout')).toContainText('讲解视角')
})

test('移动端可以切换到二维计算且没有页面横向溢出', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/')

  await page.getByRole('tab', { name: '二维计算' }).click()

  await expect(page.getByRole('heading', { name: '把句子切成 Token' })).toBeVisible()

  await page.getByRole('tab', { name: '课程' }).click()
  await page.getByRole('button', { name: '跳到Attention章节' }).click()
  await page.getByText('深入理解：线性投影').click()
  await expect(page.getByText('Q = XW_Q，K = XW_K，V = XW_V')).toBeVisible()
  await page.getByRole('tab', { name: '二维计算' }).click()
  await expect(page.getByRole('img', { name: /^Q、K、V 投影二维图/ })).toBeVisible()

  await page.getByRole('tab', { name: '三维空间' }).click()
  await expect(
    page.getByRole('img', { name: '可旋转的 Transformer 三维模型空间' }),
  ).toBeVisible()
  await page.getByRole('button', { name: '三维实体：Token 4 deep' }).click()
  await expect(
    page.getByRole('button', { name: '三维实体：Token 4 deep' }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})
