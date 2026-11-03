import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MachinaTextView } from 'machinalayout/text/react';
import { files, pages, searchDocs, renderDoc, downloadDocFile, sections, welcomePage, coursePage, referencePage } from './library';
import { lessons, lessonPage, practiceUrl } from './lessons';
import { useLearningProgress } from './progress';
import { learningLayout } from './learningLayout';
import './learning.css';

type Location = { id: string; anchor?: string };
function initialLocation(initialPage?: string, standalone?: boolean): Location {
  const id = initialPage ?? (standalone ? new URLSearchParams(location.hash.slice(1)).get('page') : null) ?? welcomePage;
  return { id: pages[id] || files[id] ? id : welcomePage, anchor: standalone ? new URLSearchParams(location.hash.slice(1)).get('heading') ?? undefined : undefined };
}
export function LearnCenter({ initialPage, onClose, standalone = false }: { initialPage?: string; onClose?(): void; standalone?: boolean }) {
  const [history, setHistory] = useState<Location[]>(() => [initialLocation(initialPage, standalone)]), [index, setIndex] = useState(0);
  const current = history[index], page = pages[current.id], file = files[current.id];
  const [query, setQuery] = useState(''), [section, setSection] = useState(''), [navigation, setNavigation] = useState(false), [notice, setNotice] = useState('');
  const root = useRef<HTMLDialogElement>(null), boundsRef = useRef<HTMLDivElement>(null), article = useRef<HTMLElement>(null);
  const [bounds, setBounds] = useState({ width: 1200, height: 700 });
  const { progress } = useLearningProgress();
  const rendered = useMemo(() => renderDoc(current.id, page?.markdown ?? ''), [current.id, page]);
  const results = useMemo(() => searchDocs(query, section), [query, section]);
  const lesson = lessons.find(l => lessonPage(l) === current.id);
  const layout = learningLayout(bounds.width, bounds.height, navigation);
  const place = (id: string): CSSProperties => { const r = layout.rect(id); return { position: 'absolute', left: r.x, top: r.y, width: r.width, height: r.height }; };
  const go = (next: Location) => {
    if (!pages[next.id] && !files[next.id]) return;
    setHistory(value => [...value.slice(0, index + 1), next]); setIndex(index + 1); setNavigation(false); setNotice('');
    if (standalone) { const hash = new URLSearchParams({ page: next.id }); if (next.anchor) hash.set('heading', next.anchor); window.history.pushState(null, '', '#' + hash); }
  };
  useEffect(() => {
    const help = (event: KeyboardEvent) => { if (event.key === 'F1') event.preventDefault(); };
    addEventListener('keydown', help); return () => removeEventListener('keydown', help);
  }, []);
  useEffect(() => {
    if (!onClose) return;
    const previous = document.activeElement as HTMLElement | null;
    root.current?.showModal();
    return () => { root.current?.close(); previous?.focus(); };
  }, []);
  useEffect(() => {
    if (!standalone) return;
    const pop = () => { setHistory([initialLocation(undefined, true)]); setIndex(0); };
    addEventListener('popstate', pop); return () => removeEventListener('popstate', pop);
  }, [standalone]);
  useEffect(() => {
    if (!standalone) return;
    const hash = new URLSearchParams({ page: current.id }); if (current.anchor) hash.set('heading', current.anchor);
    window.history.replaceState(null, '', '#' + hash);
  }, [current.id, current.anchor, standalone]);
  useLayoutEffect(() => {
    const element = boundsRef.current; if (!element) return;
    const resize = () => { const r = element.getBoundingClientRect(); setBounds({ width: r.width, height: r.height }); };
    resize(); const observer = new ResizeObserver(resize); observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (current.anchor) {
      const target = article.current?.querySelector<HTMLElement>('#' + CSS.escape(current.anchor));
      target?.scrollIntoView({ block: 'start' }); target?.focus({ preventScroll: true });
    } else if (article.current) article.current.scrollTop = 0;
  }, [current.id, current.anchor]);
  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setNotice('Copied to clipboard.'); }
    catch { setNotice('Clipboard unavailable. Select the code and copy it with Ctrl+C or Cmd+C.'); }
  };
  const body = <div className="learn-center">
    <header className="learn-header"><div><small>AETHERIS HELIOS</small><h1>Learn Firmament</h1></div><nav aria-label="Learning shortcuts"><button onClick={() => go({ id: welcomePage })}>Start here</button><button onClick={() => go({ id: coursePage })}>Tutorials</button><button onClick={() => go({ id: referencePage })}>Reference</button>{onClose ? <button aria-label="Close learning center" onClick={onClose}>Close ×</button> : <a href="/">Back to Helios ↗</a>}</nav></header>
    <div className="learn-controls"><button className="learn-menu" aria-expanded={navigation} onClick={() => setNavigation(v => !v)}>Browse</button><button aria-label="Previous documentation page" disabled={index === 0} onClick={() => { setIndex(i => i - 1); setNavigation(false); }}>←</button><button aria-label="Next documentation page" disabled={index >= history.length - 1} onClick={() => { setIndex(i => i + 1); setNavigation(false); }}>→</button><label className="learn-search">Search documentation<input type="search" placeholder="Try: counterbore, templates, PMI…" value={query} onChange={e => { setQuery(e.target.value); setNavigation(true); }} /></label><label className="learn-filter">Section<select value={section} onChange={e => { setSection(e.target.value); setNavigation(true); }}><option value="">All sections</option>{sections.map(s => <option key={s}>{s}</option>)}</select></label></div>
    <div className="learn-body" ref={boundsRef}>
      <nav className="learn-navigation" style={place('navigation')} aria-label="Documentation pages" hidden={layout.compact && !navigation}>
        {(query || section) ? <><p role="status">{results.length} pages found</p>{results.map(result => <button className="learn-result" key={result.id} aria-current={result.id === current.id ? 'page' : undefined} onClick={() => { go({ id: result.id }); setQuery(''); setSection(''); }}><strong>{result.title}</strong><small>{result.section}</small><span>{result.excerpt}…</span></button>)}{!results.length && <p>Try a feature name or fewer search terms.</p>}</> : <>
          <button className="learn-nav-home" onClick={() => go({ id: welcomePage })}>Getting started in Helios</button>
          {sections.map(group => <details key={group} open={group === page?.section || group === 'Tutorials'}><summary>{group}</summary>{Object.entries(pages).filter(([, p]) => p.section === group).sort(([a], [b]) => a.localeCompare(b)).map(([id, p]) => <button key={id} aria-current={id === current.id ? 'page' : undefined} onClick={() => go({ id })}>{p.title}</button>)}</details>)}
        </>}
      </nav>
      <article className="learn-article" ref={article} style={place('article')} aria-label={page?.title ?? current.id.split('/').at(-1)} hidden={layout.compact && navigation}>
        <div className="learn-prose">
          <p className="learn-breadcrumb">{page?.section ?? 'Example source'} <span> / </span> {page?.title ?? current.id.split('/').at(-1)}</p>
          {page?.section === 'Experimental' && <div className="learn-callout">Experimental: this material is outside the supported product.</div>}
          {lesson && <div className="learn-lesson-action"><div><strong>Lesson {lessons.indexOf(lesson) + 1} of 6 · about {lesson.minutes} min</strong><span>{lesson.summary}</span></div><a className="learn-primary" href={practiceUrl(lesson)} target="_blank" rel="noopener noreferrer">Practice in new tab ↗</a><small>The complete example opens in its own workspace.</small></div>}
          {lesson && <p className="learn-callout">In Helios: edit in Source, use Ctrl+Enter / Cmd+Enter to build, and inspect the viewport. The shell commands below are optional workflows for an installed Aetheris CLI.</p>}
          {(current.id === welcomePage || current.id === coursePage) && <section className="learn-course" aria-label="Guided lessons"><MachinaTextView text={{ kind: 'machina-text', text: '**Learn by building.** Six small projects, from your first hole to an assembly with Mates. Each opens beside a guided checklist.' }} /><div>{lessons.map((l, i) => <button key={l.id} onClick={() => go({ id: lessonPage(l) })}><small>0{i + 1} / {l.minutes} MIN</small><strong>{l.title}</strong><span>{l.summary}</span><em>{progress[l.id]?.length === 3 ? 'Completed ✓' : progress[l.id]?.length ? `${progress[l.id].length} of 3 steps` : 'Start lesson →'}</em></button>)}</div></section>}
          {file?.mediaType.startsWith('image/') ? <><h1>{current.id.split('/').at(-1)}</h1><img src={file.data} alt={current.id.split('/').at(-1)} /></> : file?.mediaType === 'text/plain' ? <><h1>{current.id.split('/').at(-1)}</h1><p>Complete source file. Some examples require companion modules or imported geometry; the six guided lessons are self-contained.</p><div className="learn-file-actions"><button onClick={() => void copy(file.data)}>Copy source</button><button onClick={() => downloadDocFile(current.id)}>Download source</button></div><pre><code>{file.data}</code></pre></> : <div className="learn-markdown" dangerouslySetInnerHTML={{ __html: rendered.html }} onClick={event => {
            const target = event.target as HTMLElement, link = target.closest<HTMLAnchorElement>('a');
            if (link?.dataset.doc) { event.preventDefault(); go({ id: link.dataset.doc, anchor: link.dataset.anchor }); }
            else if (link?.dataset.anchor !== undefined) { event.preventDefault(); go({ id: current.id, anchor: link.dataset.anchor }); }
            const button = target.closest<HTMLElement>('[data-copy-code]');
            if (button) void copy(button.closest('.learn-code')?.querySelector('code')?.textContent ?? '');
          }} />}
          {lesson && <footer className="learn-lesson-footer">{lessons.indexOf(lesson) > 0 && <button onClick={() => go({ id: lessonPage(lessons[lessons.indexOf(lesson) - 1]) })}>← Previous lesson</button>}{lessons.indexOf(lesson) < lessons.length - 1 && <button onClick={() => go({ id: lessonPage(lessons[lessons.indexOf(lesson) + 1]) })}>Next lesson →</button>}</footer>}
          <p className="learn-version">Bundled manual · {Object.keys(pages).length} pages</p>
        </div>
      </article>
      <nav className="learn-contents" style={place('contents')} aria-label="On this page" hidden={bounds.width < 1200}><strong>On this page</strong>{rendered.headings.filter(h => h.depth > 1 && h.depth < 4).map(h => <button key={h.id} style={{ paddingLeft: h.depth === 3 ? 20 : 10 }} onClick={() => go({ id: current.id, anchor: h.id })}>{h.title}</button>)}</nav>
    </div><div className="learn-notice" role="status">{notice || 'Read locally. Build with Aetheris. Keep the source.'}</div>
  </div>;
  return onClose ? <dialog className="learn-dialog" ref={root} aria-label="Learn Firmament" onCancel={event => { event.preventDefault(); onClose(); }}>{body}</dialog> : body;
}
