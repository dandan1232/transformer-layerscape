import { format, max, scaleBand, scaleLinear } from 'd3'
import { type KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { useStore } from 'zustand'
import {
  DEFAULT_SAMPLING_PARAMETERS,
  normalizeSamplingParameters,
  runSamplingExperiment,
  type SamplingExperiment,
  type SamplingParameters,
} from '../../domain/sampling/sampling'
import type {
  ModelTrace,
  TensorSummary,
  TraceOperation,
} from '../../domain/trace/trace'
import { selectCurrentStep } from '../../store/explorer-selectors'
import type { ExplorerStoreApi } from '../../store/explorer-store'
import {
  createStepSummary,
  formatTensorShape,
  getAttentionChecks,
  getAttentionCells,
  getAttentionHeadRows,
  getEmbeddingSample,
  getResidualMlpChecks,
  getTrace2DStage,
  getVectorStats,
  resolveStepTensors,
} from './trace-2d-utils'
import './Trace2DPanel.css'

interface Trace2DPanelProps {
  readonly store: ExplorerStoreApi
  readonly isActive: boolean
}

const svgWidth = 720
const svgHeight = 360
const numberFormat = format('.3~f')

function activateWithKeyboard(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  action()
}

function TokenDiagram({
  trace,
  selectedTokenIndex,
  onSelectToken,
}: {
  trace: ModelTrace
  selectedTokenIndex: number | null
  onSelectToken: (index: number) => void
}) {
  const indexes = trace.input.tokens.map((_, index) => index)
  const x = scaleBand<number>().domain(indexes).range([42, 678]).padding(0.14)
  const bandwidth = x.bandwidth()
  const selected = selectedTokenIndex

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img" aria-labelledby="token-diagram-title token-diagram-desc">
      <title id="token-diagram-title">Token 与 Embedding 二维图</title>
      <desc id="token-diagram-desc">
        输入句子包含六个可选择的 Token。每个 Token 显示文本和对应的词表 ID。
      </desc>
      <text className="trace2d-svg__axis-title" x="42" y="42">输入序列 · 点击 Token 查看向量</text>
      {indexes.map((index) => {
        const token = trace.input.tokens[index].trim() || '空格'
        const isSelected = selected === index
        return (
          <g
            key={`${token}-${index}`}
            className={`trace2d-token${isSelected ? ' is-selected' : ''}`}
            transform={`translate(${x(index) ?? 0} 68)`}
            role="button"
            tabIndex={0}
            aria-label={`选择 Token ${index + 1}：${token}，ID ${trace.input.tokenIds[index]}`}
            onClick={() => onSelectToken(index)}
            onKeyDown={(event) => activateWithKeyboard(event, () => onSelectToken(index))}
          >
            <rect className="trace2d-token__card" width={bandwidth} height="72" rx="7" />
            <text className="trace2d-token__text" x={bandwidth / 2} y="28" textAnchor="middle">{token}</text>
            <text className="trace2d-token__id" x={bandwidth / 2} y="51" textAnchor="middle">ID {trace.input.tokenIds[index]}</text>
          </g>
        )
      })}
      <path className="trace2d-flow" d="M42 248H678" />
      <text className="trace2d-svg__caption" x="42" y="286">
        Tokenizer 输出稳定的词表 ID；ID 本身不表达语义距离。
      </text>
    </svg>
  )
}

function EmbeddingDiagram({
  trace,
  selectedTokenIndex,
  showComposition,
  onSelectToken,
}: {
  trace: ModelTrace
  selectedTokenIndex: number | null
  showComposition: boolean
  onSelectToken: (index: number) => void
}) {
  const indexes = trace.input.tokens.map((_, index) => index)
  const selected = selectedTokenIndex ?? 0
  const x = scaleBand<number>().domain(indexes).range([42, 678]).padding(0.12)
  const tokenVector = getEmbeddingSample(trace, selected, 'token-embedding')
  const positionVector = getEmbeddingSample(trace, selected, 'position-embedding')
  const hiddenVector = getEmbeddingSample(trace, selected, 'embedding')
  const rows = showComposition
    ? [
        { label: 'Token 内容', role: 'token', values: tokenVector, y: 128 },
        { label: 'Position 顺序', role: 'position', values: positionVector, y: 206 },
        { label: 'Hidden 输入', role: 'hidden', values: hiddenVector, y: 284 },
      ]
    : [{ label: 'Token 内容', role: 'token', values: tokenVector, y: 206 }]
  const cellWidth = 48
  const cellGap = 4
  const cellsStart = 220

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img" aria-labelledby="embedding-title embedding-desc">
      <title id="embedding-title">
        {showComposition ? 'Token Embedding 与 Position Embedding 相加图' : 'Token Embedding 查表图'}
      </title>
      <desc id="embedding-desc">
        {showComposition
          ? '选中 Token 的八维内容向量与八维位置向量逐项相加，得到形状不变的隐藏向量。'
          : '选择任意 Token，查看它从 Embedding 表中查到的八维内容向量。'}
      </desc>
      <text className="trace2d-svg__axis-title" x="42" y="28">
        选择 Token · 当前 T{selected + 1} “{trace.input.tokens[selected].trim()}”
      </text>
      {indexes.map((index) => (
        <g
          key={`embedding-token-${index}`}
          className={`trace2d-embedding-token${selected === index ? ' is-selected' : ''}`}
          transform={`translate(${x(index) ?? 0} 42)`}
          role="button"
          tabIndex={0}
          aria-label={`选择 Token ${index + 1}：${trace.input.tokens[index].trim()}，查看 Embedding`}
          onClick={() => onSelectToken(index)}
          onKeyDown={(event) => activateWithKeyboard(event, () => onSelectToken(index))}
        >
          <rect width={x.bandwidth()} height="44" rx="6" />
          <text x={x.bandwidth() / 2} y="19" textAnchor="middle">T{index + 1}</text>
          <text x={x.bandwidth() / 2} y="34" textAnchor="middle">{trace.input.tokens[index].trim()}</text>
        </g>
      ))}
      {rows.map((row) => (
        <g key={row.role} className={`trace2d-embedding-row is-${row.role}`}>
          <text className="trace2d-embedding-row__label" x="42" y={row.y + 22}>{row.label}</text>
          <text className="trace2d-embedding-row__shape" x="42" y={row.y + 42}>[1, 6, 8]</text>
          {row.values.map((value, dimension) => (
            <g key={dimension} transform={`translate(${cellsStart + dimension * (cellWidth + cellGap)} ${row.y})`}>
              <rect
                className={`trace2d-embedding-cell${value < 0 ? ' is-negative' : ''}`}
                width={cellWidth}
                height="48"
                rx="4"
                fillOpacity={0.35 + Math.min(0.65, Math.abs(value))}
              >
                <title>{row.label}，维度 {dimension + 1}：{numberFormat(value)}</title>
              </rect>
              <text className="trace2d-embedding-cell__value" x={cellWidth / 2} y="29" textAnchor="middle">
                {numberFormat(value)}
              </text>
            </g>
          ))}
        </g>
      ))}
      {showComposition && (
        <>
          <text className="trace2d-embedding-operator" x="192" y="199">＋</text>
          <text className="trace2d-embedding-operator" x="192" y="277">＝</text>
        </>
      )}
    </svg>
  )
}

function LayerNormDiagram({
  trace,
  selectedTokenIndex,
  onSelectToken,
}: {
  trace: ModelTrace
  selectedTokenIndex: number | null
  onSelectToken: (index: number) => void
}) {
  const indexes = trace.input.tokens.map((_, index) => index)
  const selected = selectedTokenIndex ?? 0
  const tokenX = scaleBand<number>().domain(indexes).range([42, 678]).padding(0.12)
  const before = getEmbeddingSample(trace, selected, 'embedding')
  const after = getEmbeddingSample(trace, selected, 'normalized')
  const beforeStats = getVectorStats(before)
  const afterStats = getVectorStats(after)
  const maxAbsolute = Math.max(2, ...before.map(Math.abs), ...after.map(Math.abs))
  const valueX = scaleLinear().domain([-maxAbsolute, maxAbsolute]).range([254, 666])
  const rows = [
    { label: '归一化前', values: before, stats: beforeStats, y: 156, className: 'is-before' },
    { label: 'LayerNorm 后', values: after, stats: afterStats, y: 284, className: 'is-after' },
  ]

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img" aria-labelledby="layernorm-title layernorm-desc">
      <title id="layernorm-title">LayerNorm 归一化前后分布图</title>
      <desc id="layernorm-desc">
        选择任意 Token，对比它的八维隐藏向量在 LayerNorm 前后的均值、标准差和数值分布。
      </desc>
      <text className="trace2d-svg__axis-title" x="42" y="28">
        选择 Token · 当前 T{selected + 1} “{trace.input.tokens[selected].trim()}”
      </text>
      {indexes.map((index) => (
        <g
          key={`layernorm-token-${index}`}
          className={`trace2d-embedding-token${selected === index ? ' is-selected' : ''}`}
          transform={`translate(${tokenX(index) ?? 0} 42)`}
          role="button"
          tabIndex={0}
          aria-label={`选择 Token ${index + 1}：${trace.input.tokens[index].trim()}，查看 LayerNorm`}
          onClick={() => onSelectToken(index)}
          onKeyDown={(event) => activateWithKeyboard(event, () => onSelectToken(index))}
        >
          <rect width={tokenX.bandwidth()} height="44" rx="6" />
          <text x={tokenX.bandwidth() / 2} y="19" textAnchor="middle">T{index + 1}</text>
          <text x={tokenX.bandwidth() / 2} y="34" textAnchor="middle">{trace.input.tokens[index].trim()}</text>
        </g>
      ))}
      {rows.map((row) => (
        <g key={row.label} className={`trace2d-normalization-row ${row.className}`}>
          <text className="trace2d-normalization-row__label" x="42" y={row.y - 12}>{row.label}</text>
          <text className="trace2d-normalization-row__stats" x="42" y={row.y + 12}>
            μ {numberFormat(row.stats.mean)} · σ {numberFormat(row.stats.standardDeviation)}
          </text>
          <line className="trace2d-normalization-axis" x1="254" x2="666" y1={row.y} y2={row.y} />
          <line
            className="trace2d-normalization-mean"
            x1={valueX(row.stats.mean)}
            x2={valueX(row.stats.mean)}
            y1={row.y - 30}
            y2={row.y + 30}
          />
          {row.values.map((value, dimension) => (
            <circle
              key={dimension}
              className="trace2d-normalization-point"
              cx={valueX(value)}
              cy={row.y + ((dimension % 3) - 1) * 12}
              r="7"
            >
              <title>维度 {dimension + 1}：{numberFormat(value)}</title>
            </circle>
          ))}
          <text className="trace2d-normalization-min" x="254" y={row.y + 46}>−{numberFormat(maxAbsolute)}</text>
          <text className="trace2d-normalization-max" x="666" y={row.y + 46} textAnchor="end">+{numberFormat(maxAbsolute)}</text>
        </g>
      ))}
      <g className="trace2d-normalization-action" transform="translate(560 196)">
        <path d="M0 0v32" />
        <path d="m-5 26 5 6 5-6" />
        <text x="-12" y="16" textAnchor="end">中心化 + 缩放</text>
      </g>
    </svg>
  )
}

function QKVDiagram({ trace, onSelectOperation }: { trace: ModelTrace; onSelectOperation: () => void }) {
  const headSize = trace.model.hiddenSize / trace.model.heads
  const paths = [
    { channel: 'Q', label: '查询 · 我在找什么', matrix: 'W_Q · [8, 8]', className: 'is-q', y: 78 },
    { channel: 'K', label: '索引 · 我有什么特征', matrix: 'W_K · [8, 8]', className: 'is-k', y: 160 },
    { channel: 'V', label: '内容 · 我要贡献什么', matrix: 'W_V · [8, 8]', className: 'is-v', y: 242 },
  ]
  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img" aria-labelledby="qkv-title qkv-desc">
      <title id="qkv-title">Q、K、V 投影二维图</title>
      <desc id="qkv-desc">六个归一化后的八维 Token 向量经过三组独立权重，投影为两组四维的查询、索引和内容向量。</desc>
      <g className="trace2d-source" transform="translate(42 118)">
        <rect width="174" height="120" rx="9" />
        <text x="87" y="38" textAnchor="middle">LayerNorm 输出 X̂</text>
        <text className="trace2d-svg__small" x="87" y="68" textAnchor="middle">[1, {trace.input.tokens.length}, {trace.model.hiddenSize}]</text>
        <text className="trace2d-svg__small" x="87" y="92" textAnchor="middle">同一输入 · 三组权重</text>
      </g>
      {paths.map((path) => (
        <g key={path.channel}>
          <path className={`trace2d-projection-line ${path.className}`} d={`M216 178 C290 178 280 ${path.y + 30} 360 ${path.y + 30}`} />
          <g
            className={`trace2d-projection ${path.className}`}
            transform={`translate(360 ${path.y})`}
            role="button"
            tabIndex={0}
            aria-label={`选择 ${path.channel} 投影：${path.label}`}
            onClick={onSelectOperation}
            onKeyDown={(event) => activateWithKeyboard(event, onSelectOperation)}
          >
            <rect width="318" height="60" rx="8" />
            <text x="22" y="26">{path.channel}</text>
            <text className="trace2d-svg__small" x="66" y="17">{path.label}</text>
            <text className="trace2d-svg__small" x="66" y="34">{path.matrix}</text>
            <text className="trace2d-svg__small" x="176" y="34">→ [1, {trace.model.heads}, {trace.input.tokens.length}, {headSize}]</text>
          </g>
        </g>
      ))}
    </svg>
  )
}

function AttentionDiagram({
  trace,
  headIndex,
  selectedTokenIndex,
  onSelectToken,
}: {
  trace: ModelTrace
  headIndex: number
  selectedTokenIndex: number | null
  onSelectToken: (index: number) => void
}) {
  const cells = getAttentionCells(trace, headIndex)
  const indexes = trace.input.tokens.map((_, index) => index)
  const [focusedCell, setFocusedCell] = useState(() => ({
    row: Math.max(0, indexes.length - 1),
    column: Math.max(0, indexes.length - 2),
  }))
  const position = scaleBand<number>().domain(indexes).range([92, 338]).paddingInner(0.08)
  const opacity = scaleLinear().domain([0, max(cells, (cell) => cell.value) ?? 1]).range([0.14, 1])
  const size = position.bandwidth()
  const selected = selectedTokenIndex ?? focusedCell.row
  const comparisonRows = getAttentionHeadRows(trace, focusedCell.row)
  const comparisonX = scaleBand<number>().domain(indexes).range([410, 690]).padding(0.24)
  const comparisonMax = max(
    comparisonRows.flatMap((row) => row.weights),
  ) ?? 1
  const comparisonHeight = scaleLinear().domain([0, comparisonMax]).range([0, 82])
  const focusedValues = comparisonRows.map(
    (row) => row.weights[focusedCell.column] ?? 0,
  )
  const focusedDelta = Math.max(...focusedValues) - Math.min(...focusedValues)
  const focusedMasked = focusedCell.column > focusedCell.row
  const headColors = ['var(--amber-400)', 'var(--k-color)', 'var(--v-color)']
  const barWidth = Math.min(
    12,
    (comparisonX.bandwidth() - 4) / Math.max(1, trace.model.heads),
  )
  const baseline = 230

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img" aria-labelledby="attention-title attention-desc">
      <title id="attention-title">Attention Head {headIndex + 1} 权重矩阵</title>
      <desc id="attention-desc">左侧展开 Head {headIndex + 1} 的完整权重矩阵，右侧对比全部 Head 在查询 Token {trace.input.tokens[focusedCell.row].trim()} 上的注意力分布；未来位置使用交叉图案遮挡。</desc>
      <defs>
        <pattern id="masked-cell-pattern" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 0 8 8M8 0 0 8" className="trace2d-mask-pattern" />
        </pattern>
      </defs>
      <text className="trace2d-svg__axis-title" x="92" y="30">被读取的 Token（K / V）→</text>
      <text className="trace2d-svg__axis-title" transform="translate(24 338) rotate(-90)">查询 Token（Q）→</text>
      {indexes.map((index) => (
        <g key={`labels-${index}`}>
          <text className="trace2d-matrix-label" x={(position(index) ?? 0) + size / 2} y="75" textAnchor="middle">{trace.input.tokens[index].trim()}</text>
          <text className={`trace2d-matrix-label${selected === index ? ' is-selected' : ''}`} x="78" y={(position(index) ?? 0) + size / 2 + 4} textAnchor="end">{trace.input.tokens[index].trim()}</text>
        </g>
      ))}
      {cells.map((cell) => (
        <g
          key={`${cell.row}-${cell.column}`}
          role="button"
          tabIndex={0}
          aria-pressed={
            focusedCell.row === cell.row && focusedCell.column === cell.column
          }
          aria-label={`${trace.input.tokens[cell.row].trim()} 读取 ${trace.input.tokens[cell.column].trim()}：${cell.masked ? '被因果掩码遮挡' : `权重 ${numberFormat(cell.value)}`}`}
          onClick={() => {
            setFocusedCell({ row: cell.row, column: cell.column })
            onSelectToken(cell.row)
          }}
          onKeyDown={(event) =>
            activateWithKeyboard(event, () => {
              setFocusedCell({ row: cell.row, column: cell.column })
              onSelectToken(cell.row)
            })
          }
        >
          <rect
            className={`trace2d-matrix-cell${selected === cell.row ? ' is-row-selected' : ''}${focusedCell.row === cell.row && focusedCell.column === cell.column ? ' is-cell-selected' : ''}`}
            x={position(cell.column)}
            y={position(cell.row)}
            width={size}
            height={size}
            rx="3"
            fill={cell.masked ? 'url(#masked-cell-pattern)' : 'var(--amber-400)'}
            fillOpacity={cell.masked ? 1 : opacity(cell.value)}
          />
          <text className="trace2d-cell-value" x={(position(cell.column) ?? 0) + size / 2} y={(position(cell.row) ?? 0) + size / 2 + 4} textAnchor="middle">
            {cell.masked ? '×' : numberFormat(cell.value)}
          </text>
        </g>
      ))}
      <g className="trace2d-head-comparison">
        <text className="trace2d-svg__axis-title" x="410" y="30">跨 Head · 查询 {trace.input.tokens[focusedCell.row].trim()}</text>
        <text className="trace2d-svg__small" x="410" y="50">同一行 Softmax 后，对比关注分布。</text>
        {comparisonRows.map((row, headRowIndex) => (
          <g key={`comparison-head-${row.headIndex}`}>
            <rect
              className="trace2d-head-comparison__legend"
              x={410 + headRowIndex * 76}
              y="66"
              width="11"
              height="11"
              fill={headColors[row.headIndex % headColors.length]}
            />
            <text className="trace2d-svg__small" x={426 + headRowIndex * 76} y="76">
              H{row.headIndex + 1} · Σ {numberFormat(row.sum)}
            </text>
            {row.weights.map((value, column) => {
              const groupX = comparisonX(column) ?? 0
              const barX = groupX + 2 + headRowIndex * barWidth
              const height = comparisonHeight(value)
              return (
                <rect
                  key={`comparison-${row.headIndex}-${column}`}
                  className={`trace2d-head-comparison__bar${row.headIndex === headIndex ? ' is-active' : ''}`}
                  x={barX}
                  y={baseline - height}
                  width={barWidth}
                  height={height}
                  rx="2"
                  fill={headColors[row.headIndex % headColors.length]}
                >
                  <title>Head {row.headIndex + 1} 读取 {trace.input.tokens[column].trim()}：{numberFormat(value)}</title>
                </rect>
              )
            })}
          </g>
        ))}
        <line className="trace2d-head-comparison__baseline" x1="410" x2="690" y1={baseline} y2={baseline} />
        {indexes.map((index) => (
          <g key={`comparison-label-${index}`}>
            {index === focusedCell.column && (
              <rect
                className="trace2d-head-comparison__focus"
                x={(comparisonX(index) ?? 0) - 2}
                y="94"
                width={comparisonX.bandwidth() + 4}
                height="158"
                rx="4"
              />
            )}
            <text
              className="trace2d-matrix-label"
              x={(comparisonX(index) ?? 0) + comparisonX.bandwidth() / 2}
              y="248"
              textAnchor="middle"
            >
              {trace.input.tokens[index].trim()}
            </text>
          </g>
        ))}
        <text className="trace2d-head-comparison__focus-title" x="410" y="284">
          局部展开 · {trace.input.tokens[focusedCell.row].trim()} → {trace.input.tokens[focusedCell.column].trim()}
        </text>
        <text className="trace2d-svg__small" x="410" y="307">
          {focusedMasked
            ? '两个 Head 都被因果掩码置为 0'
            : comparisonRows.map((row) => `H${row.headIndex + 1} ${numberFormat(row.weights[focusedCell.column] ?? 0)}`).join(' · ')}
        </text>
        <text className="trace2d-svg__small" x="410" y="330">
          {focusedMasked
            ? '未来位置不可读取'
            : `差值 Δ ${numberFormat(focusedDelta)} · 点击矩阵格继续比较`}
        </text>
      </g>
    </svg>
  )
}

function AttentionProof({ trace }: { trace: ModelTrace }) {
  const checks = getAttentionChecks(trace)
  const softmaxValid = checks.normalizedRowCount === checks.totalRowCount

  return (
    <section className="trace2d-attention-proof" aria-label="多头注意力校验">
      <article data-valid={checks.causalMaskValid}>
        <span aria-hidden="true">{checks.causalMaskValid ? '✓' : '!'}</span>
        <div>
          <strong>因果掩码</strong>
          <code>[{checks.maskShape.join(', ')}]</code>
          <small>上三角不可读取</small>
        </div>
      </article>
      <article data-valid={softmaxValid}>
        <span aria-hidden="true">{softmaxValid ? '✓' : '!'}</span>
        <div>
          <strong>Softmax · dim = −1</strong>
          <code>[{checks.weightsShape.join(', ')}]</code>
          <small>{checks.normalizedRowCount} / {checks.totalRowCount} 行 Σ = 1</small>
        </div>
      </article>
      <article data-valid={checks.concatenationValid}>
        <span aria-hidden="true">{checks.concatenationValid ? '✓' : '!'}</span>
        <div>
          <strong>Head 拼接</strong>
          <code>[{checks.headOutputShape.join(', ')}] → [{checks.concatenatedShape.join(', ')}]</code>
          <small>{trace.model.heads} × {trace.model.hiddenSize / trace.model.heads}D → {trace.model.hiddenSize}D</small>
        </div>
      </article>
    </section>
  )
}

function ResidualMLPDiagram({
  trace,
  operation,
  onSelectOperation,
}: {
  trace: ModelTrace
  operation: TraceOperation
  onSelectOperation: (entityId: string) => void
}) {
  const hiddenSize = trace.model.hiddenSize
  const intermediateSize = hiddenSize * 4
  const nodes = [
    {
      operation: 'add-attention-residual',
      entityId: 'operation:residual-attention',
      x: 142,
      label: '＋',
      detail: 'RESIDUAL 01',
    },
    {
      operation: 'normalize-feed-forward',
      entityId: 'operation:mlp-layernorm',
      x: 262,
      label: 'LN',
      detail: 'PRE-NORM',
    },
    {
      operation: 'feed-forward',
      entityId: 'operation:mlp',
      x: 450,
      label: 'MLP',
      detail: `${hiddenSize} → ${intermediateSize} → ${hiddenSize}`,
    },
    {
      operation: 'add-mlp-residual',
      entityId: 'operation:residual-mlp',
      x: 650,
      label: '＋',
      detail: 'RESIDUAL 02',
    },
  ] as const

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img" aria-labelledby="residual-mlp-title residual-mlp-desc">
      <title id="residual-mlp-title">Residual 与 MLP 计算路径图</title>
      <desc id="residual-mlp-desc">
        Attention 输出先与原始隐藏向量相加，再经过 LayerNorm、八维到三十二维再回八维的 MLP，最后与残差主路相加。
      </desc>
      <path className="trace2d-block-flow" d="M52 174H690" />
      <path className="trace2d-residual-bypass" d="M52 76H142V142" />
      <path className="trace2d-residual-bypass" d="M142 206V286H650V206" />
      <text className="trace2d-svg__axis-title" x="52" y="44">TRANSFORMER BLOCK · PRE-NORM</text>
      <text className="trace2d-svg__small" x="52" y="70">X · [1, {trace.input.tokens.length}, {hiddenSize}]</text>
      <text className="trace2d-svg__small" x="52" y="164">ATTENTION · {hiddenSize}D</text>
      <text className="trace2d-svg__small" x="350" y="310">残差主路保持 {hiddenSize}D</text>
      <text className="trace2d-svg__small" x="594" y="164">MLP OUT · {hiddenSize}D</text>
      <text className="trace2d-svg__small" x="640" y="338">BLOCK OUT · [1, {trace.input.tokens.length}, {hiddenSize}]</text>

      {nodes.map((node) => {
        const active = operation === node.operation
        const isMlp = node.operation === 'feed-forward'
        return (
          <g
            key={node.operation}
            className={`trace2d-block-node${active ? ' is-active' : ''}${isMlp ? ' is-mlp' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${node.detail}：${node.label}`}
            onClick={() => onSelectOperation(node.entityId)}
            onKeyDown={(event) =>
              activateWithKeyboard(event, () => onSelectOperation(node.entityId))
            }
          >
            {isMlp ? (
              <>
                <path d={`M${node.x - 74} 136H${node.x + 74}L${node.x + 50} 212H${node.x - 50}Z`} />
                <line x1={node.x - 25} x2={node.x - 25} y1="148" y2="200" />
                <line x1={node.x + 25} x2={node.x + 25} y1="148" y2="200" />
                <text x={node.x} y="179" textAnchor="middle">{node.label}</text>
                <text className="trace2d-svg__small" x={node.x} y="232" textAnchor="middle">{node.detail}</text>
                <text className="trace2d-svg__micro" x={node.x - 50} y="126">UP</text>
                <text className="trace2d-svg__micro" x={node.x} y="126" textAnchor="middle">GELU</text>
                <text className="trace2d-svg__micro" x={node.x + 50} y="126" textAnchor="end">DOWN</text>
              </>
            ) : (
              <>
                <circle cx={node.x} cy="174" r="32" />
                <text x={node.x} y="182" textAnchor="middle">{node.label}</text>
                <text className="trace2d-svg__small" x={node.x} y="232" textAnchor="middle">{node.detail}</text>
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function ResidualMLPProof({ trace }: { trace: ModelTrace }) {
  const checks = getResidualMlpChecks(trace)
  const cards = [
    {
      label: 'Attention 残差',
      code: `[${checks.hiddenShape.join(', ')}]`,
      detail: 'X + Attention，形状不变',
      valid: checks.attentionResidualValid,
    },
    {
      label: 'LayerNorm 顺序',
      code: 'Residual → LN → MLP',
      detail: 'Pre-Norm 前馈子层',
      valid: checks.normalizationValid,
    },
    {
      label: 'MLP 扩维',
      code: `${trace.model.hiddenSize}D → ${trace.model.hiddenSize * 4}D → ${trace.model.hiddenSize}D`,
      detail: 'Linear → GELU → Linear',
      valid: checks.activationValid,
    },
    {
      label: 'Block 残差',
      code: `[${checks.hiddenShape.join(', ')}]`,
      detail: 'Residual + MLP，形状不变',
      valid: checks.blockResidualValid,
    },
  ]

  return (
    <section className="trace2d-block-proof" aria-label="Residual 与 MLP 校验">
      {cards.map((card) => (
        <article key={card.label} data-valid={card.valid}>
          <span aria-hidden="true">{card.valid ? '✓' : '!'}</span>
          <div>
            <strong>{card.label}</strong>
            <code>{card.code}</code>
            <small>{card.detail}</small>
          </div>
        </article>
      ))}
    </section>
  )
}

function OutputDiagram({
  trace,
  operation,
  experiment,
  selectedEntityId,
  onSelectOutput,
}: {
  trace: ModelTrace
  operation: TraceOperation
  experiment: SamplingExperiment
  selectedEntityId: string | null
  onSelectOutput: (isSampled: boolean) => void
}) {
  const isLogitStep = operation === 'project-logits'
  const isSamplingStep = operation === 'sample-token'
  const sampledCandidate = experiment.sampledCandidate
  const leadingCandidates = experiment.candidates.slice(0, 5)
  const candidates =
    isSamplingStep &&
    sampledCandidate &&
    !leadingCandidates.some((candidate) => candidate.tokenId === sampledCandidate.tokenId)
      ? [...leadingCandidates.slice(0, 4), sampledCandidate]
      : leadingCandidates
  const y = scaleBand<string>()
    .domain(candidates.map((candidate) => `${candidate.tokenId}`))
    .range([52, 320])
    .padding(0.22)
  const candidateValue = (candidate: (typeof candidates)[number]) =>
    isLogitStep
      ? candidate.logit
      : isSamplingStep
        ? candidate.probability
        : candidate.temperatureProbability
  const values = candidates.map(candidateValue)
  const minimumLogit = Math.min(...values)
  const maximumValue = max(values) ?? 1
  const width = scaleLinear()
    .domain(isLogitStep ? [minimumLogit, maximumValue] : [0, maximumValue])
    .range(isLogitStep ? [72, 420] : [0, 420])
  const title = isLogitStep ? '输出候选 Logit 图' : '输出候选概率图'
  const axisTitle = isLogitStep
    ? 'Top 5 候选 · Logit'
    : isSamplingStep
      ? `采样池 ${experiment.eligibleCount} / ${experiment.candidates.length} · 重归一化概率`
      : `Top 5 候选 · Temperature ${experiment.parameters.temperature.toFixed(1)}`
  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img" aria-labelledby="output-title output-desc">
      <title id="output-title">{title}</title>
      <desc id="output-desc">
        {isLogitStep
          ? '展示教学词表中分数最高的五个候选 Token。'
          : isSamplingStep
            ? '展示经过 Temperature、Top-k 与 Top-p 处理后的候选池和确定性采样结果。'
            : '展示 Temperature 调整后的候选 Token 概率。'}
      </desc>
      <text className="trace2d-svg__axis-title" x="42" y="30">{axisTitle}</text>
      {candidates.map((candidate) => {
        const rowY = y(`${candidate.tokenId}`) ?? 0
        const value = candidateValue(candidate)
        const isSampled =
          isSamplingStep && candidate.tokenId === sampledCandidate?.tokenId
        const isSelected =
          selectedEntityId === `output-token:${candidate.tokenId}`
        const candidateLabel = candidate.token.trim() || '空格'
        const rank = experiment.candidates.findIndex(
          (rankedCandidate) => rankedCandidate.tokenId === candidate.tokenId,
        )
        const valueLabel = isLogitStep
          ? numberFormat(candidate.logit)
          : `${(value * 100).toFixed(1)}%`
        const accessibleValue = isLogitStep
          ? `Logit ${candidate.logit}`
          : `概率 ${(value * 100).toFixed(1)}%`
        return (
          <g
            key={candidate.tokenId}
            className={`trace2d-candidate${isSampled ? ' is-sampled' : ''}${isSelected ? ' is-selected' : ''}${isSamplingStep && !candidate.eligible ? ' is-ineligible' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${candidateLabel}，${accessibleValue}，Logit ${candidate.logit}${isSamplingStep && !candidate.eligible ? '，已排除' : ''}`}
            onClick={() =>
              onSelectOutput(candidate.tokenId === trace.output.sampledTokenId)
            }
            onKeyDown={(event) =>
              activateWithKeyboard(event, () =>
                onSelectOutput(candidate.tokenId === trace.output.sampledTokenId),
              )
            }
          >
            <text className="trace2d-candidate__rank" x="42" y={rowY + y.bandwidth() / 2 + 5}>{String(rank + 1).padStart(2, '0')}</text>
            <text className="trace2d-candidate__token" x="82" y={rowY + y.bandwidth() / 2 + 5}>{candidateLabel}</text>
            <rect className="trace2d-candidate__track" x="190" y={rowY} width="420" height={y.bandwidth()} rx="5" />
            <rect className="trace2d-candidate__bar" x="190" y={rowY} width={width(value)} height={y.bandwidth()} rx="5" />
            <text className="trace2d-candidate__value" x="622" y={rowY + y.bandwidth() / 2 + 5}>{valueLabel}</text>
            {isSampled && <text className="trace2d-candidate__sampled" x="674" y={rowY + y.bandwidth() / 2 + 5} textAnchor="end">已采样</text>}
            {isSamplingStep && !candidate.eligible && <text className="trace2d-candidate__excluded" x="674" y={rowY + y.bandwidth() / 2 + 5} textAnchor="end">已排除</text>}
          </g>
        )
      })}
    </svg>
  )
}

function SamplingControls({
  mode,
  experiment,
  defaults,
  onChange,
}: {
  mode: 'temperature' | 'sampling'
  experiment: SamplingExperiment
  defaults: SamplingParameters
  onChange: (parameters: SamplingParameters) => void
}) {
  const { parameters, sampledCandidate } = experiment
  const isSampling = mode === 'sampling'
  const isDefault =
    parameters.temperature === defaults.temperature &&
    parameters.topK === defaults.topK &&
    parameters.topP === defaults.topP &&
    parameters.seed === defaults.seed
  const update = (patch: Partial<SamplingParameters>) =>
    onChange({ ...parameters, ...patch })
  const topCandidate = experiment.candidates[0]
  const sampledLabel = sampledCandidate?.token.trim() || '空格'
  const topLabel = topCandidate?.token.trim() || '空格'

  return (
    <section className="sampling-lab" aria-labelledby="sampling-lab-title">
      <header className="sampling-lab__heading">
        <div>
          <h3 id="sampling-lab-title">
            {isSampling ? '采样实验' : 'Temperature 实验'}
          </h3>
          <p>
            {isSampling
              ? '按 Temperature → Top-k → Top-p 的顺序重算；Seed 让结果可以复现。'
              : '只改变分数的集中程度，原始 Logits 保持不变。'}
          </p>
        </div>
        <button
          type="button"
          disabled={isDefault}
          onClick={() => onChange(defaults)}
        >
          恢复默认
        </button>
      </header>

      <div
        className={`sampling-lab__controls${isSampling ? '' : ' is-compact'}`}
      >
        <label>
          <span>
            Temperature
            <output htmlFor="sampling-temperature">
              {parameters.temperature.toFixed(1)}
            </output>
          </span>
          <input
            id="sampling-temperature"
            type="range"
            min="0.2"
            max="2"
            step="0.1"
            value={parameters.temperature}
            aria-label="Temperature"
            aria-valuetext={parameters.temperature.toFixed(1)}
            onChange={(event) =>
              update({ temperature: event.currentTarget.valueAsNumber })
            }
          />
          <small>低温更集中，高温更分散</small>
        </label>

        {isSampling && (
          <>
            <label>
              <span>
                Top-k
                <output htmlFor="sampling-top-k">{parameters.topK}</output>
              </span>
              <input
                id="sampling-top-k"
                type="range"
                min="1"
                max={experiment.candidates.length}
                step="1"
                value={parameters.topK}
                aria-label="Top-k"
                aria-valuetext={`${parameters.topK} 个候选`}
                onChange={(event) =>
                  update({ topK: event.currentTarget.valueAsNumber })
                }
              />
              <small>先保留固定数量的高分项</small>
            </label>

            <label>
              <span>
                Top-p
                <output htmlFor="sampling-top-p">
                  {parameters.topP.toFixed(2)}
                </output>
              </span>
              <input
                id="sampling-top-p"
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={parameters.topP}
                aria-label="Top-p"
                aria-valuetext={`${Math.round(parameters.topP * 100)}% 累计概率`}
                onChange={(event) =>
                  update({ topP: event.currentTarget.valueAsNumber })
                }
              />
              <small>再保留达到概率阈值的最小集合</small>
            </label>

            <label>
              <span>
                Seed
                <output htmlFor="sampling-seed">{parameters.seed}</output>
              </span>
              <input
                id="sampling-seed"
                type="number"
                min="0"
                max="999999"
                step="1"
                value={parameters.seed}
                aria-label="Seed"
                onChange={(event) =>
                  update({ seed: event.currentTarget.valueAsNumber })
                }
              />
              <small>相同参数与 Seed 得到相同结果</small>
            </label>
          </>
        )}
      </div>

      <p className="sampling-lab__result" aria-live="polite">
        {isSampling ? (
          <>
            候选池 <strong>{experiment.eligibleCount} / {experiment.candidates.length}</strong>
            <span aria-hidden="true">→</span>
            Seed {parameters.seed} 采样 <strong>“{sampledLabel}”</strong>
          </>
        ) : (
          <>
            当前最高候选 <strong>“{topLabel}”</strong>
            <span aria-hidden="true">·</span>
            <strong>{((topCandidate?.temperatureProbability ?? 0) * 100).toFixed(1)}%</strong>
          </>
        )}
      </p>
    </section>
  )
}

function TensorCard({ tensor }: { tensor: TensorSummary }) {
  const preview = tensor.values.slice(0, 5).map(numberFormat).join(', ')
  return (
    <article className="trace2d-tensor-card">
      <div>
        <strong>{tensor.name}</strong>
        <code>{formatTensorShape(tensor)}</code>
      </div>
      <p>{tensor.role} · {tensor.dtype} · {tensor.sampleMethod}</p>
      <small>样本：{preview}{tensor.values.length > 5 ? ', …' : ''}</small>
    </article>
  )
}

export function Trace2DPanel({ store, isActive }: Trace2DPanelProps) {
  const trace = useStore(store, (state) => state.trace)
  const traceStatus = useStore(store, (state) => state.traceStatus)
  const currentStep = useStore(store, selectCurrentStep)
  const currentStepIndex = useStore(store, (state) => state.currentStepIndex)
  const selectedTokenIndex = useStore(store, (state) => state.selectedTokenIndex)
  const selectedHeadIndex = useStore(store, (state) => state.selectedHeadIndex)
  const selectedEntityId = useStore(store, (state) => state.selectedEntityId)
  const [samplingParameters, setSamplingParameters] =
    useState<SamplingParameters>(() =>
      trace
        ? normalizeSamplingParameters(
            trace.output.defaultSampling,
            trace.output.candidates.length,
          )
        : DEFAULT_SAMPLING_PARAMETERS,
    )

  useEffect(() => {
    if (!trace) return
    setSamplingParameters(
      normalizeSamplingParameters(
        trace.output.defaultSampling,
        trace.output.candidates.length,
      ),
    )
  }, [trace])

  const samplingExperiment = useMemo(
    () =>
      trace && currentStep?.phase === 'output'
        ? runSamplingExperiment(trace.output.candidates, samplingParameters)
        : null,
    [currentStep?.phase, samplingParameters, trace],
  )

  if (!trace || !currentStep) {
    return (
      <section
        id="view-panel-2d"
        className={`workspace-panel calculation-panel trace2d-panel${isActive ? ' is-mobile-active' : ''}`}
        role="tabpanel"
        aria-labelledby="mobile-view-2d"
      >
        <div className="trace2d-empty" role="status">
          <span aria-hidden="true" />
          <strong>{traceStatus === 'error' ? '二维数据暂不可用' : '正在准备二维模型轨迹'}</strong>
          <p>课程正文可以先阅读，模型轨迹就绪后会自动显示计算图。</p>
        </div>
      </section>
    )
  }

  const stage = getTrace2DStage(currentStep.operation)
  const tensors = resolveStepTensors(trace, currentStep)
  const primaryTensor = tensors.outputs.at(-1) ?? tensors.inputs.at(-1)
  const activeHead = selectedHeadIndex ?? 0
  const summary =
    currentStep.operation === 'softmax' && samplingExperiment
      ? `Temperature ${samplingExperiment.parameters.temperature.toFixed(1)} 时，最高候选“${samplingExperiment.candidates[0]?.token.trim() || '空格'}”的概率为 ${((samplingExperiment.candidates[0]?.temperatureProbability ?? 0) * 100).toFixed(1)}%。`
      : currentStep.operation === 'sample-token' && samplingExperiment
        ? `Top-k 与 Top-p 留下 ${samplingExperiment.eligibleCount} 个候选；Seed ${samplingExperiment.parameters.seed} 可复现地采样出“${samplingExperiment.sampledCandidate?.token.trim() || '空格'}”。`
        : createStepSummary(trace, currentStep, activeHead)
  const probabilityTensor = trace.tensors[trace.output.probabilitiesTensorId]
  const experimentProbabilityTensor = probabilityTensor &&
    currentStep.operation === 'softmax' && samplingExperiment
    ? {
        ...probabilityTensor,
        values: samplingExperiment.candidates
          .toSorted((left, right) => left.tokenId - right.tokenId)
          .map((candidate) => candidate.temperatureProbability),
        min: Math.min(
          ...samplingExperiment.candidates.map(
            (candidate) => candidate.temperatureProbability,
          ),
        ),
        max: Math.max(
          ...samplingExperiment.candidates.map(
            (candidate) => candidate.temperatureProbability,
          ),
        ),
        mean: 1 / Math.max(samplingExperiment.candidates.length, 1),
      }
    : null
  const displayedOutputTensors = tensors.outputs.map((tensor) =>
    currentStep.operation === 'softmax' &&
    experimentProbabilityTensor &&
    tensor.id === experimentProbabilityTensor.id
      ? experimentProbabilityTensor
      : tensor,
  )
  const normalizedSamplingDefaults = normalizeSamplingParameters(
    trace.output.defaultSampling,
    trace.output.candidates.length,
  )
  const updateSamplingParameters = (parameters: SamplingParameters) =>
    setSamplingParameters(
      normalizeSamplingParameters(parameters, trace.output.candidates.length),
    )

  return (
    <section
      id="view-panel-2d"
      className={`workspace-panel calculation-panel trace2d-panel${isActive ? ' is-mobile-active' : ''}`}
      role="tabpanel"
      aria-labelledby="mobile-view-2d"
    >
      <header className="panel-heading panel-heading--light trace2d-heading">
        <div>
          <p className="eyebrow eyebrow--ink">二维计算台 · {currentStep.operation}</p>
          <h2 id="calculation-heading" tabIndex={-1}>{currentStep.title}</h2>
        </div>
        <span className="tensor-shape" aria-label={`当前张量形状 ${formatTensorShape(primaryTensor)}`}>
          {primaryTensor?.name ?? '原始文本'} · {formatTensorShape(primaryTensor)}
        </span>
      </header>

      <ol className="trace2d-step-strip" aria-label="二维计算步骤">
        {trace.steps.map((step, index) => (
          <li key={step.id}>
            <button
              type="button"
              aria-label={`跳到第 ${index + 1} 步：${step.title}`}
              aria-current={index === currentStepIndex ? 'step' : undefined}
              onClick={() => store.getState().goToStep(index)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <small>{step.phase}</small>
            </button>
          </li>
        ))}
      </ol>

      {stage === 'attention' && (
        <div className="trace2d-head-switch" role="group" aria-label="Attention Head">
          {Array.from({ length: trace.model.heads }, (_, index) => (
            <button
              key={index}
              type="button"
              aria-pressed={activeHead === index}
              onClick={() => store.getState().selectHead(index)}
            >
              Head {index + 1}
            </button>
          ))}
        </div>
      )}

      {(currentStep.operation === 'softmax' ||
        currentStep.operation === 'sample-token') && samplingExperiment && (
        <SamplingControls
          mode={
            currentStep.operation === 'sample-token'
              ? 'sampling'
              : 'temperature'
          }
          experiment={samplingExperiment}
          defaults={normalizedSamplingDefaults}
          onChange={updateSamplingParameters}
        />
      )}

      <p id="trace2d-scroll-hint" className="trace2d-scroll-hint">
        左右滑动查看完整计算图
      </p>

      <div
        className="calculation-figure trace2d-figure"
        role="group"
        tabIndex={0}
        aria-label="可横向滚动的二维计算图"
        aria-describedby="trace2d-scroll-hint"
      >
        {stage === 'token' && (
          <TokenDiagram
            trace={trace}
            selectedTokenIndex={selectedTokenIndex}
            onSelectToken={(index) => store.getState().selectToken(index)}
          />
        )}
        {stage === 'embedding' && (
          <EmbeddingDiagram
            trace={trace}
            selectedTokenIndex={selectedTokenIndex}
            showComposition={currentStep.operation === 'add-position-embedding'}
            onSelectToken={(index) => store.getState().selectToken(index)}
          />
        )}
        {stage === 'normalization' && (
          <LayerNormDiagram
            trace={trace}
            selectedTokenIndex={selectedTokenIndex}
            onSelectToken={(index) => store.getState().selectToken(index)}
          />
        )}
        {stage === 'qkv' && (
          <QKVDiagram
            trace={trace}
            onSelectOperation={() => store.getState().selectEntity('operation:qkv')}
          />
        )}
        {stage === 'attention' && (
          <AttentionDiagram
            trace={trace}
            headIndex={activeHead}
            selectedTokenIndex={selectedTokenIndex}
            onSelectToken={(index) => store.getState().selectToken(index)}
          />
        )}
        {stage === 'feed-forward' && (
          <ResidualMLPDiagram
            trace={trace}
            operation={currentStep.operation}
            onSelectOperation={(entityId) => store.getState().selectEntity(entityId)}
          />
        )}
        {stage === 'output' && samplingExperiment && (
          <OutputDiagram
            trace={trace}
            operation={currentStep.operation}
            experiment={samplingExperiment}
            selectedEntityId={selectedEntityId}
            onSelectOutput={(isSampled) =>
              store
                .getState()
                .selectEntity(isSampled ? 'output-token:12' : 'operation:output')
            }
          />
        )}
      </div>

      {stage === 'attention' && <AttentionProof trace={trace} />}
      {stage === 'feed-forward' && <ResidualMLPProof trace={trace} />}

      <p className="calculation-summary trace2d-summary" aria-live="polite">
        <strong>当前观察：</strong>{summary}
      </p>

      <section className="trace2d-tensors" aria-label="当前步骤张量">
        <div>
          <h3>输入</h3>
          {tensors.inputs.length > 0 ? (
            tensors.inputs.map((tensor) => <TensorCard key={tensor.id} tensor={tensor} />)
          ) : (
            <p className="trace2d-tensors__empty">原始文本：{trace.input.text}</p>
          )}
        </div>
        <span className="trace2d-tensors__arrow" aria-hidden="true">→</span>
        <div>
          <h3>输出</h3>
          {tensors.outputs.length > 0 ? (
            displayedOutputTensors.map((tensor) => <TensorCard key={tensor.id} tensor={tensor} />)
          ) : (
            <p className="trace2d-tensors__empty">
              采样结果：{samplingExperiment?.sampledCandidate?.token ?? trace.output.sampledToken}
            </p>
          )}
        </div>
      </section>
    </section>
  )
}
