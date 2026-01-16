import * as React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/common/ErrorBoundary';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import { DialogProvider } from './contexts/DialogContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <DialogProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </DialogProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);