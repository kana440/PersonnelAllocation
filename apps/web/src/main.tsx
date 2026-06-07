import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Step1App from './App'
import Step2App from './Step2App'

const appMode = import.meta.env.VITE_APP_MODE ?? 'step1'
const App = appMode === 'step2' ? Step2App : Step1App

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
