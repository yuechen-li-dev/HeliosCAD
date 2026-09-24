import { lazy, Suspense, useEffect, useState } from 'react';
import { emptyModelSource } from '../sdk/samples';
import { galleryModels, searchGallery, type GalleryModel } from '../discovery/catalog';
import { ApiError, createProject, currentUser, deleteProject, forkPublication, getPublication, listProjects, listPublications, openProject, publishProject, register, saveProject, signIn, signOut, type Project, type ProjectSummary, type PublicModel, type User } from './api';
import './cloud.css';

const HeliosApp = lazy(() => import('../app/HeliosApp').then(module => ({ default: module.HeliosApp })));
type Page = { kind: 'discover' } | { kind: 'detail'; id: string } | { kind: 'projects' };
function pageFromPath(): Page {
  const match = location.pathname.match(/^\/m\/([a-z0-9_-]+)\/?$/);
  return match ? { kind: 'detail', id: match[1] } : location.pathname === '/projects' ? { kind: 'projects' } : { kind: 'discover' };
}

export function CloudApp() {
  const [page, setPage] = useState<Page>(pageFromPath);
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [publicModels, setPublicModels] = useState<GalleryModel[]>([]);
  const [detailPublication, setDetailPublication] = useState<GalleryModel | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [authIntent, setAuthIntent] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [visibleCount, setVisibleCount] = useState(12);
  const [showSource, setShowSource] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [theme, setTheme] = useState(() => localStorage.getItem('helios-theme') === 'sirius' ? 'sirius' : 'mars');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('helios-theme', theme);
  }, [theme]);
  useEffect(() => {
    let live = true;
    void currentUser().then(async value => {
      if (!live) return;
      setUser(value);
      if (value) setProjects(await listProjects());
    }).catch(err => { if (live) setError(message(err)); }).finally(() => { if (live) setLoadingUser(false); });
    const onPop = () => { setPage(pageFromPath()); setProject(null); setShowSource(false); };
    addEventListener('popstate', onPop);
    return () => { live = false; removeEventListener('popstate', onPop); };
  }, []);
  useEffect(() => {
    let live = true;
    void listPublications().then(rows => { if (live) setPublicModels(rows.map(toGalleryModel)); }).catch(() => { /* Bundled examples remain usable offline. */ });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (page.kind !== 'detail' || !page.id.startsWith('pub_')) return;
    let live = true;
    void getPublication(page.id).then(row => { if (live) setDetailPublication(toGalleryModel(row)); }).catch(err => { if (live) setError(message(err)); });
    return () => { live = false; };
  }, [page]);

  function navigate(path: string) {
    history.pushState(null, '', path);
    setPage(pageFromPath()); setProject(null); setShowSource(false); setZoom(100); setError('');
  }
  async function authenticated(action: () => Promise<User>) {
    setBusy(true); setError('');
    try {
      const next = await action();
      setUser(next);
      setProjects(await listProjects());
      const intent = authIntent;
      setAuthIntent(null);
      if (intent && intent !== 'projects') await fork(intent, true);
      else if (intent === 'projects') navigate('/projects');
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function create(name: string, source = emptyModelSource) {
    setBusy(true); setError('');
    try {
      const next = await createProject(name, source);
      setProjects(await listProjects());
      setProject(next);
    } catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function fork(id: string, authenticatedNow = false) {
    const model = [detailPublication, ...publicModels, ...galleryModels].find(item => item?.id === id);
    if (!model) { setError('This model is unavailable.'); return; }
    if (user && !authenticatedNow) {
      try { if (!await currentUser()) { setUser(null); setAuthIntent(id); return; } }
      catch (err) { setError(message(err)); return; }
    }
    if (!user && !authenticatedNow && !loadingUser) { setAuthIntent(id); return; }
    if (!user && !authenticatedNow && loadingUser) {
      const existing = await currentUser().catch(() => null);
      if (!existing) { setAuthIntent(id); return; }
      setUser(existing);
    }
    if (model.publishedRevisionId) {
      setBusy(true); setError('');
      try { const next = await forkPublication(id); setProjects(await listProjects()); setProject(next); }
      catch (err) { setError(message(err)); }
      finally { setBusy(false); }
    } else await create(`${model.title} Copy`, model.source);
  }
  async function open(id: string) {
    setBusy(true); setError('');
    try { setProject(await openProject(id)); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function save(source: string) {
    if (!project) return;
    try {
      const result = await saveProject(project.id, source, project.revisionId);
      setProject(old => old?.id === project.id ? { ...old, source, revisionId: result.revisionId, contentHash: result.contentHash, updatedAt: result.updatedAt } : old);
      setProjects(old => old.map(item => item.id === project.id ? { ...item, revisionId: result.revisionId, updatedAt: result.updatedAt } : item));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) throw new Error('A newer revision exists. Copy your unsaved source, then reopen this project.');
      if (err instanceof ApiError && err.status === 401) throw new Error('Session expired. Download your source, then sign in again.');
      throw err;
    }
  }
  async function publish(payload: Parameters<typeof publishProject>[1]) {
    if (!project) throw new Error('Open a project before publishing.');
    await publishProject(project.id, payload);
    setPublicModels((await listPublications()).map(toGalleryModel));
  }
  async function remove(id: string) {
    if (!confirm('Delete this project? Its saved revisions will be hidden.')) return;
    setBusy(true); setError('');
    try { await deleteProject(id); setProjects(await listProjects()); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function leave() {
    try { setProjects(await listProjects()); setProject(null); navigate('/'); }
    catch (err) { setError(message(err)); }
  }
  async function logout() {
    setError('');
    try { await signOut(); setProject(null); setProjects([]); setUser(null); setAuthIntent(null); navigate('/'); }
    catch (err) { setError(message(err)); }
  }

  if (project) return <Suspense fallback={<div className="discovery-page">Opening editor…</div>}><HeliosApp key={project.id} project={project} onSave={save} onPublish={publish} onBack={() => void leave()} onSignOut={() => void logout()} /></Suspense>;
  if (authIntent) return <AuthScreen busy={busy} error={error} onCancel={() => setAuthIntent(null)} onRegister={(e, p, n) => authenticated(() => register(e, p, n))} onSignIn={(e, p) => authenticated(() => signIn(e, p))} />;
  const model = page.kind === 'detail' ? (detailPublication?.id === page.id ? detailPublication : [...publicModels, ...galleryModels].find(item => item.id === page.id)) : undefined;
  const visible = searchGallery([...publicModels, ...galleryModels], query, category);
  return <div className="discovery-page">
    <header className="discovery-header"><button className="discovery-brand" onClick={() => navigate('/')} aria-label="Helios Discover"><strong>H</strong><span>HELIOS<small>by Aetheris</small></span></button>
      <nav aria-label="Main"><button className={page.kind === 'discover' ? 'selected' : ''} onClick={() => navigate('/')}>Discover</button><button className={page.kind === 'projects' ? 'selected' : ''} onClick={() => user ? navigate('/projects') : setAuthIntent('projects')}>My Projects</button></nav>
      <div className="discovery-account"><select aria-label="Theme" value={theme} onChange={event => setTheme(event.target.value)}><option value="mars">Mars</option><option value="sirius">Sirius</option></select>{user ? <><span>{user.displayName}</span><button onClick={() => void logout()}>Sign out</button></> : <button onClick={() => setAuthIntent('projects')}>Sign in</button>}</div>
    </header>
    {error && <p className="discovery-error" role="alert">{error}</p>}
    {page.kind === 'discover' && <main className="discover-main"><div className="discover-intro"><div><span className="cloud-eyebrow">DISCOVER</span><h1>Explore models. Make one yours.</h1></div><p>Open a model, see its Firmament source, and make a copy in Helios.</p></div>
      <div className="discover-tools"><input type="search" aria-label="Search models" placeholder="Search models, tags, creators…" value={query} onChange={event => { setQuery(event.target.value); setVisibleCount(12); }} /><div className="discover-filters" aria-label="Categories">{['All', 'Mechanical', 'Surface', 'Assemblies', 'Sheet Metal', 'Furniture', 'Architecture', 'Game Assets'].map(value => <button key={value} className={category === value ? 'selected' : ''} onClick={() => { setCategory(value); setVisibleCount(12); }}>{value}</button>)}</div></div>
      <div className="gallery-grid">{visible.slice(0, visibleCount).map(item => <button className="gallery-card" key={item.id} onClick={() => navigate(`/m/${item.id}`)}><img src={item.preview} alt={`${item.title} preview`} loading="lazy" /><span className="gallery-card-info"><strong>{item.title}</strong><small>by {item.creator} · {item.category}</small></span></button>)}</div>
      {visibleCount < visible.length && <button className="load-more" onClick={() => setVisibleCount(value => value + 12)}>Load more models</button>}
      {!visible.length && <p className="discover-empty">No models match this search.</p>}
    </main>}
    {page.kind === 'detail' && (model ? <main className="model-detail"><button className="detail-back" onClick={() => navigate('/')}>← Discover</button><div className="detail-layout"><div className="detail-visual"><div className="detail-image"><img src={model.preview} alt={`${model.title} preview`} style={{ transform: `scale(${zoom / 100})` }} /></div><label>Preview zoom <input type="range" min="75" max="175" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label><p>Precomputed view · Open an editable model in Helios to inspect geometry.</p></div><div className="detail-copy"><span className="cloud-eyebrow">{model.category}</span><h1>{model.title}</h1><p>by {model.creator}</p><p>{model.description}</p><div className="detail-actions">{model.editablePartId ? <><button className="primary" onClick={() => navigate(`/m/${model.editablePartId}`)}>Explore editable shade</button><a href={model.downloadStep} download>Download STEP</a></> : <><button className="primary" disabled={busy} onClick={() => void fork(model.id)}>Open in Helios</button><button disabled={busy} onClick={() => void fork(model.id)}>Fork</button></>}<button onClick={() => setShowSource(value => !value)}>{showSource ? 'Hide Source' : 'View Source'}</button></div><div className="detail-tags">{model.tags.map(tag => <span key={tag}>{tag}</span>)}</div></div></div>{showSource && <section className="detail-source"><h2>Firmament source</h2><pre>{model.source || 'Loading source…'}</pre>{model.supportingSource && <><h3>{model.supportingSource.name}</h3><pre>{model.supportingSource.source}</pre></>}</section>}</main> : page.id.startsWith('pub_') && !error ? <main className="discover-main"><p>Loading model…</p></main> : <main className="discover-main"><h1>Model not found</h1><button onClick={() => navigate('/')}>Back to Discover</button></main>)}
    {page.kind === 'projects' && <main className="projects-main"><div className="projects-heading"><div><span className="cloud-eyebrow">WORKSPACE</span><h1>Your projects</h1></div><p>Saved Firmament projects for {user?.displayName ?? 'your account'}.</p></div><form onSubmit={event => { event.preventDefault(); const name = new FormData(event.currentTarget).get('name')?.toString().trim(); if (name) void create(name); }} className="create-row"><input name="name" aria-label="Project name" placeholder="Name a new project" maxLength={160} required /><button disabled={busy}>Create project</button></form><div className="project-list">{projects.length ? projects.map(item => <div className="project-row" key={item.id}><button onClick={() => void open(item.id)} disabled={busy}><strong>{item.name}</strong><span>Edited {new Date(item.updatedAt).toLocaleString()}</span></button><button className="cloud-text-button" onClick={() => void remove(item.id)} disabled={busy} aria-label={`Delete ${item.name}`}>Delete</button></div>) : <p className="empty-projects">No projects yet. <button onClick={() => navigate('/')}>Explore models to make a copy.</button></p>}</div></main>}
    <footer className="discovery-footer">Public samples are versioned with Helios. Sign in when you make a copy or save a project.</footer>
  </div>;
}

function AuthScreen({ busy, error, onCancel, onRegister, onSignIn }: { busy: boolean; error: string; onCancel: () => void; onRegister: (email: string, password: string, name: string) => void; onSignIn: (email: string, password: string) => void }) {
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in');
  return <div className="cloud-page"><div className="cloud-card auth-card"><button className="cloud-text-button" onClick={onCancel}>← Continue browsing</button><span className="cloud-eyebrow">HELIOS · BY AETHERIS</span><h1>{mode === 'sign-in' ? 'Sign in to continue' : 'Create your workspace'}</h1><p>Your model will be ready after you sign in.</p>
    <form onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget); const email = String(fields.get('email')); const password = String(fields.get('password')); if (mode === 'register') onRegister(email, password, String(fields.get('name'))); else onSignIn(email, password); }}>
      {mode === 'register' && <label>Name<input name="name" autoComplete="name" required maxLength={120} /></label>}
      <label>Email<input type="email" name="email" autoComplete="email" required /></label>
      <label>Password<input type="password" name="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required minLength={12} /></label>
      {mode === 'register' && <small>Use at least 12 characters, including uppercase, lowercase, a number, and a symbol.</small>}
      {error && <p className="cloud-error" role="alert">{error}</p>}
      <button className="cloud-primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'sign-in' ? 'Sign in' : 'Create account'}</button>
    </form><button className="cloud-text-button auth-switch" onClick={() => setMode(mode === 'sign-in' ? 'register' : 'sign-in')}>{mode === 'sign-in' ? 'New to Helios? Create an account' : 'Already have an account? Sign in'}</button>
  </div></div>;
}

function message(error: unknown) { return error instanceof Error ? error.message : 'The request failed. Try again.'; }
function toGalleryModel(row: PublicModel): GalleryModel {
  return { id: row.id, title: row.title, creator: row.creatorName, category: row.category, description: row.description, tags: row.tags, source: row.source ?? '', preview: row.previewUrl, publishedRevisionId: row.publishedRevisionId };
}
