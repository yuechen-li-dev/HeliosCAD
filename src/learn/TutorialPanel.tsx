import { lessons, lessonPage } from './lessons';
import { useLearningProgress } from './progress';
import './learning.css';

export function TutorialPanel({ lessonId, buildCurrent, onRead }: { lessonId?: string; buildCurrent: boolean; onRead(page: string): void }) {
  const { progress, update } = useLearningProgress();
  const lesson = lessons.find(l => l.id === lessonId);
  if (!lesson) return <section className="tutorial-panel"><h2>Learn by building</h2><p>Six guided projects introduce the language, from stock and holes to assemblies.</p><button onClick={() => onRead('docs/public/learn/README.md')}>Browse tutorials</button><button onClick={() => onRead('docs/public/reference/language/README.md')}>Language reference</button></section>;
  const completed = progress[lesson.id] ?? [];
  return <section className="tutorial-panel" aria-label="Tutorial checklist">
    <small>LESSON {lessons.indexOf(lesson) + 1} OF 6 · {lesson.minutes} MIN</small><h2>{lesson.title}</h2><p>{lesson.summary}</p>
    <button onClick={() => onRead(lessonPage(lesson))}>Read full lesson</button>
    <p className="tutorial-build" role="status">{buildCurrent ? '✓ Current source built successfully.' : 'Build the current source to check the result.'}</p>
    <ol>{lesson.steps.map((step, i) => <li key={step}><label><input type="checkbox" checked={completed.includes(i)} disabled={i === 1 && !buildCurrent && !completed.includes(i)} onChange={() => update(lesson.id, i)} /><span>{step}{i === 1 && <small>Requires a successful build of the current source.</small>}</span></label></li>)}</ol>
    <p role="status">{completed.length === 3 ? 'Lesson checklist complete. Save your source to keep your work.' : `${completed.length} of 3 steps checked`}</p>
    <p className="tutorial-note">Self-checks are saved on this device. Inspect your model before checking a step. Save source separately.</p>
    <button onClick={() => update(lesson.id, null)}>Reset checklist</button>
    <button onClick={() => onRead(lessons.indexOf(lesson) === lessons.length - 1 ? 'docs/public/learn/README.md' : lessonPage(lessons[lessons.indexOf(lesson) + 1]))}>{lessons.indexOf(lesson) === lessons.length - 1 ? 'Review the course' : 'Next lesson →'}</button>
  </section>;
}
