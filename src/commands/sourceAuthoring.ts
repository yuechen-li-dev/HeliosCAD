export function appendCenteredHole(source: string, target = 'Body'): string {
  const closingBrace = findFinalModelBrace(source);
  const suffix = source.slice(closingBrace);
  const prefix = source.slice(0, closingBrace).trimEnd();
  const name = nextHoleName(source);
  return `${prefix}\n    Modify ${target} {\n        Hole<Shaft> ${name} { On: +Z Center: Point2(0mm, 0mm) Diameter: 6mm End: ThroughAll }\n    }\n${suffix.startsWith('}') ? suffix : `}\n${suffix}`}`;
}

export function appendFaceDatum(source: string, selector: string): { source: string; selection: number } {
  if (!/^face\([+-][XYZ]\)$/.test(selector)) throw new Error('Only an axis face selector can be referenced as a datum.');
  let index = 1;
  while (source.includes(`SelectedFace${index}`)) index++;
  const pmi = /\bPmi\s*\{/.exec(source);
  if (pmi) {
    const close = findMatchingBrace(source, pmi.index + pmi[0].lastIndexOf('{'));
    const snippet = `\n        Datum SelectedFace${index} { Target: ${selector} }`;
    return { source: source.slice(0, close) + snippet + source.slice(close), selection: close + snippet.indexOf(selector) };
  }
  const close = findFinalModelBrace(source);
  const prefix = source.slice(0, close).trimEnd();
  const snippet = `\n    Pmi { Datum SelectedFace${index} { Target: ${selector} } }\n`;
  return { source: prefix + snippet + source.slice(close), selection: prefix.length + snippet.indexOf(selector) };
}

export function appendHoleWallDiameter(source: string, selector: string, diameterMm: number): { source: string; selection: number } {
  if (!selector || !Number.isFinite(diameterMm) || diameterMm <= 0) throw new Error('A qualified Hole wall and positive compiled diameter are required.');
  let index = 1;
  while (source.includes(`SelectedWall${index}`)) index++;
  const entry = `HoleDiameter SelectedWall${index} { Target: ${selector} Value: ${diameterMm}mm }`;
  const pmi = /\bPmi\s*\{/.exec(source);
  if (pmi) {
    const close = findMatchingBrace(source, pmi.index + pmi[0].lastIndexOf('{'));
    const snippet = `\n        ${entry}`;
    return { source: source.slice(0, close) + snippet + source.slice(close), selection: close + snippet.indexOf(selector) };
  }
  const close = findFinalModelBrace(source);
  const prefix = source.slice(0, close).trimEnd();
  const snippet = `\n    Pmi { ${entry} }\n`;
  return { source: prefix + snippet + source.slice(close), selection: prefix.length + snippet.indexOf(selector) };
}

export const helixModelSource = `Model HelixWitness {
    Units: mm
    WireForm Spring {
        Diameter: 2mm
        Material: Standard.Materials.StainlessSteel.304_Annealed
        StartFrame { Origin: [0mm, 0mm, 0mm]; Tangent: [1, 0, 0]; Up: [0, 0, 1] }
        Helix Winding {
            Radius: 6mm
            Turns: 1
            Pitch: 5mm
            Handedness: RightHanded
            StartPhase: 0deg
        }
    }
}
`;

export function insertBox(source: string, cursor: number): { source: string; selection: number } {
  const close = findFinalModelBrace(source);
  if (cursor > close || !/\bModel\s+\w+\s*\{/.test(source.slice(0, cursor))) throw new Error('Place the cursor inside a Model block to insert a box.');
  let index = 1;
  while (source.includes(`HeliosBox${index}`)) index++;
  const snippet = `\n    Box HeliosBox${index} { Size: [30mm, 20mm, 10mm] }\n`;
  const next = source.slice(0, cursor) + snippet + source.slice(cursor);
  return { source: next, selection: cursor + snippet.indexOf('30mm') };
}

function findFinalModelBrace(source: string) {
  let depth = 0;
  let lastTopLevelClose = -1;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) lastTopLevelClose = i;
  }
  if (lastTopLevelClose < 0) throw new Error('A top-level Firmament model block is required.');
  return lastTopLevelClose;
}

function findMatchingBrace(source: string, open: number) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return i;
  }
  throw new Error('The Pmi block is not closed.');
}

function nextHoleName(source: string) {
  let index = 1;
  while (source.includes(`HeliosHole${index}`)) index++;
  return `HeliosHole${index}`;
}
