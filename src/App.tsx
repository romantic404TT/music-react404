import { Component, type ErrorInfo, type ReactNode } from 'react';
import { HashRouter } from 'react-router-dom';
import { AppRoutes } from '@/router/AppRoutes';

interface BoundaryState {
  error: Error | null;
}

class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[Mineradio] 渲染异常', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center bg-[var(--fc-bg)] p-8 text-center">
        <div className="glass-panel max-w-[460px] rounded-modal p-7">
          <p className="label-caps mb-2">Render Error</p>
          <h1 className="mb-3 text-[15px] text-[var(--fc-ink)]">界面在这一层崩掉了</h1>
          <pre className="mb-5 max-h-[160px] overflow-auto rounded-[10px] bg-black/40 p-3 text-left font-mono text-[10.5px] leading-relaxed text-[var(--fc-muted)]">
            {this.state.error.message}
          </pre>
          <button className="btn btn--primary" onClick={() => this.setState({ error: null })}>
            重新渲染
          </button>
        </div>
      </div>
    );
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </ErrorBoundary>
  );
}
