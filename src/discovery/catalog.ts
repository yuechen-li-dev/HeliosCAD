import { assemblySource, bracketSource, emptyModelSource } from '../sdk/samples';
import lampShadeSource from './sources/lamp-shade-loft.firmament?raw';
import lampAssemblySource from './sources/lamp-visible-intent.firmament?raw';
import lampBaseSource from './sources/lamp-base-intent.firmament?raw';
import counterboreSource from './sources/box-counterbore-chamfer.firmament?raw';
import openingSource from './sources/rounded-rectangle-opening.firmament?raw';

export interface GalleryModel {
  id: string;
  title: string;
  creator: string;
  category: string;
  description: string;
  tags: readonly string[];
  source: string;
  preview: string;
  publishedRevisionId?: string;
  downloadStep?: string;
  editablePartId?: string;
  supportingSource?: { name: string; source: string };
}

// These bundled examples are public samples, not user publications. Their source and
// preview are versioned together; private Telos projects never enter this list.
export const galleryModels: readonly GalleryModel[] = [
  { id: 'cartesian-lamp', title: 'Cartesian lamp', creator: 'Aetheris', category: 'Assemblies', description: 'Seven-part Firmament assembly. Explore the authored source and the qualified AP242 STEP; its editable shade is available separately.', tags: ['lamp', 'assembly', 'loft'], source: lampAssemblySource, preview: '/previews/lamp-visible-intent.png', downloadStep: '/models/lamp-visible-intent.step', editablePartId: 'lamp-shade-loft', supportingSource: { name: 'lamp-shade-loft.firmament', source: lampShadeSource } },
  { id: 'lamp-shade-loft', title: 'Cartesian lamp shade', creator: 'Aetheris', category: 'Surface', description: 'An offset loft between circular and elliptical sections, authored in Firmament.', tags: ['lamp', 'loft', 'surface'], source: lampShadeSource, preview: '/previews/lamp-shade-loft.png' },
  { id: 'lamp-base-intent', title: 'Lamp base', creator: 'Aetheris', category: 'Furniture', description: 'A sculpted support plate with a large opening and smaller mounting holes.', tags: ['lamp', 'base', 'profile'], source: lampBaseSource, preview: '/previews/lamp-base-intent.png' },
  { id: 'rounded-opening', title: 'Rounded opening', creator: 'Aetheris', category: 'Mechanical', description: 'A profiled plate with a rounded rectangular opening.', tags: ['slot', 'profile', 'plate'], source: openingSource, preview: '/previews/rounded-rectangle-opening.png' },
  { id: 'counterbore-chamfer', title: 'Counterbore and chamfer', creator: 'Aetheris', category: 'Mechanical', description: 'A block combining a counterbored through hole and finished edges.', tags: ['counterbore', 'chamfer', 'mechanical'], source: counterboreSource, preview: '/previews/box-counterbore-chamfer.png' },
  { id: 'web-bracket', title: 'Web bracket', creator: 'Aetheris', category: 'Mechanical', description: 'A mounting plate with a centered through hole. A small, useful first edit.', tags: ['bracket', 'hole', 'mechanical'], source: bracketSource, preview: '/previews/web-bracket.png' },
  { id: 'block-pair', title: 'Block pair', creator: 'Aetheris', category: 'Assemblies', description: 'Two placed occurrences made from one reusable cylindrical part.', tags: ['assembly', 'template', 'mechanical'], source: assemblySource, preview: '/previews/block-pair.png' },
  { id: 'first-solid', title: 'First solid', creator: 'Aetheris', category: 'Mechanical', description: 'A compact Box model with dimensions ready to change.', tags: ['box', 'starter', 'mechanical'], source: emptyModelSource, preview: '/previews/first-solid.png' },
];

export function findGalleryModel(id: string) { return galleryModels.find(model => model.id === id); }
export function searchGallery(models: readonly GalleryModel[], query: string, category: string) {
  const term = query.trim().toLocaleLowerCase();
  return models.filter(model => (category === 'All' || model.category === category) &&
    (!term || [model.title, model.creator, model.description, ...model.tags].some(value => value.toLocaleLowerCase().includes(term))));
}
