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

    act(() => store.getState().goToStep(4))

    expect(screen.getByRole('heading', { name: '生成 Q、K、V' })).toBeVisible()
    expect(screen.getByRole('img', { name: /^Q、K、V 投影二维图/ })).toBeVisible()
    expect(
      screen.getByRole('group', { name: '可横向滚动的二维计算图' }),
    ).toHaveAttribute('aria-describedby', 'trace2d-scroll-hint')
    expect(screen.getByText('左右滑动查看完整计算图')).toBeInTheDocument()
    expect(screen.getByText('query')).toBeVisible()
    expect(screen.getByText('key')).toBeVisible()
    expect(screen.getByText('value')).toBeVisible()
    expect(
      within(screen.getByRole('region', { name: '当前步骤张量' })).getAllByText(
        '[1, 2, 6, 4]',
      ),
    ).toHaveLength(3)
  })

  it('对比 LayerNorm 前后的分布并允许切换 Token', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().goToStep(3)
    render(<Trace2DPanel store={store} isActive />)

    expect(screen.getByRole('heading', { name: '稳定每个 Token 的数值尺度' })).toBeVisible()
    expect(
      screen.getByRole('img', { name: /^LayerNorm 归一化前后分布图/ }),
    ).toBeVisible()
    const tensors = screen.getByRole('region', { name: '当前步骤张量' })
    expect(within(tensors).getByText('hidden_input')).toBeVisible()
    expect(within(tensors).getByText('normalized_hidden')).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: '选择 Token 4：deep，查看 LayerNorm' }),
    )
    expect(store.getState().selectedTokenIndex).toBe(3)
  })

  it('逐维展示 Token 与 Position Embedding 的相加过程', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().goToStep(2)
    render(<Trace2DPanel store={store} isActive />)

    expect(screen.getByRole('heading', { name: '加入 Token 的位置信息' })).toBeVisible()
    expect(
      screen.getByRole('img', {
        name: /^Token Embedding 与 Position Embedding 相加图/,
      }),
    ).toBeVisible()
    const tensors = screen.getByRole('region', { name: '当前步骤张量' })
    expect(within(tensors).getByText('token_embedding')).toBeVisible()
    expect(within(tensors).getByText('position_embedding')).toBeVisible()
    expect(within(tensors).getByText('hidden_input')).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: '选择 Token 4：deep，查看 Embedding' }),
    )
    expect(store.getState().selectedTokenIndex).toBe(3)
  })

  it('注意力矩阵支持局部展开、跨 Head 对比与真实权重切换', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().goToStep(5)
    render(<Trace2DPanel store={store} isActive />)

    expect(screen.getByText('局部展开 · blue → and')).toBeVisible()
    expect(screen.getByText('H1 0.22 · H2 0.42')).toBeVisible()
    const proof = screen.getByRole('region', { name: '多头注意力校验' })
    expect(within(proof).getByText('因果掩码')).toBeVisible()
    expect(within(proof).getByText('Softmax · dim = −1')).toBeVisible()
    expect(within(proof).getByText('12 / 12 行 Σ = 1')).toBeVisible()
    expect(within(proof).getByText('Head 拼接')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Head 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await user.click(
      screen.getByRole('button', { name: 'deep 读取 sky：权重 0.23' }),
    )
    expect(screen.getByText('局部展开 · deep → sky')).toBeVisible()
    expect(screen.getByText('H1 0.23 · H2 0.15')).toBeVisible()
    expect(store.getState().selectedTokenIndex).toBe(3)

    await user.click(screen.getByRole('button', { name: 'Head 2' }))
    expect(store.getState().selectedHeadIndex).toBe(1)
    expect(screen.getByRole('img', { name: /^Attention Head 2 权重矩阵/ })).toBeVisible()

    await user.click(
      screen.getByRole('button', { name: 'blue 读取 and：权重 0.42' }),
    )
    expect(store.getState().selectedTokenIndex).toBe(5)
  })

  it('多头加权结果展示每个 Head 的输出与拼接后的隐藏向量', () => {
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().goToStep(6)
    render(<Trace2DPanel store={store} isActive />)

    const tensors = screen.getByRole('region', { name: '当前步骤张量' })
    const outputs = within(tensors).getByRole('heading', { name: '输出' }).parentElement!
    expect(within(outputs).getByText('head_output')).toBeVisible()
    expect(within(outputs).getByText('[1, 2, 6, 4]')).toBeVisible()
    expect(within(outputs).getByText('attention_output')).toBeVisible()
    expect(within(outputs).getByText('[1, 6, 8]')).toBeVisible()
    expect(screen.getByText(/2 个 4 维结果拼接回 8 维隐藏向量/)).toBeVisible()
  })

  it('展示两条残差、Pre-Norm 顺序与 MLP 四倍扩维', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().goToStep(9)
    render(<Trace2DPanel store={store} isActive />)

    expect(screen.getByRole('heading', { name: '先扩维，再筛选信息' })).toBeVisible()
    expect(
      screen.getByRole('img', { name: /^Residual 与 MLP 计算路径图/ }),
    ).toBeVisible()
    const proof = screen.getByRole('region', { name: 'Residual 与 MLP 校验' })
    expect(within(proof).getByText('Attention 残差')).toBeVisible()
    expect(within(proof).getByText('Residual → LN → MLP')).toBeVisible()
    expect(within(proof).getByText('8D → 32D → 8D')).toBeVisible()
    expect(within(proof).getByText('Block 残差')).toBeVisible()
    const tensors = screen.getByRole('region', { name: '当前步骤张量' })
    expect(within(tensors).getByText('mlp_expanded')).toBeVisible()
    expect(within(tensors).getByText('mlp_gelu')).toBeVisible()
    expect(within(tensors).getByText('mlp_output')).toBeVisible()
    expect(within(tensors).getAllByText('[1, 6, 32]')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'RESIDUAL 02：＋' }))
    expect(store.getState().selectedEntityId).toBe('operation:residual-mlp')
  })

  it('输出视图绘制候选概率并允许选择采样结果', async () => {
    const user = userEvent.setup()
    const store = createExplorerStore()
    store.getState().setTrace(verticalSliceTrace)
    store.getState().goToStep(12)
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

    await user.click(screen.getByRole('button', { name: '跳到第 14 步：选出下一个 Token' }))
    expect(store.getState().currentStepIndex).toBe(13)
    expect(screen.getByRole('heading', { name: '选出下一个 Token' })).toBeVisible()
  })
})
