import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { I18nProvider } from './context/I18nContext';
import { AuthProvider } from './context/AuthContext';
import { ConfigProvider } from './context/ConfigContext';
import { ToastProvider } from './context/ToastContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <I18nProvider>
        <AuthProvider>
          <ConfigProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </ConfigProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </StrictMode>,
);
