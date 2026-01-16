import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  info?: string;
}

const EB_LOG_KEY = 'sproutly_errorboundary_logs_v1';

function pushEbLog(line: string) {
  try {
    const prev = localStorage.getItem(EB_LOG_KEY);
    const arr: string[] = prev ? JSON.parse(prev) : [];
    arr.push(`[${new Date().toISOString()}] ${line}`);
    localStorage.setItem(EB_LOG_KEY, JSON.stringify(arr.slice(-200)));
  } catch {}
}

export function getErrorBoundaryLogs(): string[] {
  try {
    const raw = localStorage.getItem(EB_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    info: ''
  };

  public static getDerivedStateFromError(error: Error): State {
    pushEbLog(`getDerivedStateFromError: ${error?.message || String(error)}`);
    return { hasError: true, error, info: '' };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const msg = error?.message || String(error);
    const stack = (errorInfo?.componentStack || '').trim();
    pushEbLog(`componentDidCatch: ${msg}`);
    if (stack) pushEbLog(`componentStack: ${stack}`);

    // ✅ force visible signal on iPad
    try {
      alert('REACT ERROR:\n' + msg);
    } catch {}

    console.error('Uncaught error:', error, errorInfo);

    this.setState({ info: stack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="bg-white p-8 rounded-lg shadow-xl border border-red-200 max-w-md w-full text-center">
            <div className="text-5xl mb-4">🤕</div>
            <h1 className="text-2xl font-bold text-red-700 mb-2">
              Oops, something went wrong.
            </h1>
            <p className="text-gray-600 mb-6">
              The app hit an unexpected error.
            </p>

            {this.state.error && (
              <div className="bg-gray-100 p-3 rounded text-left text-xs text-gray-700 overflow-auto max-h-40 mb-4 font-mono">
                {this.state.error.toString()}
              </div>
            )}

            {!!this.state.info && (
              <div className="bg-gray-100 p-3 rounded text-left text-[10px] text-gray-700 overflow-auto max-h-40 mb-6 font-mono">
                {this.state.info}
              </div>
            )}

            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-semibold"
            >
              Reload Application
            </button>

            <button
              onClick={() => {
                try {
                  const logs = getErrorBoundaryLogs();
                  alert('Last logs:\n\n' + logs.slice(-20).join('\n'));
                } catch {}
              }}
              className="ml-2 px-6 py-2 bg-slate-600 text-white rounded hover:bg-slate-700 transition-colors font-semibold"
            >
              Show Logs
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;