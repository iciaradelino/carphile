import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

const Lab = lazy(() => import('./lab/Lab').then((m) => ({ default: m.Lab })))
const lab = import.meta.env.DEV && new URLSearchParams(location.search).has('lab')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {lab ? (
      <Suspense>
        <Lab />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
)
