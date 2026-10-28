import { useEffect, useState } from 'react'
import { api, type Config } from './api'
import { Logo, Moon, Sun } from './icons'
import Home from './pages/Home'
import Library from './pages/Library'

type Route = { page: 'home'; id: number | null } | { page: 'library' }

function parseHash(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  if (h.startsWith('library')) return { page: 'library' }
  const m = h.match(/^doc\/(\d+)/)
  return { page: 'home', id: m ? Number(m[1]) : null }
}

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
    } catch {
      /* private mode */
    }
    setDark(next)
  }
  return { dark, toggle }
}

export default function App() {
  const [route, setRoute] = useState(parseHash)
  const [config, setConfig] = useState<Config | null>(null)
  const { dark, toggle } = useTheme()

  useEffect(() => {
    const on = () => setRoute(parseHash())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    api.config().then(setConfig, () => setConfig(null))
  }, [])

  const tab = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${active ? 'bg-stone-200 dark:bg-stone-800' : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'}`

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b border-stone-200 px-3 py-2 dark:border-stone-800 sm:px-4">
        <a href="#/" className="mr-2 flex items-center gap-1.5 text-base font-semibold tracking-tight">
          <Logo className="size-5 text-emerald-600" /> Checklister
        </a>
        <nav className="flex gap-1">
          <a href="#/" className={tab(route.page === 'home')}>
            Study
          </a>
          <a href="#/library" className={tab(route.page === 'library')}>
            Library
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {config && !config.ollama && (
            <span className="hidden rounded bg-amber-100 px-2 py-1 text-xs text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 sm:inline">
              Ollama offline
            </span>
          )}
          <button
            onClick={toggle}
            aria-label="Toggle dark mode"
            className="rounded-md p-2 text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800"
          >
            {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        {route.page === 'library' ? <Library /> : <Home key={route.id ?? 'new'} id={route.id} config={config} />}
      </main>
    </div>
  )
}
