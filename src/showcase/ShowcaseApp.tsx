import { lazy, Suspense, useEffect, useState } from 'react';
import { ExampleGallery } from './ExampleGallery';
import { loadShowcase, type WorkspaceProject } from './catalog';
import { useTheme } from '../themes/useTheme';
import { assemblySource, emptyModelSource } from '../sdk/samples';

const Editor = lazy(() => import('../app/HeliosApp').then(module => ({ default: module.HeliosApp })));
export function ShowcaseApp() {
  const [theme, setTheme] = useTheme();
  const [workspace, setWorkspace] = useState<WorkspaceProject | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');
  const create = (kind: 'part' | 'assembly') => {
    const root = `untitled-${kind}.firmament`;
    setError('');
    setWorkspace({ title: `Untitled ${kind}`, root, documents: { [root]: kind === 'part' ? emptyModelSource : assemblySource } });
  };
  const open = async (id: string) => {
    if (opening) return;
    setOpening(id); setError('');
    try { setWorkspace(await loadShowcase(id)); }
    catch (error) { setError(error instanceof Error ? error.message : 'The example could not be opened.'); }
    finally { setOpening(null); }
  };
  useEffect(() => { const example = new URLSearchParams(location.search).get('example'); if (example) void open(example); }, []);
  if (workspace) return <Suspense fallback={<div className="app-loading"><span className="spinner" />Opening your engineering workspace…</div>}><Editor initialWorkspace={workspace} onShowcase={() => setWorkspace(null)} /></Suspense>;
  return <div className="welcome-shell">
    <header className="welcome-header"><a className="welcome-brand" href="/">HELIOS</a><nav><a href="/discover">Explore</a><a href="/projects">My projects</a><button className="theme-toggle" aria-label={theme === 'mars' ? 'Use light theme' : 'Use dark theme'} onClick={() => setTheme(theme === 'mars' ? 'sirius' : 'mars')}>{theme === 'mars' ? 'Light' : 'Dark'}</button></nav></header>
    <main className="welcome-main"><section className="welcome-hero" aria-label="Create a model"><h1 className="welcome-wordmark">Helios</h1><div className="hero-actions"><button className="primary-button" disabled={!!opening} onClick={() => create('part')}>New part <span aria-hidden="true">↗</span></button><button className="primary-button secondary-button" disabled={!!opening} onClick={() => create('assembly')}>New assembly <span aria-hidden="true">↗</span></button></div></section>
      {error && <p className="showcase-error" role="alert">{error}</p>}<ExampleGallery onOpen={id => void open(id)} opening={opening} />
    </main><footer className="welcome-footer"><span>By Aetheris</span><span>Preview 4</span></footer>
  </div>;
}
