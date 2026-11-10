import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import { applySavedSettings } from './theme.ts';
import { App } from './App.tsx';

applySavedSettings(); // apply saved theme/texture before first paint (anti-flash)

const el = document.getElementById('root');
if (el) createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
