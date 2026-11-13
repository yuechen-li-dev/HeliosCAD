import { artifactBuild } from './platform/target';

/**
 * Page routes. A normal deployment routes on the path (`/learn?practice=…`). The artifact build
 * (src/platform/target.ts) is served from one fixed page whose
 * only usable address part is a plain `#name`, so the route is the hash and the query is
 * carried in session storage across the reload that switches pages.
 */
const hashRoutes = artifactBuild;
export const hashRouting = hashRoutes;
const paramsKey = 'helios.route.params';

export function routePath(): string {
  if (!hashRoutes) return location.pathname;
  const name = location.hash.slice(1);
  return /^[a-z-]+$/.test(name) ? `/${name}` : '/';
}

export function routeParams(): URLSearchParams {
  if (!hashRoutes) return new URLSearchParams(location.search);
  try { return new URLSearchParams(sessionStorage.getItem(paramsKey) ?? ''); } catch { return new URLSearchParams(); }
}

/** An href for an in-app link. */
export function routeHref(path: string): string {
  if (!hashRoutes) return path;
  const name = path.split('?')[0]!.replace(/^\//, '');
  return name ? `#${name}` : '#';
}

export function navigate(path: string): void {
  if (!hashRoutes) { location.assign(path); return; }
  const [route, query = ''] = path.split('?');
  try { sessionStorage.setItem(paramsKey, query); } catch { /* storage blocked: the page opens without its parameters */ }
  const hash = routeHref(route!);
  if (location.hash === hash || (hash === '#' && !location.hash)) location.reload();
  else { location.hash = hash; location.reload(); }
}

/** Hash routing re-renders the app when an in-app link changes the hash. */
export function onRouteChange(listener: () => void): void {
  if (hashRoutes) addEventListener('hashchange', () => { if (/^#?[a-z-]*$/.test(location.hash)) listener(); });
}
