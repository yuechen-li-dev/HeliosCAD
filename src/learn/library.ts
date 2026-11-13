import snapshot from './content.json';
import { Text } from 'machinalayout/text';
import { marked, Renderer } from 'marked';
import DOMPurify from 'dompurify';
import { saveFile } from '../platform/saveFile';

export type DocPage = { title: string; markdown: string; section: string };
export type DocFile = { mediaType: string; data: string };
export const pages: Record<string, DocPage> = snapshot.pages;
export const files: Record<string, DocFile> = snapshot.files;
export const contentVersion = snapshot.digest.slice(0, 12);
export const welcomePage = 'helios/learning.md';
export const coursePage = 'docs/public/learn/README.md';
export const referencePage = 'docs/public/reference/language/README.md';
export const sections = ['Tutorials', 'Using Helios', 'Language & reference', 'Modeling guides', 'Aetheris guides', 'Cookbook', 'SDK & integration', 'Experimental'];
export function resolveDocLink(from: string, href: string) {
  const aetheris = href.match(/^https:\/\/github\.com\/yuechen-li-dev\/Aetheris\/blob\/(?:master|main)\/(.+)$/i);
  const helios = href.match(/^https:\/\/github\.com\/yuechen-li-dev\/HeliosCAD\/blob\/(?:master|main)\/docs\/public\/(.+)$/i);
  if (aetheris) href = '/' + aetheris[1];
  else if (helios) href = '/helios/' + helios[1];
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return null;
  const url = new URL(href, `https://helios-docs.invalid/${from}`);
  const path = decodeURIComponent(url.pathname.slice(1));
  const id = pages[path] || files[path] ? path : pages[path + '/'] ? path + '/' : pages[path + '/README.md'] ? path + '/README.md' : null;
  return id ? { id, anchor: decodeURIComponent(url.hash.slice(1)) } : null;
}
export function searchDocs(query: string, section = '') {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return Object.entries(pages).filter(([, page]) => !section || page.section === section).map(([id, page]) => {
    const title = page.title.toLocaleLowerCase(), body = page.markdown.toLocaleLowerCase();
    const score = terms.every(term => title.includes(term) || body.includes(term)) ? terms.reduce((n, term) => n + (title.includes(term) ? 10 : 1), 0) : -1;
    const at = terms.length ? body.indexOf(terms[0]) : 0;
    const excerpt = page.markdown.slice(Math.max(0, at - 45), Math.max(0, at - 45) + 240).replace(/!?\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#`*\n|]/g, ' ').replace(/\s+/g, ' ').slice(0, 170);
    return { id, ...page, score, excerpt };
  }).filter(p => p.score >= 0).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
}
const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function renderDoc(id: string, markdown: string) {
  const headings: { id: string; title: string; depth: number }[] = [], counts = new Map<string, number>();
  const renderer = new Renderer();
  renderer.heading = function ({ text, tokens, depth }) {
    const title = text.replace(/<[^>]*>/g, '').replace(/[`*_]/g, '');
    const slug = Text.slug(title), count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    const anchor = slug + (count ? `-${count}` : '');
    headings.push({ id: anchor, title, depth });
    return `<h${depth} id="${escape(anchor)}" tabindex="-1">${this.parser.parseInline(tokens)}</h${depth}>`;
  };
  renderer.link = function ({ href, title, tokens }) {
    const internal = resolveDocLink(id, href);
    const text = this.parser.parseInline(tokens);
    if (internal) return `<a href="#${escape(internal.anchor)}" data-doc="${escape(internal.id)}" data-anchor="${escape(internal.anchor)}">${text}</a>`;
    if (href.startsWith('#')) return `<a href="${escape(href)}" data-anchor="${escape(href.slice(1))}">${text}</a>`;
    let url = href;
    // Links outside the shipped public manual remain explicit source-repository links.
    if (!/^[a-z][a-z\d+.-]*:|^\/\//i.test(href)) {
      const path = new URL(href, `https://helios-docs.invalid/${id}`).pathname.slice(1);
      url = id.startsWith('helios/') ? `https://github.com/yuechen-li-dev/HeliosCAD/blob/master/docs/public/${href}` : `https://github.com/yuechen-li-dev/Aetheris/blob/master/${path}`;
    }
    return `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer"${title ? ` title="${escape(title)}"` : ''}>${text}<span class="learn-external" aria-label="opens externally"> ↗</span></a>`;
  };
  renderer.image = function ({ href, text }) {
    const internal = resolveDocLink(id, href), file = internal ? files[internal.id] : null;
    // No remote image requests while reading the local manual.
    return file?.mediaType.startsWith('image/') ? `<img src="${escape(file.data)}" alt="${escape(text)}" loading="lazy" />` : `<span class="learn-image-note">${escape(text || 'Illustration available in source documentation')}</span>`;
  };
  renderer.code = ({ text, lang }) => `<div class="learn-code"><div><span>${escape(lang || 'text')}</span><button type="button" data-copy-code="true" aria-label="Copy code">Copy</button></div><pre><code>${escape(text)}</code></pre></div>`;
  const html = DOMPurify.sanitize(marked.parse(markdown, { renderer, async: false }), { FORBID_TAGS: ['style', 'iframe', 'form', 'input'], ADD_ATTR: ['target', 'tabindex'] });
  return { html, headings };
}
export function downloadDocFile(id: string) {
  const file = files[id];
  if (!file || file.mediaType !== 'text/plain') return;
  void saveFile(new Blob([file.data], { type: 'text/plain' }), id.split('/').at(-1)!).catch(error => console.error(error));
}
