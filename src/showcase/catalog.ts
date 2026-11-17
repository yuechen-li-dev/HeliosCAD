import examples from './examples.json';

export interface ShowcaseExample {
  id: string;
  title: string;
  cardTitle?: string;
  tier: 'basic' | 'advanced';
  category: string;
  description: string;
  root: string;
  thumbnail: string;
  kind: 'Part' | 'Assembly' | 'Scene';
}

export interface WorkspaceProject {
  title: string;
  root: string;
  documents: Record<string, string>;
  exampleId?: string;
  lessonId?: string;
}

export const showcaseExamples: readonly ShowcaseExample[] =
  (examples as Omit<ShowcaseExample, 'thumbnail'>[]).map(example => ({
    ...example,
    thumbnail: `/previews/showcase/wireframes/${example.id}.svg`,
  }));

const sources = import.meta.glob<string>('../../fixtures/showcase/**/*.{firmament,firmasm}', { query: '?raw', import: 'default' });

/** Load intact source documents. Only Aetheris resolves includes and geometry. */
export async function loadShowcase(id: string): Promise<WorkspaceProject> {
  const example = showcaseExamples.find(item => item.id === id);
  if (!example) throw new Error('This example is unavailable. Choose another project.');
  const prefix = `../../fixtures/showcase/${id}/`;
  const files = Object.entries(sources).filter(([path]) => path.startsWith(prefix));
  if (!files.some(([path]) => path === prefix + example.root)) throw new Error(`Example source is missing: ${example.root}`);
  const documents = Object.fromEntries(await Promise.all(files.map(async ([path, read]) => [path.slice(prefix.length), await read()])));
  return { title: example.title, root: example.root, documents, exampleId: id };
}
