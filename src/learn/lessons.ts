export const lessons = [
  { id: 'first-part', title: 'A first part', page: '01-first-part.md', file: '01-plate.firmament', summary: 'Stock, units and a through hole.', minutes: 8,
    steps: ['Read the Model, Box and Hole declarations. Orbit the plate and find the hole.', 'Build the current source and inspect the finished plate.', 'Change the hole diameter from 8mm to 12mm. Build again and inspect the larger hole.'] },
  { id: 'profiles', title: 'Profiles', page: '02-profiles.md', file: '02-bracket-profile.firmament', summary: 'Construction guides, closed loops and extrusion.', minutes: 12,
    steps: ['Read how construction guides become the outer and inner Profile loops.', 'Build the source and inspect the L-shaped bracket and its hole.', 'Change the extrusion thickness. Rebuild and inspect it from the side.'] },
  { id: 'features', title: 'Manufacturing features', page: '03-features.md', file: '03-machined-block.firmament', summary: 'Bosses, pockets, holes and edge finishes.', minutes: 12,
    steps: ['Find the Base, Boss, Pocket and Hole operations inside Compose.', 'Build and inspect the raised pad, recessed pocket and different holes.', 'Change a hole diameter or pocket depth within the documented limits. Rebuild and inspect it.'] },
  { id: 'reuse', title: 'Reusable part families', page: '04-reuse.md', file: '04-plate-family.firmament', summary: 'Records, recipes, patterns and templates.', minutes: 15,
    steps: ['Follow PlateSpec through the Template and the named bolt Pattern.', 'Build and inspect the four-hole mounting plate.', 'Change the standard plate thickness. Rebuild and check the specialized part.'] },
  { id: 'requirements', title: 'Requirements & PMI', page: '05-requirements.md', file: '05-checked-plate.firmament', summary: 'Tolerances, datums, annotations and checks.', minutes: 12,
    steps: ['Read the toleranced boreDiameter, Pmi declarations and Assert checks.', 'Build the checked plate. Inspect the geometry and the available PMI.', 'Read how the tolerance and assertions differ. Try a failing Assert, read the diagnostic, then restore it and rebuild.'] },
  { id: 'assemblies', title: 'Assemblies & Mates', page: '06-assemblies.md', file: '06-post-on-plate.firmament', summary: 'Published frames and explicit relationships.', minutes: 15,
    steps: ['Find the Socket and Foot frames, the anchor and Interface<Fixed>.', 'Build the assembly and inspect the post sitting on the plate.', 'Change the plate specialization from thickness: 6mm to 10mm. Rebuild and check that the post follows.'] },
] as const;
export type Lesson = typeof lessons[number];
export const lessonPage = (lesson: Lesson) => `docs/public/learn/${lesson.page}`;
export const lessonFile = (lesson: Lesson) => `fixtures/Canonical/Learn/${lesson.file}`;
export function practiceUrl(lesson: Lesson) { return `/learn?practice=${encodeURIComponent(lesson.id)}`; }
