// Make refresh initialization a dependency of the application module graph.
// The separate HTML preamble can arrive late during a development reload.
import '@vitejs/plugin-react/preamble';
import { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { CloudApp } from './cloud/CloudApp';
import '@fontsource-variable/inter/opsz.css';
import '@fontsource-variable/inter/opsz-italic.css';
import './themes/helios.css';
import './themes/showcase.css';
import { ShowcaseApp } from './showcase/ShowcaseApp';
import { readTheme } from './themes/useTheme';
import { AppErrorBoundary } from './app/AppErrorBoundary';
import { SolidWorksImport } from './desktop/SolidWorksImport';
import { onRouteChange, routePath } from './navigation';

document.documentElement.dataset.theme = readTheme();

const LocalEditor = lazy(() => import('./app/HeliosApp').then(module => ({ default: module.HeliosApp })));
const Learning = lazy(() => import('./learn/LearnApp').then(module => ({ default: module.LearnApp })));

const root = ReactDOM.createRoot(document.getElementById('root')!);
const render = () => { const path = routePath(); root.render(
  <AppErrorBoundary key={path}>
    {path === '/learn' ? <Suspense fallback={<div className="app-loading">Opening Firmament manual…</div>}><Learning /></Suspense> : path === '/solidworks' ? <SolidWorksImport /> : path === '/local'
      ? <Suspense fallback={<div className="discovery-page">Opening local editor…</div>}><LocalEditor /></Suspense>
      : path === '/' ? <ShowcaseApp /> : <CloudApp />}
  </AppErrorBoundary>
); };
render();
onRouteChange(render);
