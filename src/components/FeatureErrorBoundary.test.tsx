import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeatureErrorBoundary } from './FeatureErrorBoundary'

let shouldThrow = true

function UnstableFeature() {
  if (shouldThrow) throw new Error('GPU 初始化失败')
  return <p>视图已经恢复</p>
}

function renderBoundary(resetKey: number, onFallbackAction = vi.fn()) {
  return render(
    <FeatureErrorBoundary
      key={resetKey}
      featureName="三维空间"
      description="课程和二维计算仍可继续。"
      panelId="view-panel-3d"
      labelledBy="mobile-view-3d"
      panelClassName="workspace-panel scene-panel is-mobile-active"
      onFallbackAction={onFallbackAction}
      fallbackActionLabel="切换到二维安全模式"
    >
      <UnstableFeature />
    </FeatureErrorBoundary>,
  )
}

describe('独立视图错误边界', () => {
  afterEach(() => {
    shouldThrow = true
    vi.restoreAllMocks()
  })

  it('捕获子视图错误并提供中文技术信息与安全动作', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()
    const onFallbackAction = vi.fn()
    renderBoundary(1, onFallbackAction)

    expect(screen.getByRole('alert')).toHaveTextContent('三维空间暂时不可用')
    await user.click(screen.getByText('查看技术信息'))
    expect(screen.getByText('GPU 初始化失败')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '切换到二维安全模式' }))
    expect(onFallbackAction).toHaveBeenCalledOnce()
  })

  it('用户重试或 resetKey 变化后可以重新挂载子视图', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const user = userEvent.setup()
    const view = renderBoundary(1)

    shouldThrow = false
    await user.click(screen.getByRole('button', { name: '重试三维空间' }))
    expect(screen.getByText('视图已经恢复')).toBeVisible()

    shouldThrow = true
    view.rerender(
      <FeatureErrorBoundary
        key={2}
        featureName="三维空间"
        description="课程和二维计算仍可继续。"
        panelId="view-panel-3d"
        labelledBy="mobile-view-3d"
        panelClassName="workspace-panel scene-panel is-mobile-active"
      >
        <UnstableFeature />
      </FeatureErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toBeVisible()
  })
})
