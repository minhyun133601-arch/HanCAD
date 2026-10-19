import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { loadGeometryWasm } from '@hancad/geom';
import { App } from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Application root is missing.');
await loadGeometryWasm();
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
