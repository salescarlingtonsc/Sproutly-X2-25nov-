import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-red-50 p-4">
          <div className="bg-white p-8 rounded-lg shadow-xl border border-red-200 max-w-md w-full text-center">
            <div className="text-5xl mb-4">🤕</div>
            <h1 className="text-2xl font-bold text-red-700 mb-2">Oops, something went wrong.</h1>
            <p className="text-gray-600 mb-6">
              The application encountered an unexpected error.
            </p>
            {this.state.error && (
              <div className="bg-gray-100 p-3 rounded text-left text-xs text-gray-700 overflow-auto max-h-32 mb-6 font-mono">
                {this.state.error.toString()}
              </div>
            )}
            <button
              onClick={() => {
                window.location.reload();
              }}
              className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors font-semibold"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;