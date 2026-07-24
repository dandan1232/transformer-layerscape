import { type KeyboardEvent, useState } from 'react'
import {
  BookOpenText,
  Box,
  Braces,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Compass,
  Focus,
  Layers3,
  Play,
  RotateCcw,
  Settings2,
  Workflow,
} from 'lucide-react'
import './AppShell.css'

type LearningMode = 'guided' | 'explore'
type MobileView = 'lesson' | '2d' | '3d'

const mobileViews: ReadonlyArray<{
  id: MobileView
  label: string
  icon: typeof BookOpenText
}> = [
  { id: 'lesson', label: '课程', icon: BookOpenText },
  { id: '2d', label: '二维计算', icon: Workflow },
  { id: '3d', label: '三维空间', icon: Box },
]

function BrandMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 40 40"
      role="img"
      aria-label="LayerScape 层境"
    >
      <circle cx="20" cy="20" r="3.5" className="brand-mark__core" />
      <ellipse cx="20" cy="20" rx="16" ry="7.5" />
      <ellipse cx="20" cy="20" rx="16" ry="7.5" transform="rotate(60 20 20)" />
      <ellipse cx="20" cy="20" rx="16" ry="7.5" transform="rotate(120 20 20)" />
      <circle cx="35" cy="18" r="2" className="brand-mark__node" />
    </svg>
  )
}

function LessonPanel({
  isActive,
  onStartObservation,
}: {
  isActive: boolean
  onStartObservation: () => void
}) {
  return (
    <article
      id="view-panel-lesson"
      className={`workspace-panel lesson-panel${isActive ? ' is-mobile-active' : ''}`}
      role="tabpanel"
      aria-labelledby="mobile-view-lesson"
    >
      <header className="lesson-panel__header">
        <div>
          <p className="eyebrow eyebrow--ink">第 01 章 · 输入</p>
          <p className="lesson-panel__index" aria-label="第 1 步，共 12 步">
            01 <span>/ 12</span>
          </p>
        </div>
        <span className="lesson-panel__status">
          <span aria-hidden="true" /> 预置轨迹
        </span>
      </header>

      <div className="lesson-panel__body">
        <div className="lesson-panel__title-group">
          <p className="kicker">TOKENIZATION</p>
          <h1 id="lesson-heading">让文字成为模型能读懂的坐标</h1>
          <p className="lesson-panel__lead">
            模型不会直接阅读句子。它先把文本切成 Token，再为每个 Token
            找到一个稳定的数字编号。
          </p>
        </div>

        <ol className="chapter-track" aria-label="课程章节进度">
          <li className="chapter-track__item is-current">
            <span className="chapter-track__number">01</span>
            <span>
              <strong>Token</strong>
              <small>文字如何进入模型</small>
            </span>
          </li>
          <li className="chapter-track__item">
            <span className="chapter-track__number">02</span>
            <span>
              <strong>Attention</strong>
              <small>信息如何互相寻找</small>
            </span>
          </li>
          <li className="chapter-track__item">
            <span className="chapter-track__number">03</span>
            <span>
              <strong>Output</strong>
              <small>下一个词如何被选中</small>
            </span>
          </li>
        </ol>

        <details className="deep-dive">
          <summary>
            <Braces size={17} aria-hidden="true" />
            深入理解：张量形状
          </summary>
          <div className="deep-dive__content">
            <code>[batch, token, hidden]</code>
            <p>当前案例会把 6 个 Token 映射为 6 组隐藏向量。</p>
          </div>
        </details>
      </div>

      <div className="lesson-panel__actions">
        <button className="primary-action" type="button" onClick={onStartObservation}>
          开始观察
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <span className="keyboard-hint">
          <kbd>→</kbd> 下一步
        </span>
      </div>
    </article>
  )
}

function CalculationPanel({ isActive }: { isActive: boolean }) {
  return (
    <section
      id="view-panel-2d"
      className={`workspace-panel calculation-panel${isActive ? ' is-mobile-active' : ''}`}
      role="tabpanel"
      aria-labelledby="mobile-view-2d"
    >
      <header className="panel-heading panel-heading--light">
        <div>
          <p className="eyebrow eyebrow--ink">二维计算台</p>
          <h2 id="calculation-heading" tabIndex={-1}>Token → Attention</h2>
        </div>
        <span className="tensor-shape">[1, 6, 64]</span>
      </header>

      <div className="calculation-figure">
        <svg
          viewBox="0 0 640 220"
          role="img"
          aria-labelledby="trace-preview-title trace-preview-description"
        >
          <title id="trace-preview-title">Token 到注意力计算的二维预览</title>
          <desc id="trace-preview-description">
            六个 Token 向量经过 Q、K、V 三个投影，进入注意力矩阵。
          </desc>
          <g className="token-row">
            {['The', 'sky', 'is', 'deep', 'and', 'blue'].map((token, index) => (
              <g key={token} transform={`translate(${18 + index * 63} 18)`}>
                <rect width="52" height="34" rx="5" />
                <text x="26" y="22" textAnchor="middle">
                  {token}
                </text>
              </g>
            ))}
          </g>
          <path className="flow-line" d="M207 62v24H96v24" />
          <path className="flow-line" d="M207 86v24" />
          <path className="flow-line" d="M207 86h111v24" />
          <g className="projection-node projection-node--q" transform="translate(62 110)">
            <rect width="68" height="40" rx="5" />
            <text x="34" y="25" textAnchor="middle">Q · 查询</text>
          </g>
          <g className="projection-node projection-node--k" transform="translate(173 110)">
            <rect width="68" height="40" rx="5" />
            <text x="34" y="25" textAnchor="middle">K · 索引</text>
          </g>
          <g className="projection-node projection-node--v" transform="translate(284 110)">
            <rect width="68" height="40" rx="5" />
            <text x="34" y="25" textAnchor="middle">V · 内容</text>
          </g>
          <path className="flow-line flow-line--active" d="M96 158v22h241" />
          <path className="flow-line" d="M207 150v30" />
          <path className="flow-line" d="M318 150v30" />
          <g className="attention-node" transform="translate(386 109)">
            <rect width="230" height="86" rx="8" />
            <text x="20" y="28">Masked Self-Attention</text>
            <g transform="translate(20 42)">
              {[0, 1, 2, 3, 4, 5].map((row) =>
                [0, 1, 2, 3, 4, 5].map((column) => (
                  <rect
                    key={`${row}-${column}`}
                    x={column * 24}
                    y={row * 6}
                    width="19"
                    height="4"
                    rx="2"
                    className={column > row ? 'is-masked' : `weight-${(row + column) % 3}`}
                  />
                )),
              )}
            </g>
          </g>
        </svg>
      </div>

      <p className="calculation-summary">
        当前观察：每个 Token 先生成 <strong>查询、索引和内容</strong> 三种向量。
      </p>
    </section>
  )
}

function ScenePanel({ isActive }: { isActive: boolean }) {
  return (
    <section
      id="view-panel-3d"
      className={`workspace-panel scene-panel${isActive ? ' is-mobile-active' : ''}`}
      role="tabpanel"
      aria-labelledby="mobile-view-3d"
    >
      <header className="scene-panel__header">
        <div>
          <p className="eyebrow">模型空间 · 教学模式</p>
          <h2 id="scene-heading">Transformer 微型观测场</h2>
        </div>
        <button
          className="scene-control"
          type="button"
          disabled
          title="三维相机接入后开放"
        >
          <Focus size={17} aria-hidden="true" />
          返回讲解视角
        </button>
      </header>

      <div className="model-space" aria-hidden="true">
        <span className="model-space__axis model-space__axis--x">TOKEN AXIS</span>
        <span className="model-space__axis model-space__axis--y">LAYER 01</span>
        <svg viewBox="0 0 900 600" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="layer-plane" x1="0" x2="1">
              <stop offset="0" stopColor="var(--void-800)" stopOpacity="0.25" />
              <stop offset="1" stopColor="var(--amber-400)" stopOpacity="0.12" />
            </linearGradient>
          </defs>
          <path className="scene-plane" d="M126 421 575 174 813 311 359 555Z" />
          <path className="scene-plane scene-plane--upper" d="M126 334 575 87 813 224 359 468Z" />
          {[0, 1, 2, 3, 4, 5].map((index) => {
            const x = 170 + index * 82
            const y = 390 - index * 45
            return (
              <g key={index}>
                <path className="scene-link" d={`M${x} ${y} 700 272`} />
                <circle className="scene-node__halo" cx={x} cy={y} r="19" />
                <circle className="scene-node" cx={x} cy={y} r="8" />
                <text className="scene-node__label" x={x} y={y + 32} textAnchor="middle">
                  T{index + 1}
                </text>
              </g>
            )
          })}
          <g className="attention-core" transform="translate(700 272)">
            <circle r="70" />
            <circle r="45" />
            <circle r="15" />
            <text y="106" textAnchor="middle">ATTENTION CORE</text>
          </g>
          <path className="output-link" d="M700 272 820 204" />
          <g className="output-node" transform="translate(820 204)">
            <circle r="22" />
            <text y="43" textAnchor="middle">NEXT</text>
          </g>
        </svg>
      </div>

      <div className="scene-readout">
        <div>
          <span>当前焦点</span>
          <strong>Token Embedding</strong>
        </div>
        <div>
          <span>结构规模</span>
          <strong>1 Block · 2 Heads</strong>
        </div>
      </div>

      <ul className="vector-legend" aria-label="向量颜色说明">
        <li className="vector-legend__q"><span>Q</span> 查询</li>
        <li className="vector-legend__k"><span>K</span> 索引</li>
        <li className="vector-legend__v"><span>V</span> 内容</li>
      </ul>

      <p className="scene-description">
        三维场景占位预览：后续将使用可旋转、可缩放的真实 WebGL 场景替换。
      </p>
    </section>
  )
}

function Timeline() {
  return (
    <footer className="timeline" aria-label="计算时间轴">
      <div className="timeline__controls">
        <button type="button" disabled aria-label="上一步">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button className="timeline__play" type="button" disabled aria-label="播放计算过程">
          <Play size={17} fill="currentColor" aria-hidden="true" />
        </button>
        <button type="button" disabled aria-label="下一步">
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="timeline__track-group">
        <span className="timeline__step">步骤 01 / 12</span>
        <div
          className="timeline__track"
          role="progressbar"
          aria-label="课程步骤进度"
          aria-valuemin={1}
          aria-valuemax={12}
          aria-valuenow={1}
        >
          <span className="timeline__fill" />
          <span className="timeline__marker is-current" />
          <span className="timeline__marker" />
          <span className="timeline__marker" />
        </div>
        <span className="timeline__phase">Tokenization</span>
      </div>

      <button className="timeline__reset" type="button" disabled>
        <RotateCcw size={16} aria-hidden="true" />
        重置
      </button>
    </footer>
  )
}

export function AppShell() {
  const [learningMode, setLearningMode] = useState<LearningMode>('guided')
  const [mobileView, setMobileView] = useState<MobileView>('lesson')

  const moveMobileFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    currentView: MobileView,
  ) => {
    const currentIndex = mobileViews.findIndex((view) => view.id === currentView)
    let nextIndex = currentIndex

    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % mobileViews.length
    if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + mobileViews.length) % mobileViews.length
    }
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = mobileViews.length - 1
    if (nextIndex === currentIndex) return

    event.preventDefault()
    const nextView = mobileViews[nextIndex].id
    setMobileView(nextView)
    requestAnimationFrame(() => {
      document.getElementById(`mobile-view-${nextView}`)?.focus()
    })
  }

  const startObservation = () => {
    setMobileView('2d')
    requestAnimationFrame(() => {
      document.getElementById('calculation-heading')?.focus()
    })
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>

      <header className="topbar">
        <a className="brand" href="#main-content" aria-label="LayerScape 层境首页">
          <BrandMark />
          <span className="brand__wordmark">
            <strong>LayerScape</strong>
            <small>TRANSFORMER 层境</small>
          </span>
        </a>

        <div className="mode-switch" role="group" aria-label="学习模式">
          <button
            type="button"
            aria-pressed={learningMode === 'guided'}
            onClick={() => setLearningMode('guided')}
          >
            <Compass size={16} aria-hidden="true" />
            引导学习
          </button>
          <button
            type="button"
            aria-pressed={learningMode === 'explore'}
            onClick={() => setLearningMode('explore')}
          >
            <Layers3 size={16} aria-hidden="true" />
            自由探索
          </button>
        </div>

        <div className="topbar__status">
          <span className="source-badge">
            <span aria-hidden="true" /> 预置案例
          </span>
          <span className="capability-badge">
            <GaugeIcon /> 完整 3D
          </span>
        </div>

        <div className="topbar__tools">
          <button type="button" disabled aria-label="打开帮助" title="帮助中心即将开放">
            <CircleHelp size={19} aria-hidden="true" />
          </button>
          <button type="button" disabled aria-label="打开设置" title="设置即将开放">
            <Settings2 size={19} aria-hidden="true" />
          </button>
        </div>
      </header>

      <nav className="mobile-view-tabs" aria-label="学习视图" role="tablist">
        {mobileViews.map(({ id, label, icon: Icon }) => (
          <button
            id={`mobile-view-${id}`}
            key={id}
            type="button"
            role="tab"
            aria-selected={mobileView === id}
            aria-controls={`view-panel-${id}`}
            tabIndex={mobileView === id ? 0 : -1}
            onClick={() => setMobileView(id)}
            onKeyDown={(event) => moveMobileFocus(event, id)}
          >
            <Icon size={17} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      <main id="main-content" className="workspace" tabIndex={-1}>
        <LessonPanel
          isActive={mobileView === 'lesson'}
          onStartObservation={startObservation}
        />
        <CalculationPanel isActive={mobileView === '2d'} />
        <ScenePanel isActive={mobileView === '3d'} />
      </main>

      <Timeline />
    </div>
  )
}

function GaugeIcon() {
  return (
    <span className="gauge-icon" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  )
}
