import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Router from './Router.jsx'

// Stage 1.A SaaS foundation (2026-05-02): Router renders the top-
// level <BrowserRouter> + <AuthProvider> + route table. The
// existing App.tsx is mounted at /app/* under <RequireAuth>; the
// auth screens (Login / Signup / ForgotPassword) live at /login,
// /signup, /forgot. /admin and /trial-expired land in Commit 4.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router />
  </StrictMode>,
)
