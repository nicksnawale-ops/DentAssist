import React from 'react';

interface State { error: Error | null }

/** Shows a readable message instead of a blank screen when a page crashes. The menu keeps working. */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div role="alert" className="max-w-xl mx-auto mt-16 rounded-panel border border-error/30 bg-surface p-6 space-y-3">
        <h1 className="text-lg font-semibold text-text-main">This page couldn't be shown</h1>
        <p className="text-[14px] text-text-muted">Something went wrong while opening it. Other pages still work from the menu.</p>
        <pre className="text-[12px] bg-surface-hover rounded-control p-3 whitespace-pre-wrap break-words text-error">{error.message}</pre>
        <button onClick={() => window.location.reload()} className="h-9 px-4 rounded-control bg-primary text-white text-[13px] font-medium">Reload</button>
      </div>
    );
  }
}
