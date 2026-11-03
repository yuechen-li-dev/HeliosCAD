import { lazy, Suspense, useEffect, useState } from 'react';
import type { WorkspaceProject } from '../showcase/catalog';
import { receiveSolidWorks } from './solidworksHandoff';

const Editor = lazy(() => import('../app/HeliosApp').then(module => ({ default: module.HeliosApp })));
export function SolidWorksImport() {
  const [workspace, setWorkspace] = useState<WorkspaceProject | null>(null), [error, setError] = useState('');
  useEffect(() => {
    const abort = new AbortController();
    void receiveSolidWorks(new URLSearchParams(location.search).get('handoff'), AbortSignal.any([abort.signal, AbortSignal.timeout(30_000)]))
      .then(project => { if (!abort.signal.aborted) { history.replaceState(null, '', '/solidworks'); setWorkspace({ ...project, title: 'SolidWorks part' }); } })
      .catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : 'The SolidWorks handoff failed.'); });
    return () => abort.abort();
  }, []);
  if (workspace) return <Suspense fallback={<div className="app-loading">Opening your engineering workspace…</div>}><Editor initialWorkspace={workspace} onShowcase={() => location.assign('/')} /></Suspense>;
  return <main className="discovery-page"><h1>SolidWorks → Aetheris Helios</h1>{error ? <><p role="alert">{error}</p><a href="/local">Open Helios and choose Open file</a></> : <p role="status">Receiving your part from the local SolidWorks exporter…</p>}</main>;
}
