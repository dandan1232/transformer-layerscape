import { useEffect, useState } from 'react'
import { PresetTraceAdapter } from './adapters/preset/preset-trace-adapter'
import { AppShell } from './app/AppShell'
import { coreLesson } from './content/lessons/core-lesson'
import { validateLesson } from './domain/lesson/lesson-validator'
import { explorerStore } from './store/explorer-store'
import { createExplorerPersistenceController } from './store/explorer-persistence'
import { createPlaybackController } from './store/playback-controller'

const presetTraceAdapter = new PresetTraceAdapter()

function App() {
  const [loadAttempt, setLoadAttempt] = useState(0)

  useEffect(() => {
    const abortController = new AbortController()
    const playbackController = createPlaybackController(explorerStore)
    const persistenceController = createExplorerPersistenceController(explorerStore)
    const requestId = explorerStore.getState().beginTraceLoad()

    void presetTraceAdapter
      .load({ signal: abortController.signal })
      .then((trace) => {
        if (
          abortController.signal.aborted ||
          explorerStore.getState().traceRequestId !== requestId
        ) {
          return
        }
        validateLesson(coreLesson, trace)
        explorerStore.getState().finishTraceLoad(requestId, trace)
        persistenceController.restoreProgress()
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return
        const message =
          error instanceof Error ? error.message : '预置模型轨迹加载失败。'
        explorerStore.getState().failTraceLoad(requestId, message)
        persistenceController.enableSaving()
      })

    return () => {
      abortController.abort()
      explorerStore.getState().cancelTraceLoad(requestId)
      playbackController.dispose()
      persistenceController.dispose()
    }
  }, [loadAttempt])

  return (
    <AppShell
      store={explorerStore}
      onRetryTrace={() => setLoadAttempt((attempt) => attempt + 1)}
    />
  )
}

export default App
