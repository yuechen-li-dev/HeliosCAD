import { useEffect, useState } from 'react';
import { HeliosApp } from '../app/HeliosApp';
import { emptyModelSource } from '../sdk/samples';
import { ApiError, createProject, currentUser, deleteProject, listProjects, openProject, register, saveProject, signIn, signOut, type Project, type ProjectSummary, type User } from './api';
import './cloud.css';

export function CloudApp() {
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { void currentUser().then(async value => { setUser(value); if (value) setProjects(await listProjects()); }).catch(err => setError(message(err))).finally(() => setLoading(false)); }, []);

  async function authenticated(action: () => Promise<User>) {
    setBusy(true); setError('');
    try { const next = await action(); setUser(next); setProjects(await listProjects()); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function create(name: string) {
    setBusy(true); setError('');
    try { const next = await createProject(name, emptyModelSource); setProjects(await listProjects()); setProject(next); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
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
  async function remove(id: string) {
    if (!confirm('Delete this project? Its saved revisions will be hidden.')) return;
    setBusy(true); setError('');
    try { await deleteProject(id); setProjects(await listProjects()); }
    catch (err) { setError(message(err)); }
    finally { setBusy(false); }
  }
  async function leave() {
    setError('');
    try { setProjects(await listProjects()); setProject(null); }
    catch (err) { setError(message(err)); }
  }
  async function logout() {
    setError('');
    try { await signOut(); setProject(null); setProjects([]); setUser(null); }
    catch (err) { setError(message(err)); }
  }

  if (loading) return <div className="cloud-page"><p>Connecting to Leviathan…</p></div>;
  if (!user) return <AuthScreen busy={busy} error={error} onRegister={(e, p, n) => authenticated(() => register(e, p, n))} onSignIn={(e, p) => authenticated(() => signIn(e, p))} />;
  if (project) return <HeliosApp key={project.id} project={project} onSave={save} onBack={() => void leave()} onSignOut={() => void logout()} />;
  return <div className="cloud-page"><div className="cloud-card project-picker">
    <header><div><span className="cloud-eyebrow">HELIOS · WORKSPACE</span><h1>Your projects</h1><p>Signed in as {user.displayName}</p></div><button className="cloud-text-button" onClick={() => void logout()}>Sign out</button></header>
    <form onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const name = new FormData(form).get('name')?.toString().trim(); if (name) void create(name); }} className="create-row"><input name="name" aria-label="Project name" placeholder="Name a new project" maxLength={160} required /><button disabled={busy}>Create project</button></form>
    {error && <p className="cloud-error" role="alert">{error}</p>}
    <div className="project-list">{projects.length ? projects.map(item => <div className="project-row" key={item.id}><button onClick={() => void open(item.id)} disabled={busy}><strong>{item.name}</strong><span>Edited {new Date(item.updatedAt).toLocaleString()}</span></button><button className="cloud-text-button" onClick={() => void remove(item.id)} disabled={busy} aria-label={`Delete ${item.name}`}>Delete</button></div>) : <p className="empty-projects">Create a project to begin modeling.</p>}</div>
  </div></div>;
}

function AuthScreen({ busy, error, onRegister, onSignIn }: { busy: boolean; error: string; onRegister: (email: string, password: string, name: string) => void; onSignIn: (email: string, password: string) => void }) {
  const [mode, setMode] = useState<'sign-in' | 'register'>('sign-in');
  return <div className="cloud-page"><div className="cloud-card auth-card"><span className="cloud-eyebrow">HELIOS · BY AETHERIS</span><h1>{mode === 'sign-in' ? 'Welcome back' : 'Create your workspace'}</h1><p>Build, save, and return to your Firmament projects.</p>
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
