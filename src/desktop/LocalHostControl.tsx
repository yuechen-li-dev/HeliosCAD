import { useEffect, useState } from 'react';
import { request } from '../cloud/api';
import './local-host.css';

/** A projection of the packaged host; web deployments keep their normal header. */
export function useLocalHost() {
  const [local, setLocal] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    void request<{ mode: string }>('/__helios/status', { signal: abort.signal })
      .then(status => setLocal(status.mode === 'desktop')).catch(() => {});
    return () => abort.abort();
  }, []);
  return local;
}

export function LocalHostControl() {
  const local = useLocalHost();
  const [stopped, setStopped] = useState(false);
  const [error, setError] = useState('');
  if (!local) return null;
  return <span className="local-host-control">
    <button title="Stop the local Helios host" disabled={stopped} onClick={() => {
      if (!confirm('Quit Helios? Save or download your working source first. This stops the local host and any running AI task.')) return;
      void request('/__helios/stop', { method: 'POST', body: '{}' })
        .then(() => setStopped(true)).catch(() => setError('Could not stop the host. Close the launcher window.'));
    }}>{stopped ? 'Helios stopped' : 'Quit Helios'}</button>
    {error && <span role="alert">{error}</span>}
  </span>;
}
