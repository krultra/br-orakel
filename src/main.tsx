import React from 'react';
import { createRoot } from 'react-dom/client';
import '@digdir/designsystemet-css/theme';
import '@digdir/designsystemet-css';
import './styles.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
