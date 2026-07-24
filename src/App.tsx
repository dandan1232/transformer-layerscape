import { useEffect } from 'react'
import { PresetTraceAdapter } from './adapters/preset/preset-trace-adapter'
import { AppShell } from './app/AppShell'
import { coreLesson } from './content/lessons/core-lesson'
import { validateLesson } from './domain/lesson/lesson-validator'
import { explorerStore } from './store/explorer-store'
import { createPlaybackController } from './store/playback-controller'

const presetTraceAdapter = new PresetTraceAdapter()

function App() {
  useEffect(() => {
    const abortController = new AbortController()
    const playbackController = createPlaybackController(explorerStore)
    const requestId = explorerStore.getState().beginTraceLoad()

    void presetTraceAdapter
      .load({ signal: abortController.signal })
      .then((trace) => {
        validateLesson(coreLesson, trace)
        explorerStore.getState().finishTraceLoad(requestId, trace)
      })
      .catch((error: unknown) => {
        if (abortController.signal.aborted) return
        const message =
          error instanceof Error ? error.message : '预置模型轨迹加载失败。'
        explorerStore.getState().failTraceLoad(requestId, message)
      })

    return () => {
      abortController.abort()
      explorerStore.getState().cancelTraceLoad(requestId)
      playbackController.dispose()
    }
  }, [])

  return <AppShell store={explorerStore} />
}

export default App
