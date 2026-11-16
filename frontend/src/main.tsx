import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// If something breaks while rendering, show the error instead of a blank screen
class CapturaErro extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null }

  static getDerivedStateFromError(erro: Error) {
    return { erro }
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div style={{ minHeight: '100vh', background: '#03060c', color: '#e2e8f0', padding: 32, fontFamily: 'monospace' }}>
        <h1 style={{ color: '#f87171', fontSize: 18 }}>Error rendering the screen</h1>
        <p style={{ marginTop: 8 }}>{this.state.erro.message}</p>
        <p style={{ marginTop: 16, color: '#94a3b8', fontSize: 13 }}>
          Check that the backend is running on port 8000 with the latest code (Ctrl+C and
          "uvicorn main:app --port 8000" again) and reload the page.
        </p>
        <button
          onClick={() => location.reload()}
          style={{ marginTop: 16, padding: '6px 12px', border: '1px solid #22d3ee', color: '#22d3ee', background: 'transparent', borderRadius: 4 }}
        >
          Reload
        </button>
      </div>
    )
  }
}

// No <StrictMode>: in development it runs effects twice,
// which would double the Groq calls (free limit of 1,000 requests/day).
createRoot(document.getElementById('root')!).render(
  <CapturaErro>
    <App />
  </CapturaErro>,
)
