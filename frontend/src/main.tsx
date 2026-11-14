import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Sem <StrictMode>: em desenvolvimento ele executa os efeitos duas vezes,
// o que dobraria as chamadas à Groq (limite gratuito de 1.000 requisições/dia).
createRoot(document.getElementById('root')!).render(<App />)
