export interface User { userId: string; accountId: string; displayName: string; email: string }
export interface ProjectSummary { id: string; appInstallationId: string; name: string; revisionId: string; createdAt: string; updatedAt: string }
export interface Project extends ProjectSummary { source: string; contentHash: string }

let csrfToken: string | null = null;

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, detail?: string) {
    super(detail ?? (status === 401 ? 'Sign in failed or your session expired.' : status === 503 ? 'The service is temporarily unavailable. Try again.' : code.replaceAll('_', ' ')));
  }
}

async function request<T>(path: string, init: RequestInit = {}, retryCsrf = true): Promise<T> {
  const method = init.method?.toUpperCase() ?? 'GET';
  const headers = new Headers(init.headers);
  if (method !== 'GET' && method !== 'HEAD') {
    if (!csrfToken) await refreshCsrf();
    headers.set('X-CSRF-TOKEN', csrfToken!);
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string; details?: string[] };
    if (response.status === 400 && body.error === 'invalid_csrf_token' && retryCsrf) { await refreshCsrf(); return request<T>(path, init, false); }
    throw new ApiError(response.status, body.error ?? `http_${response.status}`, body.details?.join(', '));
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export async function refreshCsrf() {
  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  if (!response.ok) throw new ApiError(response.status, 'csrf_unavailable');
  csrfToken = (await response.json() as { token: string }).token;
}

export async function currentUser(): Promise<User | null> {
  try { return await request<User>('/api/auth/me'); }
  catch (error) { if (error instanceof ApiError && error.status === 401) return null; throw error; }
}

export async function register(email: string, password: string, displayName: string) {
  const user = await request<User>('/api/auth/register', { method: 'POST', body: JSON.stringify({ email, password, displayName }) });
  await refreshCsrf();
  return user;
}

export async function signIn(email: string, password: string) {
  await request<void>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  await refreshCsrf();
  return (await currentUser())!;
}

export async function signOut() {
  await request<void>('/api/auth/logout', { method: 'POST', body: '{}' });
  csrfToken = null;
}

export const listProjects = () => request<ProjectSummary[]>('/api/projects');
export const openProject = (id: string) => request<Project>(`/api/projects/${encodeURIComponent(id)}`);
export const createProject = (name: string, source: string) => request<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ appId: 'helios', name, source }) });
export const saveProject = (id: string, source: string, expectedRevisionId: string) => request<{ revisionId: string; contentHash: string; updatedAt: string }>(`/api/projects/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify({ source, expectedRevisionId }) });
export const deleteProject = (id: string) => request<void>(`/api/projects/${encodeURIComponent(id)}`, { method: 'DELETE', body: '{}' });
