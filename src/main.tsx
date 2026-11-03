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

document.documentElement.dataset.theme = readTheme();

const LocalEditor = lazy(() => import('./app/HeliosApp').then(module => ({ default: module.HeliosApp })));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    {location.pathname === '/solidworks' ? <SolidWorksImport /> : location.pathname === '/local'
      ? <Suspense fallback={<div className="discovery-page">Opening local editor…</div>}><LocalEditor /></Suspense>
      : location.pathname === '/' ? <ShowcaseApp /> : <CloudApp />}
  </AppErrorBoundary>
);
