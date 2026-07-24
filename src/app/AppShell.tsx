import { lazy, Suspense, type KeyboardEvent } from 'react'
import {
  BookOpenText,
  Box,
  Braces,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Compass,
  Layers3,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Workflow,
} from 'lucide-react'
import { useStore } from 'zustand'
import { coreLesson } from '../content/lessons/core-lesson'
import {
  findLessonStepContext,
  flattenLessonSteps,
  getAdjacentLessonStep,
  navigateToLessonStep,
} from '../features/lesson-panel/lesson-navigation'
import { Trace2DPanel } from '../features/trace-2d/Trace2DPanel'
import {
  selectCanGoNext,
  selectCanGoPrevious,
  selectCurrentStep,
} from '../store/explorer-selectors'
import {
  explorerStore,
  type ExplorerStoreApi,
  type ExplorerView,
} from '../store/explorer-store'
import './AppShell.css'

type MobileView = ExplorerView

const Scene3DPanel = lazy(() =>
  import('../features/scene-3d/Scene3DPanel').then((module) => ({
    default: module.Scene3DPanel,
  })),
)

function Scene3DLoading({ isActive }: { readonly isActive: boolean }) {
  return (
    <section
      id="view-panel-3d"
      className={`workspace-panel scene-panel scene3d-panel${isActive ? ' is-mobile-active' : ''}`}
      role="tabpanel"
      aria-labelledby="mobile-view-3d"
    >
      <div className="scene3d-loading" role="status">
        <strong>正在加载三维模型空间</strong>
        <p>课程与二维计算仍可继续使用。</p>
      </div>
    </section>
  )
}

const traceStatusLabels = {
  idle: '等待案例',
  loading: '正在准备案例',
  ready: '预置案例已就绪',
  error: '案例不可用',
} as const

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
  store,
  isActive,
}: {
  store: ExplorerStoreApi
  isActive: boolean
}) {
  const trace = useStore(store, (state) => state.trace)
  const traceStatus = useStore(store, (state) => state.traceStatus)
  const currentStepIndex = useStore(store, (state) => state.currentStepIndex)
  const traceStepId = trace?.steps[currentStepIndex]?.id ?? null
  const allLessonSteps = flattenLessonSteps(coreLesson)
  const context =
    findLessonStepContext(coreLesson, traceStepId) ??
    findLessonStepContext(coreLesson, allLessonSteps[0].action.traceStepId)!
  const previousStep = getAdjacentLessonStep(coreLesson, context.step.id, -1)
  const nextStep = getAdjacentLessonStep(coreLesson, context.step.id, 1)
  const canNavigate = traceStatus === 'ready'

  const navigate = (lessonStepId: string) => {
    navigateToLessonStep(store, coreLesson, lessonStepId)
    requestAnimationFrame(() => {
      document.getElementById('lesson-heading')?.focus()
    })
  }

  return (
    <article
      id="view-panel-lesson"
      className={`workspace-panel lesson-panel${isActive ? ' is-mobile-active' : ''}`}
      role="tabpanel"
      aria-labelledby="mobile-view-lesson"
    >
      <header className="lesson-panel__header">
        <div>
          <p className="eyebrow eyebrow--ink">
            第 {String(context.chapterIndex + 1).padStart(2, '0')} 章 ·{' '}
            {context.chapter.title}
          </p>
          <p
            className="lesson-panel__index"
            aria-label={`第 ${context.chapterIndex + 1} 章，共 ${coreLesson.chapters.length} 章`}
          >
            {String(context.chapterIndex + 1).padStart(2, '0')}{' '}
            <span>/ {String(coreLesson.chapters.length).padStart(2, '0')}</span>
          </p>
        </div>
        <span className="lesson-panel__status">
          <span aria-hidden="true" /> 课程项 {context.lessonStepIndex + 1} /{' '}
          {context.totalLessonSteps}
        </span>
      </header>

      <div className="lesson-panel__body">
        <div className="lesson-panel__title-group">
          <p className="kicker">{context.step.kicker}</p>
          <h1 id="lesson-heading" tabIndex={-1}>{context.step.title}</h1>
          <p className="lesson-panel__lead">{context.step.plainExplanation}</p>
        </div>

        <ol className="chapter-track" aria-label="课程章节进度">
          {coreLesson.chapters.map((chapter, chapterIndex) => {
            const isCurrent = chapter.id === context.chapter.id
            const firstStep = chapter.steps[0]
            return (
              <li
                key={chapter.id}
                className={`chapter-track__item${isCurrent ? ' is-current' : ''}`}
              >
                <button
                  className="chapter-track__button"
                  type="button"
                  disabled={!canNavigate}
                  aria-label={`跳到${chapter.shortTitle}章节`}
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={() => navigate(firstStep.id)}
                >
                  <span className="chapter-track__number">
                    {String(chapterIndex + 1).padStart(2, '0')}
                  </span>
                  <span>
                    <strong>{chapter.shortTitle}</strong>
                    <small>{chapter.summary}</small>
                  </span>
                </button>
              </li>
            )
          })}
        </ol>

        <details className="deep-dive" key={context.step.id}>
          <summary>
            <Braces size={17} aria-hidden="true" />
            {context.step.deepDive.title}
          </summary>
          <div className="deep-dive__content">
            <p>{context.step.deepDive.explanation}</p>
            {context.step.deepDive.tensorShape && (
              <section className="deep-dive__block" aria-label="张量形状">
                <span className="deep-dive__label">张量形状</span>
                <code>{context.step.deepDive.tensorShape.expression}</code>
                <p>{context.step.deepDive.tensorShape.explanation}</p>
              </section>
            )}
            {context.step.deepDive.formula && (
              <section className="deep-dive__block" aria-label="公式解释">
                <span className="deep-dive__label">公式</span>
                <code>{context.step.deepDive.formula.expression}</code>
                <dl className="formula-symbols">
                  {context.step.deepDive.formula.symbols.map((symbol) => (
                    <div key={symbol.symbol}>
                      <dt>{symbol.symbol}</dt>
                      <dd>{symbol.meaning}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
            {context.step.deepDive.pseudocode && (
              <section className="deep-dive__block" aria-label="教学伪代码">
                <span className="deep-dive__label">教学伪代码</span>
                <pre><code>{context.step.deepDive.pseudocode.join('\n')}</code></pre>
              </section>
            )}
          </div>
        </details>
      </div>

      <div className="lesson-panel__actions">
        <button
          className="secondary-action"
          type="button"
          disabled={!canNavigate || !previousStep}
          onClick={() => previousStep && navigate(previousStep.id)}
        >
          <ChevronLeft size={18} aria-hidden="true" />
          上一项
        </button>
        <button
          className="primary-action"
          type="button"
          disabled={!canNavigate || !nextStep}
          onClick={() => nextStep && navigate(nextStep.id)}
        >
          {nextStep ? '下一项' : '课程已完成'}
          <ChevronRight size={18} aria-hidden="true" />
        </button>
        <span className="keyboard-hint">
          使用前后按钮，时间线会同步移动
        </span>
      </div>
    </article>
  )
}

function Timeline({ store }: { store: ExplorerStoreApi }) {
  const trace = useStore(store, (state) => state.trace)
  const traceStatus = useStore(store, (state) => state.traceStatus)
  const currentStepIndex = useStore(store, (state) => state.currentStepIndex)
  const currentStep = useStore(store, selectCurrentStep)
  const canGoPrevious = useStore(store, selectCanGoPrevious)
  const canGoNext = useStore(store, selectCanGoNext)
  const playback = useStore(store, (state) => state.playback)

  const totalSteps = trace?.steps.length ?? 0
  const visibleStep = totalSteps > 0 ? currentStepIndex + 1 : 0
  const progress = totalSteps > 0 ? (visibleStep / totalSteps) * 100 : 0
  const isPlaying = playback === 'playing'
  const phaseLabel =
    currentStep?.title ??
    (traceStatus === 'error' ? '模型轨迹加载失败' : '正在准备模型轨迹')

  return (
    <footer className="timeline" aria-label="计算时间轴">
      <div className="timeline__controls">
        <button
          type="button"
          disabled={!canGoPrevious}
          aria-label="上一步"
          onClick={() => store.getState().previousStep()}
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <button
          className="timeline__play"
          type="button"
          disabled={!isPlaying && !canGoNext}
          aria-label={isPlaying ? '暂停计算过程' : '播放计算过程'}
          onClick={() => {
            const state = store.getState()
            if (state.playback === 'playing') state.pausePlayback()
            else state.startPlayback()
          }}
        >
          {isPlaying ? (
            <Pause size={17} fill="currentColor" aria-hidden="true" />
          ) : (
            <Play size={17} fill="currentColor" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          disabled={!canGoNext}
          aria-label="下一步"
          onClick={() => store.getState().nextStep()}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="timeline__track-group">
        <span className="timeline__step">
          步骤 {String(visibleStep).padStart(2, '0')} /{' '}
          {String(totalSteps).padStart(2, '0')}
        </span>
        <div
          className="timeline__track"
          role="progressbar"
          aria-label="模型计算步骤进度"
          aria-valuemin={0}
          aria-valuemax={Math.max(totalSteps, 1)}
          aria-valuenow={visibleStep}
          aria-valuetext={
            totalSteps > 0 ? `第 ${visibleStep} 步，共 ${totalSteps} 步` : '模型轨迹尚未就绪'
          }
        >
          <span className="timeline__fill" style={{ width: `${progress}%` }} />
          {trace?.steps.map((step, index) => (
            <span
              key={step.id}
              className={`timeline__marker${index <= currentStepIndex ? ' is-reached' : ''}${index === currentStepIndex ? ' is-current' : ''}`}
              style={{ insetInlineStart: `${((index + 1) / totalSteps) * 100}%` }}
              aria-hidden="true"
            />
          ))}
        </div>
        <span className="timeline__phase" aria-live="polite">{phaseLabel}</span>
      </div>

      <button
        className="timeline__reset"
        type="button"
        disabled={!canGoPrevious && !isPlaying}
        onClick={() => store.getState().resetPlayback()}
      >
        <RotateCcw size={16} aria-hidden="true" />
        重置
      </button>
    </footer>
  )
}

export function AppShell({ store = explorerStore }: { store?: ExplorerStoreApi }) {
  const learningMode = useStore(store, (state) => state.mode)
  const mobileView = useStore(store, (state) => state.view)
  const traceStatus = useStore(store, (state) => state.traceStatus)
  const setLearningMode = store.getState().setMode
  const setMobileView = store.getState().setView

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
          <span className="source-badge" data-status={traceStatus}>
            <span aria-hidden="true" /> {traceStatusLabels[traceStatus]}
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
          store={store}
          isActive={mobileView === 'lesson'}
        />
        <Trace2DPanel store={store} isActive={mobileView === '2d'} />
        <Suspense fallback={<Scene3DLoading isActive={mobileView === '3d'} />}>
          <Scene3DPanel store={store} isActive={mobileView === '3d'} />
        </Suspense>
      </main>

      <Timeline store={store} />
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
