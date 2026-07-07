import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppReal } from './AppReal'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppReal />
  </StrictMode>,
)
