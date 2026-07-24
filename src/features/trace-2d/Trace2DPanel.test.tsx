import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { verticalSliceTrace } from '../../content/traces/vertical-slice-trace'
import { createExplorerStore } from '../../store/explorer-store'
import { Trace2DPanel } from './Trace2DPanel'

describe('二维计算视图', () => {
  it('Trace 未就绪时显示安全状态', () => {
    const store = createExplorerStore()
    render(<Trace2DPanel store={store} isActive />)

    expect(screen.getByRole('status')).toHaveTextContent('正在准备二维模型轨迹')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('使用真实 Token、ID 和 Tensor 渲染输入步骤并支持键盘选择', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    render(<Trace2DPanel store={store} isActive />)

    expect(screen.getByRole('heading', { name: '把句子切成 Token' })).toBeVisible()
    expect(screen.getByRole('img', { name: /^Token 与 Embedding 二维图/ })).toBeVisible()
    expect(screen.getByText('input_ids')).toBeVisible()
    expect(screen.getByText('[1, 6]')).toBeVisible()

    const sky = screen.getByRole('button', { name: '选择 Token 2：sky，ID 7' })
    sky.focus()
    await user.keyboard('{Enter}')
    expect(store.getState()).toMatchObject({
      selectedTokenIndex: 1,
      selectedEntityId: 'token:1',
    })
  })

  it('步骤变化后展示 Q/K/V 投影与三项输出 Tensor', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    render(<Trace2DPanel store={store} isActive />)

    act(() => store.getState().goToStep(2))

    expect(screen.getByRole('heading', { name: '生成 Q、K、V' })).toBeVisible()
    expect(screen.getByRole('img', { name: /^Q、K、V 投影二维图/ })).toBeVisible()
    expect(screen.getByText('query')).toBeVisible()
    expect(screen.getByText('key')).toBeVisible()
    expect(screen.getByText('value')).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: '当前步骤张量' })).getAllByText(
        '[1, 2, 6, 4]',
      ),
    ).toHaveLength(3)
  })

  it('注意力矩阵显示掩码、Head 切换和真实权重', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().goToStep(3)
    render(<Trace2DPanel store={store} isActive />)

    expect(screen.getByText('因果掩码：未来位置显示 ×')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Head 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Head 2' }))
    expect(store.getState().selectedHeadIndex).toBe(1)
    expect(screen.getByRole('img', { name: /^Attention Head 2 权重矩阵/ })).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: 'blue 读取 and：权重 0.42' }),
    )
    expect(store.getState().selectedTokenIndex).toBe(5)
  })

  it('输出视图绘制候选概率并允许选择采样结果', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().goToStep(6)
    render(<Trace2DPanel store={store} isActive />)

    expect(screen.getByRole('img', { name: /^输出候选概率图/ })).toBeVisible()
    expect(screen.getByText('18.0%')).toBeVisible()
    expect(screen.getByText('已采样')).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: 'horizon，概率 14.0%，Logit 0.96' }),
    )
    expect(store.getState().selectedEntityId).toBe('operation:output')

    await user.click(
      screen.getByRole('button', { name: '.，概率 18.0%，Logit 1.21' }),
    )
    expect(store.getState().selectedEntityId).toBe('output-token:12')

    await user.click(screen.getByRole('button', { name: '跳到第 8 步：选出下一个 Token' }))
    expect(store.getState().currentStepIndex).toBe(7)
    expect(screen.getByRole('heading', { name: '选出下一个 Token' })).toBeVisible()
  })
})
