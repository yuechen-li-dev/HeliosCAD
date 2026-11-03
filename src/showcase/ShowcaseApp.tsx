import { lazy, Suspense, useEffect, useState } from 'react';
import { ExampleGallery } from './ExampleGallery';
import { loadShowcase, type WorkspaceProject } from './catalog';
import { useTheme } from '../themes/useTheme';
import { assemblySource, emptyModelSource } from '../sdk/samples';
import { HeroStatements } from './HeroStatements';
import { LocalHostControl } from '../desktop/LocalHostControl';
import { KnotLogo } from '../branding/KnotLogo';

const Editor = lazy(() => import('../app/HeliosApp').then(module => ({ default: module.HeliosApp })));
export function ShowcaseApp() {
  const [theme, setTheme] = useTheme();
  const [workspace, setWorkspace] = useState<WorkspaceProject | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [chooseBase, setChooseBase] = useState(false);
  const create = (kind: 'part' | 'assembly') => {
    const root = `untitled-${kind}.firmament`;
    setError('');
    setChooseBase(kind === 'part');
    setWorkspace({ title: `Untitled ${kind}`, root, documents: { [root]: kind === 'part' ? emptyModelSource : assemblySource } });
  };
  const open = async (id: string) => {
    if (opening) return;
    setOpening(id); setError('');
    try { setChooseBase(false); setWorkspace(await loadShowcase(id)); }
    catch (error) { setError(error instanceof Error ? error.message : 'The example could not be opened.'); }
    finally { setOpening(null); }
  };
  useEffect(() => { const example = new URLSearchParams(location.search).get('example'); if (example) void open(example); }, []);
  useEffect(() => {
    if (workspace) return;
    const help = (event: KeyboardEvent) => { if (event.key === 'F1') { event.preventDefault(); location.assign('/learn'); } };
    addEventListener('keydown', help); return () => removeEventListener('keydown', help);
  }, [workspace]);
  if (workspace) return <Suspense fallback={<div className="app-loading"><span className="spinner" />Opening your engineering workspace…</div>}><Editor initialWorkspace={workspace} chooseBase={chooseBase} onShowcase={() => setWorkspace(null)} /></Suspense>;
  return <div className="welcome-shell">
    <header className="welcome-header"><a className="welcome-brand" href="/" aria-label="Aetheris Helios home"><KnotLogo /><span>Aetheris Helios</span></a><nav><a href="/learn">Learn</a><a href="/discover">Explore</a><a href="/projects">My projects</a><button className="theme-toggle" aria-label={theme === 'bronze-age' ? 'Use light theme' : 'Use dark theme'} onClick={() => setTheme(theme === 'bronze-age' ? 'apollonia' : 'bronze-age')}>{theme === 'bronze-age' ? 'Light' : 'Dark'}</button><LocalHostControl /></nav></header>
    <main className="welcome-main"><section className="welcome-hero" aria-label="Create a model"><div className="welcome-lockup"><KnotLogo hero /><h1 className="welcome-wordmark"><span className="welcome-family">Aetheris</span> Helios</h1></div><HeroStatements /><div className="hero-actions"><button className="primary-button" disabled={!!opening} onClick={() => create('part')}>New part <span aria-hidden="true">↗</span></button><button className="primary-button secondary-button" disabled={!!opening} onClick={() => create('assembly')}>New assembly <span aria-hidden="true">↗</span></button></div></section>
      {error && <p className="showcase-error" role="alert">{error}</p>}<ExampleGallery onOpen={id => void open(id)} opening={opening} />
    </main><footer className="welcome-footer"><span>Aetheris Helios</span><span>Preview</span></footer>
  </div>;
}
