import { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { CloudApp } from './cloud/CloudApp';
import './themes/helios.css';

const LocalEditor = lazy(() => import('./app/HeliosApp').then(module => ({ default: module.HeliosApp })));

ReactDOM.createRoot(document.getElementById('root')!).render(
  import.meta.env.DEV && location.pathname === '/local'
    ? <Suspense fallback={<div className="discovery-page">Opening local editor…</div>}><LocalEditor /></Suspense>
    : <CloudApp />
);
