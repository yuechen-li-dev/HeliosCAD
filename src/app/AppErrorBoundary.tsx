import { Component, type ErrorInfo, type ReactNode } from 'react';
import { downloadRecoveredSource, recoverableSource } from './crashRecovery';

interface State { error: Error | null }

/** Replaces a blank page with a recoverable screen: keep the user's source, then reload. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Helios stopped rendering', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const source = recoverableSource();
    const files = source ? Object.keys(source.documents).length : 0;
    return <main className="crash-screen" role="alert">
      <h1>Helios hit an unexpected error</h1>
      <p>{source
        ? `Your ${files === 1 ? 'source is' : `${files} source files are`} still in this tab. Download ${files === 1 ? 'it' : 'them'} before reloading.`
        : 'Nothing was saved from this tab. Reloading starts Helios again.'}</p>
      <div className="crash-actions">
        {source && <button className="crash-primary" onClick={() => downloadRecoveredSource(source)}>Download source</button>}
        <button onClick={() => location.reload()}>Reload Helios</button>
        <button onClick={() => { location.href = '/'; }}>Back to start</button>
      </div>
      <details><summary>Error details</summary><pre>{error.message}{error.stack ? `\n\n${error.stack}` : ''}</pre></details>
    </main>;
  }
}
