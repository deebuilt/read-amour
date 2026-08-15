import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Self-hosted so the PNG export never captures a fallback face mid-load.
import '@fontsource/fraunces/400.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/archivo/400.css'
import '@fontsource/archivo/500.css'
import '@fontsource/archivo/600.css'
import '@fontsource/caveat/400.css'
import '@fontsource/caveat/700.css'

import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
