import { format, max, scaleBand, scaleLinear } from 'd3'
import { type KeyboardEvent } from 'react'
import { useStore } from 'zustand'
import type { ModelTrace, TensorSummary } from '../../domain/trace/trace'
import { selectCurrentStep } from '../../store/explorer-selectors'
import type { ExplorerStoreApi } from '../../store/explorer-store'
import {
  createStepSummary,
  formatTensorShape,
  getAttentionCells,
  getEmbeddingSample,
  getTrace2DStage,
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
  showEmbedding,
  onSelectToken,
}: {
  trace: ModelTrace
  selectedTokenIndex: number | null
  showEmbedding: boolean
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
        输入句子包含六个可选择的 Token。每个 Token 显示文本、ID，以及当前教学模型的八维向量样本。
      </desc>
      <text className="trace2d-svg__axis-title" x="42" y="42">输入序列 · 点击 Token 查看向量</text>
      {indexes.map((index) => {
        const token = trace.input.tokens[index].trim() || '空格'
        const embedding = getEmbeddingSample(trace, index)
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
            {showEmbedding && (
              <g transform="translate(0 96)">
                {embedding.map((value, dimension) => {
                  const height = Math.max(3, Math.abs(value) * 90)
                  return (
                    <rect
                      key={dimension}
                      className={`trace2d-vector-bar${value < 0 ? ' is-negative' : ''}`}
                      x={dimension * (bandwidth / embedding.length) + 1}
                      y={52 - height}
                      width={Math.max(2, bandwidth / embedding.length - 2)}
                      height={height}
                      rx="1"
                    >
                      <title>维度 {dimension + 1}：{numberFormat(value)}</title>
                    </rect>
                  )
                })}
                <line className="trace2d-vector-zero" x1="0" x2={bandwidth} y1="52" y2="52" />
              </g>
            )}
          </g>
        )
      })}
      <path className="trace2d-flow" d="M42 248H678" />
      <text className="trace2d-svg__caption" x="42" y="286">
        {showEmbedding
          ? `选中 Token 的向量形状：[1, ${trace.input.tokens.length}, ${trace.model.hiddenSize}]`
          : 'Tokenizer 输出稳定的词表 ID；ID 本身不表达语义距离。'}
      </text>
    </svg>
  )
}

function QKVDiagram({ trace, onSelectOperation }: { trace: ModelTrace; onSelectOperation: () => void }) {
  const headSize = trace.model.hiddenSize / trace.model.heads
  const paths = [
    { channel: 'Q', label: '查询 · 我在找什么', className: 'is-q', y: 78 },
    { channel: 'K', label: '索引 · 我有什么特征', className: 'is-k', y: 160 },
    { channel: 'V', label: '内容 · 我要贡献什么', className: 'is-v', y: 242 },
  ]
  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img" aria-labelledby="qkv-title qkv-desc">
      <title id="qkv-title">Q、K、V 投影二维图</title>
      <desc id="qkv-desc">六个八维 Token 向量分别投影为两组四维的查询、索引和内容向量。</desc>
      <g className="trace2d-source" transform="translate(42 118)">
        <rect width="174" height="120" rx="9" />
        <text x="87" y="38" textAnchor="middle">隐藏向量 X</text>
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
            <text className="trace2d-svg__small" x="66" y="24">{path.label}</text>
            <text className="trace2d-svg__small" x="66" y="44">[1, {trace.model.heads}, {trace.input.tokens.length}, {headSize}]</text>
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
  const position = scaleBand<number>().domain(indexes).range([92, 338]).paddingInner(0.08)
  const opacity = scaleLinear().domain([0, max(cells, (cell) => cell.value) ?? 1]).range([0.14, 1])
  const size = position.bandwidth()
  const selected = selectedTokenIndex

  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img" aria-labelledby="attention-title attention-desc">
      <title id="attention-title">Attention Head {headIndex + 1} 权重矩阵</title>
      <desc id="attention-desc">行表示正在查询的 Token，列表示被读取的 Token；未来位置使用交叉图案遮挡。</desc>
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
          aria-label={`${trace.input.tokens[cell.row].trim()} 读取 ${trace.input.tokens[cell.column].trim()}：${cell.masked ? '被因果掩码遮挡' : `权重 ${numberFormat(cell.value)}`}`}
          onClick={() => onSelectToken(cell.row)}
          onKeyDown={(event) => activateWithKeyboard(event, () => onSelectToken(cell.row))}
        >
          <rect
            className={`trace2d-matrix-cell${selected === cell.row ? ' is-row-selected' : ''}`}
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
      <g className="trace2d-matrix-note" transform="translate(410 108)">
        <text className="trace2d-svg__axis-title">Head {headIndex + 1} · 因果注意力</text>
        <text y="38">颜色越深，当前行从对应列</text>
        <text y="60">读取的信息比例越高。</text>
        <rect y="86" width="22" height="22" fill="url(#masked-cell-pattern)" />
        <text x="34" y="102">未来位置：不可读取</text>
        <rect y="124" width="22" height="22" fill="var(--amber-400)" />
        <text x="34" y="140">已有位置：权重 0～1</text>
        <text className="trace2d-svg__small" y="184">因果掩码：未来位置显示 ×</text>
      </g>
    </svg>
  )
}

function OutputDiagram({
  trace,
  selectedEntityId,
  onSelectOutput,
}: {
  trace: ModelTrace
  selectedEntityId: string | null
  onSelectOutput: (isSampled: boolean) => void
}) {
  const candidates = trace.output.candidates
  const y = scaleBand<string>()
    .domain(candidates.map((candidate) => `${candidate.tokenId}`))
    .range([52, 320])
    .padding(0.22)
  const width = scaleLinear()
    .domain([0, max(candidates, (candidate) => candidate.probability) ?? 1])
    .range([0, 420])
  return (
    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} role="img" aria-labelledby="output-title output-desc">
      <title id="output-title">输出候选概率图</title>
      <desc id="output-desc">展示教学轨迹概率最高的五个候选 Token，以及最终采样结果。</desc>
      <text className="trace2d-svg__axis-title" x="42" y="30">Top 5 候选 · 概率</text>
      {candidates.map((candidate, index) => {
        const rowY = y(`${candidate.tokenId}`) ?? 0
        const isSampled = candidate.tokenId === trace.output.sampledTokenId
        const candidateLabel = candidate.token.trim() || '空格'
        return (
          <g
            key={candidate.tokenId}
            className={`trace2d-candidate${isSampled ? ' is-sampled' : ''}${selectedEntityId === 'output-token:12' && isSampled ? ' is-selected' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`${candidateLabel}，概率 ${(candidate.probability * 100).toFixed(1)}%，Logit ${candidate.logit}`}
            onClick={() => onSelectOutput(isSampled)}
            onKeyDown={(event) =>
              activateWithKeyboard(event, () => onSelectOutput(isSampled))
            }
          >
            <text className="trace2d-candidate__rank" x="42" y={rowY + y.bandwidth() / 2 + 5}>{String(index + 1).padStart(2, '0')}</text>
            <text className="trace2d-candidate__token" x="82" y={rowY + y.bandwidth() / 2 + 5}>{candidateLabel}</text>
            <rect className="trace2d-candidate__track" x="190" y={rowY} width="420" height={y.bandwidth()} rx="5" />
            <rect className="trace2d-candidate__bar" x="190" y={rowY} width={width(candidate.probability)} height={y.bandwidth()} rx="5" />
            <text className="trace2d-candidate__value" x="622" y={rowY + y.bandwidth() / 2 + 5}>{(candidate.probability * 100).toFixed(1)}%</text>
            {isSampled && <text className="trace2d-candidate__sampled" x="674" y={rowY + y.bandwidth() / 2 + 5} textAnchor="end">已采样</text>}
          </g>
        )
      })}
    </svg>
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
  const summary = createStepSummary(trace, currentStep, activeHead)

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
            showEmbedding={currentStep.operation === 'embed'}
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
        {stage === 'output' && (
          <OutputDiagram
            trace={trace}
            selectedEntityId={selectedEntityId}
            onSelectOutput={(isSampled) =>
              store
                .getState()
                .selectEntity(isSampled ? 'output-token:12' : 'operation:output')
            }
          />
        )}
      </div>

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
            tensors.outputs.map((tensor) => <TensorCard key={tensor.id} tensor={tensor} />)
          ) : (
            <p className="trace2d-tensors__empty">采样结果：{trace.output.sampledToken}</p>
          )}
        </div>
      </section>
    </section>
  )
}
