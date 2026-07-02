import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Sous-ensembles latin + latin-ext uniquement (couvre le français, œ inclus) :
// évite d'embarquer cyrillique, grec, vietnamien et devanagari dans le build.
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-ext-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-ext-600.css";
import "@fontsource/poppins/latin-400.css";
import "@fontsource/poppins/latin-ext-400.css";
import "@fontsource/poppins/latin-600.css";
import "@fontsource/poppins/latin-ext-600.css";
import "@fontsource/poppins/latin-700.css";
import "@fontsource/poppins/latin-ext-700.css";
import "@fontsource/playfair-display/latin-400.css";
import "@fontsource/playfair-display/latin-ext-400.css";
import "@fontsource/playfair-display/latin-700.css";
import "@fontsource/playfair-display/latin-ext-700.css";
import "@fontsource/playfair-display/latin-400-italic.css";
import "@fontsource/playfair-display/latin-ext-400-italic.css";
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
