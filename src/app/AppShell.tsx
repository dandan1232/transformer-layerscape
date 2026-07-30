import { lazy, Suspense, useEffect, type KeyboardEvent } from 'react'
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
import { FeatureErrorBoundary } from '../components/FeatureErrorBoundary'
import { coreLesson } from '../content/lessons/core-lesson'
import {
  findLessonStepContext,
  flattenLessonSteps,
  getAdjacentLessonStep,
  navigateToLessonStep,
} from '../features/lesson-panel/lesson-navigation'
import { Trace2DPanel } from '../features/trace-2d/Trace2DPanel'
import { RealModelDownload } from '../features/real-model/RealModelDownload'
import { useDeviceCapabilities } from '../platform/use-device-capabilities'
import {
  selectCanGoNext,
  selectCanGoPrevious,
  selectCurrentStep,
  selectSelectedEntity,
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

function ExploreDock({ store }: { store: ExplorerStoreApi }) {
  const mode = useStore(store, (state) => state.mode)
  const trace = useStore(store, (state) => state.trace)
  const currentStepIndex = useStore(store, (state) => state.currentStepIndex)
  const guidedStepIndex = useStore(store, (state) => state.guidedStepIndex)
  const selectedTokenIndex = useStore(store, (state) => state.selectedTokenIndex)
  const selectedLayerIndex = useStore(store, (state) => state.selectedLayerIndex)
  const selectedHeadIndex = useStore(store, (state) => state.selectedHeadIndex)
  const selectedEntity = useStore(store, selectSelectedEntity)

  if (mode !== 'explore') return null

  const guidedStep = trace?.steps[guidedStepIndex]
  const currentStep = trace?.steps[currentStepIndex]

  return (
    <aside className="explore-dock" aria-label="自由探索台">
      <header className="explore-dock__heading">
        <div>
          <strong>自由探索台</strong>
          <span>
            课程锚点 {trace ? String(guidedStepIndex + 1).padStart(2, '0') : '--'}
            {guidedStep ? ` · ${guidedStep.title}` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            store.getState().setMode('guided')
            requestAnimationFrame(() => {
              document.getElementById('mode-guided')?.focus()
            })
          }}
        >
          <Compass size={16} aria-hidden="true" />
          回到课程当前位置
        </button>
      </header>

      <div className="explore-dock__controls">
        <label>
          <span>算子</span>
          <select
            value={trace ? currentStepIndex : ''}
            disabled={!trace}
            aria-label="选择算子"
            onChange={(event) =>
              store.getState().goToStep(Number(event.currentTarget.value))
            }
          >
            {!trace && <option value="">等待案例</option>}
            {trace?.steps.map((step, index) => (
              <option key={step.id} value={index}>
                {String(index + 1).padStart(2, '0')} · {step.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Token</span>
          <select
            value={selectedTokenIndex ?? ''}
            disabled={!trace}
            aria-label="选择 Token"
            onChange={(event) =>
              store.getState().selectToken(Number(event.currentTarget.value))
            }
          >
            <option value="">选择 Token</option>
            {trace?.input.tokens.map((token, index) => (
              <option key={`${token}-${index}`} value={index}>
                {index + 1} · {token.trim() || '空格'}
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend>Block</legend>
          <div>
            {Array.from({ length: trace?.model.layers ?? 0 }, (_, index) => (
              <button
                key={index}
                type="button"
                aria-pressed={selectedLayerIndex === index}
                onClick={() => store.getState().selectLayer(index)}
              >
                B{index + 1}
              </button>
            ))}
            {!trace && <button type="button" disabled>B–</button>}
          </div>
        </fieldset>

        <fieldset>
          <legend>Head</legend>
          <div>
            {Array.from({ length: trace?.model.heads ?? 0 }, (_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`探索 Attention Head ${index + 1}`}
                aria-pressed={selectedHeadIndex === index}
                onClick={() => store.getState().selectHead(index)}
              >
                H{index + 1}
              </button>
            ))}
            {!trace && <button type="button" disabled>H–</button>}
          </div>
        </fieldset>
      </div>

      <p className="explore-dock__focus" aria-live="polite">
        <span>当前联动</span>
        <strong>{selectedEntity?.label ?? currentStep?.title ?? '等待案例'}</strong>
      </p>
    </aside>
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
  const selectedEntity = useStore(store, selectSelectedEntity)
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
          {selectedEntity && (
            <aside className="lesson-focus" aria-label="当前联动焦点" aria-live="polite">
              <span>当前联动焦点</span>
              <strong>{selectedEntity.label}</strong>
              <p>
                {selectedEntity.description ??
                  '该实体已在二维与三维视图中同步选中。'}
              </p>
            </aside>
          )}
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
  const progress =
    totalSteps > 1 ? (currentStepIndex / (totalSteps - 1)) * 100 : totalSteps > 0 ? 100 : 0
  const isPlaying = playback === 'playing'
  const lessonContext = findLessonStepContext(coreLesson, currentStep?.id ?? null)
  const chapterStartTraceStepId = lessonContext?.chapter.steps[0]?.action.traceStepId
  const chapterStartIndex = trace
    ? Math.max(
        0,
        trace.steps.findIndex((step) => step.id === chapterStartTraceStepId),
      )
    : 0
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
        <div className="timeline__track">
          <span className="timeline__fill" style={{ width: `${progress}%` }} />
          {trace?.steps.map((step, index) => (
            <span
              key={step.id}
              className={`timeline__marker${index <= currentStepIndex ? ' is-reached' : ''}${index === currentStepIndex ? ' is-current' : ''}`}
              style={{
                insetInlineStart: `${totalSteps > 1 ? (index / (totalSteps - 1)) * 100 : 100}%`,
              }}
              aria-hidden="true"
            />
          ))}
          <input
            className="timeline__scrubber"
            type="range"
            min={1}
            max={Math.max(totalSteps, 1)}
            step={1}
            value={Math.max(visibleStep, 1)}
            disabled={totalSteps === 0}
            aria-label="定位模型计算步骤"
            aria-valuetext={
              totalSteps > 0
                ? `第 ${visibleStep} 步，共 ${totalSteps} 步：${phaseLabel}`
                : '模型轨迹尚未就绪'
            }
            onChange={(event) =>
              store.getState().goToStep(Number(event.currentTarget.value) - 1)
            }
            onKeyDown={(event) => {
              let nextIndex = currentStepIndex
              if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                nextIndex = Math.min(currentStepIndex + 1, totalSteps - 1)
              }
              if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                nextIndex = Math.max(currentStepIndex - 1, 0)
              }
              if (event.key === 'Home') nextIndex = 0
              if (event.key === 'End') nextIndex = Math.max(totalSteps - 1, 0)
              if (nextIndex === currentStepIndex) return

              event.preventDefault()
              store.getState().goToStep(nextIndex)
            }}
          />
        </div>
        <span className="timeline__phase" aria-live="polite">{phaseLabel}</span>
      </div>

      <button
        className="timeline__reset"
        type="button"
        disabled={currentStepIndex === chapterStartIndex && !isPlaying}
        onClick={() => store.getState().resetPlayback(chapterStartIndex)}
      >
        <RotateCcw size={16} aria-hidden="true" />
        重置
      </button>
    </footer>
  )
}

export function AppShell({
  store = explorerStore,
  onRetryTrace,
}: {
  store?: ExplorerStoreApi
  onRetryTrace?: () => void
}) {
  const learningMode = useStore(store, (state) => state.mode)
  const mobileView = useStore(store, (state) => state.view)
  const traceStatus = useStore(store, (state) => state.traceStatus)
  const traceError = useStore(store, (state) => state.traceError)
  const traceRequestId = useStore(store, (state) => state.traceRequestId)
  const capabilities = useDeviceCapabilities()
  const setLearningMode = store.getState().setMode
  const setMobileView = store.getState().setView
  const capabilityLabel =
    capabilities.threeDMode === 'full'
      ? '完整 3D'
      : capabilities.threeDMode === 'reduced'
        ? '简化 3D'
        : '2D 安全模式'

  useEffect(() => {
    store.getState().setReducedMotion(capabilities.reducedMotion)
  }, [capabilities.reducedMotion, store])

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
    <div
      className={`app-shell${learningMode === 'explore' ? ' is-explore' : ''}`}
      data-three-d-mode={capabilities.threeDMode}
      data-compact-viewport={capabilities.compactViewport}
      data-coarse-pointer={capabilities.coarsePointer}
    >
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
            id="mode-guided"
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
          <span
            className="capability-badge"
            data-mode={capabilities.threeDMode}
            data-reduced-motion={capabilities.reducedMotion}
            title={`WebGL2 ${capabilities.webgl2 ? '可用' : '不可用'}；WebGPU ${capabilities.webgpu ? '可用' : '不可用'}；WASM ${capabilities.wasm ? '可用' : '不可用'}；内存等级 ${capabilities.memoryTier}`}
          >
            <GaugeIcon /> {capabilityLabel}
          </span>
        </div>

        <div className="topbar__tools">
          <RealModelDownload />
          <button type="button" disabled aria-label="打开帮助" title="帮助中心即将开放">
            <CircleHelp size={19} aria-hidden="true" />
          </button>
          <button type="button" disabled aria-label="打开设置" title="设置即将开放">
            <Settings2 size={19} aria-hidden="true" />
          </button>
        </div>
        {traceStatus === 'error' && (
          <section className="data-alert" role="alert" aria-label="模型轨迹加载失败">
            <div>
              <strong>教学案例暂时无法加载</strong>
              <p>{traceError ?? '预置模型轨迹加载失败。'}</p>
            </div>
            {onRetryTrace && (
              <button type="button" onClick={onRetryTrace}>
                <RotateCcw size={16} aria-hidden="true" />
                重新加载案例
              </button>
            )}
          </section>
        )}
      </header>

      <ExploreDock store={store} />

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
        <FeatureErrorBoundary
          key={`lesson:${traceRequestId}:${traceStatus}`}
          featureName="中文课程"
          description="二维计算、三维空间和时间轴仍可继续使用。"
          panelId="view-panel-lesson"
          labelledBy="mobile-view-lesson"
          panelClassName={`workspace-panel lesson-panel${mobileView === 'lesson' ? ' is-mobile-active' : ''}`}
        >
          <LessonPanel store={store} isActive={mobileView === 'lesson'} />
        </FeatureErrorBoundary>
        <FeatureErrorBoundary
          key={`2d:${traceRequestId}:${traceStatus}`}
          featureName="二维计算"
          description="中文课程和三维空间仍可继续使用。"
          panelId="view-panel-2d"
          labelledBy="mobile-view-2d"
          panelClassName={`workspace-panel calculation-panel${mobileView === '2d' ? ' is-mobile-active' : ''}`}
        >
          <Trace2DPanel store={store} isActive={mobileView === '2d'} />
        </FeatureErrorBoundary>
        <FeatureErrorBoundary
          key={`3d:${traceRequestId}:${traceStatus}`}
          featureName="三维空间"
          description="中文课程与二维计算仍可完整使用。"
          panelId="view-panel-3d"
          labelledBy="mobile-view-3d"
          panelClassName={`workspace-panel scene-panel${mobileView === '3d' ? ' is-mobile-active' : ''}`}
          onFallbackAction={() => setMobileView('2d')}
          fallbackActionLabel="切换到二维安全模式"
        >
          <Suspense fallback={<Scene3DLoading isActive={mobileView === '3d'} />}>
            <Scene3DPanel
              store={store}
              isActive={mobileView === '3d'}
              capabilities={capabilities}
            />
          </Suspense>
        </FeatureErrorBoundary>
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
