export interface ShowcaseExample {
  id: string;
  title: string;
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
}

export const showcaseExamples: readonly ShowcaseExample[] = [
  { id: 'atlas', title: 'Industrial ATLAS', category: 'Robotics', description: 'An industrial robot assembly with shared components and precise placement.', root: 'atlas-industrial.firmament', thumbnail: '/previews/showcase/wireframes/atlas.svg', kind: 'Assembly' },
  { id: 'guitar', title: 'Sunburst electric guitar', category: 'Product design', description: 'Carved surfaces, hardware and strings composed from a real multi-file project.', root: 'guitar.firmasm', thumbnail: '/previews/showcase/wireframes/guitar.svg', kind: 'Assembly' },
  { id: 'house', title: 'Warm-modern house', category: 'Spatial design', description: 'Rooms, openings, furniture and authored cameras in a composed Scene.', root: 'house.firmament', thumbnail: '/previews/showcase/wireframes/house.svg', kind: 'Scene' },
  { id: 'bracket', title: 'Mounting plate', category: 'Mechanical', description: 'A readable first model. Exact solid geometry and a source-linked through hole.', root: 'bracket.firmament', thumbnail: '/previews/showcase/wireframes/bracket.svg', kind: 'Part' },
  { id: 'bolt', title: 'CODEX threaded bolt', category: 'Mechanical', description: 'Continuous threaded stock, a hex head and an authored maker mark.', root: 'hexbolt-showcase.firmament', thumbnail: '/previews/showcase/wireframes/bolt.svg', kind: 'Part' },
];

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
