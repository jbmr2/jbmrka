import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md w-full bg-white p-6 rounded-xl shadow-lg border border-red-100">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h2>
            <div className="bg-red-50 p-4 rounded-md overflow-auto max-h-64 mb-4">
              <p className="text-sm text-red-800 font-mono break-words">
                {this.state.error?.message}
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-medium rounded-md transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return (this.props as any).children;
  }
}
