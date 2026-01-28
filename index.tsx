import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary';
import { AuthProvider } from './contexts/AuthContext';
import { ClientProvider } from './contexts/ClientContext';
import { ToastProvider } from './contexts/ToastContext';
import { DialogProvider } from './contexts/DialogContext';
import { AiProvider } from './contexts/AiContext';

// --- GLOBAL PROMISE SAFETY NET ---
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || String(event.reason);
    if (
      msg.includes('aborted') || 
      msg.includes('AbortError') || 
      msg.includes('Network request failed') ||
      msg.includes('cancelled') ||
      msg.includes('The operation was aborted')
    ) {
      // Confirming to the user/developer that this is expected behavior
      console.debug('🛡️ Sproutly Core: Background network death detected. Cold-Start recovery protocol standby.', msg);
      event.preventDefault();
    }
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <DialogProvider>
            <ClientProvider>
              <AiProvider>
                <App />
              </AiProvider>
            </ClientProvider>
          </DialogProvider>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);