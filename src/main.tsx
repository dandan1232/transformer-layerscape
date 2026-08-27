import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.tsx'
import { readInitialUrlState } from './hooks/use-url-state'
import { explorerStore } from './store/explorer-store'

const initialUrl = readInitialUrlState()
if (typeof initialUrl.step === 'number') {
  explorerStore.getState().goToStep(initialUrl.step)
}
if (initialUrl.mode) {
  explorerStore.getState().setMode(initialUrl.mode)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
