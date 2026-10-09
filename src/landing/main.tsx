import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './landing.css'
import App from './App'
import { watchScale } from './zoom'

document.documentElement.classList.add('rd')

watchScale()
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
