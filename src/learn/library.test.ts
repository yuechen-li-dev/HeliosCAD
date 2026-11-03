import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { files, pages, renderDoc, resolveDocLink, searchDocs } from './library';
import { lessons, lessonFile, lessonPage } from './lessons';
import { learningLayout } from './learningLayout';
import { readProgress } from './progress';

describe('offline Firmament manual', () => {
  it('ships the full current reference and byte-equivalent canonical practice sources', () => {
    expect(Object.keys(pages).length).toBeGreaterThan(130);
    for (const lesson of lessons) {
      expect(pages[lessonPage(lesson)]).toBeDefined();
      expect(files[lessonFile(lesson)].data).toBe(readFileSync(`../Aetheris/${lessonFile(lesson)}`, 'utf8').replaceAll('\r\n', '\n'));
      expect(resolveDocLink(lessonPage(lesson), `../../../${lessonFile(lesson)}`)?.id).toBe(lessonFile(lesson));
    }
    expect(pages['docs/public/reference/language/assemblies-and-motion.md']).toBeDefined();
    expect(Object.keys(pages).some(p => p.includes('development/'))).toBe(false);
  });
  it('searches every term, prioritizes titles, and filters experimental material', () => {
    const matches = searchDocs('hole counterbore');
    expect(matches.length).toBeGreaterThan(1);
    expect(matches.every(p => (p.markdown + p.title).toLowerCase().includes('counterbore'))).toBe(true);
    expect(searchDocs('reuse')[0].title.toLowerCase()).toContain('reuse');
    expect(searchDocs(' ', 'Experimental').every(p => p.section === 'Experimental')).toBe(true);
    expect(searchDocs('no-such-feature-xyz')).toHaveLength(0);
  });
  it('renders every shipped page with unique heading anchors', () => {
    for (const [id, page] of Object.entries(pages)) {
      const result = renderDoc(id, page.markdown);
      expect(new Set(result.headings.map(h => h.id)).size, id).toBe(result.headings.length);
      expect(result.html, id).not.toMatch(/<script\b|<iframe\b/);
    }
  });
  it('keeps reference/source/directory links internal and sanitizes raw HTML', () => {
    expect(resolveDocLink('docs/public/learn/01-first-part.md', '../reference/language/README.md')?.id).toBe('docs/public/reference/language/README.md');
    expect(resolveDocLink('helios/learning.md', '../../docs/public/learn/README.md')?.id).toBe('docs/public/learn/README.md');
    expect(resolveDocLink('docs/public/learn/README.md', '../../../fixtures/Canonical/Learn/')?.id).toBe('fixtures/Canonical/Learn/');
    const html = renderDoc('docs/public/learn/README.md', '# Hello\n\n## Same\n\n## Same\n\n[x](../reference/language/README.md)\n\n[x](javascript:alert(1))\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n```firmament\nModel <T> {}\n```').html;
    expect(html).toContain('data-doc="docs/public/reference/language/README.md"');
    expect(html).toContain('id="same-1"');
    expect(html).toContain('Model &lt;T&gt;');
    expect(html).not.toMatch(/<script|onerror=|href="javascript:/);
  });
  it('provides non-overlapping desktop and mobile reading regions', () => {
    for (const width of [390, 759, 760, 1100, 1600]) {
      for (const navigation of [false, true]) {
        const layout = learningLayout(width, 700, navigation), nav = layout.rect('navigation'), body = layout.rect('article'), toc = layout.rect('contents');
        expect(nav.width + body.width + toc.width).toBeCloseTo(width);
        expect(body.width).toBeGreaterThanOrEqual(0);
        expect(body.x).toBeCloseTo(nav.width);
        expect(toc.x).toBeCloseTo(body.x + body.width);
      }
    }
  });
  it('rejects malformed persisted progress without breaking documentation', () => {
    localStorage.setItem('helios.learning.progress.v1', JSON.stringify({ 'first-part': [0, 0, 1, '2', 3, -1], profiles: 'bad' }));
    expect(readProgress()).toEqual({ 'first-part': [0, 1] });
    localStorage.setItem('helios.learning.progress.v1', 'broken'); expect(readProgress()).toEqual({});
    localStorage.removeItem('helios.learning.progress.v1');
  });
});
