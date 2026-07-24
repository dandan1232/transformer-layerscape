import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react'
import { AlertTriangle, RefreshCcw, ShieldCheck } from 'lucide-react'
import './FeatureErrorBoundary.css'

interface FeatureErrorBoundaryProps {
  readonly children: ReactNode
  readonly featureName: string
  readonly description: string
  readonly panelId: string
  readonly labelledBy: string
  readonly panelClassName: string
  readonly onFallbackAction?: () => void
  readonly fallbackActionLabel?: string
}

interface FeatureErrorBoundaryState {
  readonly error: Error | null
}

export class FeatureErrorBoundary extends Component<
  FeatureErrorBoundaryProps,
  FeatureErrorBoundaryState
> {
  state: FeatureErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): FeatureErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[LayerScape] ${this.props.featureName}渲染失败`, error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <section
        id={this.props.panelId}
        className={`${this.props.panelClassName} feature-error`}
        role="tabpanel"
        aria-labelledby={this.props.labelledBy}
      >
        <div className="feature-error__content" role="alert">
          <AlertTriangle size={28} aria-hidden="true" />
          <p className="eyebrow">独立视图已暂停</p>
          <h2>{this.props.featureName}暂时不可用</h2>
          <p>{this.props.description}</p>
          <details>
            <summary>查看技术信息</summary>
            <code>{this.state.error.message || '未知渲染错误'}</code>
          </details>
          <div className="feature-error__actions">
            <button type="button" onClick={() => this.setState({ error: null })}>
              <RefreshCcw size={16} aria-hidden="true" />
              重试{this.props.featureName}
            </button>
            {this.props.onFallbackAction && this.props.fallbackActionLabel && (
              <button type="button" onClick={this.props.onFallbackAction}>
                <ShieldCheck size={16} aria-hidden="true" />
                {this.props.fallbackActionLabel}
              </button>
            )}
          </div>
        </div>
      </section>
    )
  }
}
