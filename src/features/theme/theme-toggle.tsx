import { Moon, Sun } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import './theme-toggle.css'

const STORAGE_KEY = 'transformer-layerscape:theme'

function readStoredTheme(): 'dark' | 'light' {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>(readStoredTheme)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark'
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        /* 隐私模式静默忽略 */
      }
      return next
    })
  }, [])

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className="topbar__tools theme-toggle"
      aria-label={isDark ? '切换到浅色主题' : '切换到深色主题'}
      aria-pressed={!isDark}
      onClick={toggle}
    >
      {isDark ? <Moon size={17} aria-hidden="true" /> : <Sun size={17} aria-hidden="true" />}
    </button>
  )
}
