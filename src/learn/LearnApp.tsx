import { lazy, Suspense } from 'react';
import { LearnCenter } from './LearnCenter';
import { lessons, lessonFile } from './lessons';
import { files } from './library';
import { navigate, routeParams } from '../navigation';
const Editor = lazy(() => import('../app/HeliosApp').then(m => ({ default: m.HeliosApp })));
export function LearnApp() {
  const id = routeParams().get('practice');
  const lesson = lessons.find(l => l.id === id);
  if (!lesson) return <LearnCenter standalone />;
  const source = files[lessonFile(lesson)]?.data;
  if (!source) throw new Error(`The bundled lesson source is missing: ${lesson.file}`);
  return <Suspense fallback={<div className="app-loading">Opening lesson workspace…</div>}><Editor initialWorkspace={{ title: `Practice · ${lesson.title}`, root: lesson.file, documents: { [lesson.file]: source }, lessonId: lesson.id }} onShowcase={() => navigate('/learn')} /></Suspense>;
}
