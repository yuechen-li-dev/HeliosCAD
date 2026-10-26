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

document.documentElement.dataset.theme = readTheme();

const LocalEditor = lazy(() => import('./app/HeliosApp').then(module => ({ default: module.HeliosApp })));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    {location.pathname === '/local'
      ? <Suspense fallback={<div className="discovery-page">Opening local editor…</div>}><LocalEditor /></Suspense>
      : location.pathname === '/' ? <ShowcaseApp /> : <CloudApp />}
  </AppErrorBoundary>
);
