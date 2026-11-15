import { Component, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Se algo quebrar na renderização, mostra o erro em vez de uma tela branca
class CapturaErro extends Component<{ children: ReactNode }, { erro: Error | null }> {
  state = { erro: null as Error | null }

  static getDerivedStateFromError(erro: Error) {
    return { erro }
  }

  render() {
    if (!this.state.erro) return this.props.children
    return (
      <div style={{ minHeight: '100vh', background: '#03060c', color: '#e2e8f0', padding: 32, fontFamily: 'monospace' }}>
        <h1 style={{ color: '#f87171', fontSize: 18 }}>Erro ao montar a tela</h1>
        <p style={{ marginTop: 8 }}>{this.state.erro.message}</p>
        <p style={{ marginTop: 16, color: '#94a3b8', fontSize: 13 }}>
          Confira se o backend está rodando na porta 8000 com o código mais recente (Ctrl+C e
          "uvicorn main:app --port 8000" de novo) e recarregue a página.
        </p>
        <button
          onClick={() => location.reload()}
          style={{ marginTop: 16, padding: '6px 12px', border: '1px solid #22d3ee', color: '#22d3ee', background: 'transparent', borderRadius: 4 }}
        >
          Recarregar
        </button>
      </div>
    )
  }
}

// Sem <StrictMode>: em desenvolvimento ele executa os efeitos duas vezes,
// o que dobraria as chamadas à Groq (limite gratuito de 1.000 requisições/dia).
createRoot(document.getElementById('root')!).render(
  <CapturaErro>
    <App />
  </CapturaErro>,
)
