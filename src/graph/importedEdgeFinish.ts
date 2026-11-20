import type { LanguageEditOperation, LanguageOutline, OutlineField, SelectionDescription, SemanticSchema } from '@aetheris/cad';
import { stepTextSha256 } from '../app/localProject';

export interface ImportedFinishTarget {
  readonly body: string;
  readonly selector: string;
  readonly entity: string;
  readonly topology: 'Edge' | 'Face';
  readonly assetPath: string;
  readonly pick: SelectionDescription;
}

export function supportsImportedFinish(schema: SemanticSchema | null | undefined): boolean {
  return schema?.constructs.some(construct => construct.name === 'EdgeFinish' &&
    construct.fields.some(field => field.name.toLowerCase() === 'target' && field.choices?.includes('SingleEdge'))) ?? false;
}

export function importedFinishTarget(outline: LanguageOutline | null, pick: SelectionDescription | null,
  assetPath: string | undefined): ImportedFinishTarget | null {
  if (!assetPath || pick?.sourceAddressability !== 'ImportedStable' || !pick.selector ||
    (pick.topologyKind !== 'Edge' && pick.topologyKind !== 'Face')) return null;
  const match = /^([A-Za-z_]\w*)\.(edge|face)\("(#[1-9]\d*)"\)$/i.exec(pick.selector);
  if (!match || match[2]!.toLowerCase() !== pick.topologyKind.toLowerCase()) return null;
  const body = outline?.nodes.find(node => node.kind === 'InlineStep' && node.name === match[1]);
  if (!body) return null;
  return { body: body.id, topology: pick.topologyKind, selector: pick.selector, entity: match[3]!, assetPath, pick };
}

type ImportedDeclaration = { readonly id: string; readonly fields: readonly Pick<OutlineField, 'name' | 'text'>[] };

export function geometryOnly(node: ImportedDeclaration | undefined): boolean {
  return node?.fields.some(field => field.name.toLowerCase() === 'geometryonly' && field.text.trim().toLowerCase() === 'true') ?? false;
}

/** These changes and the finish publish together only after an accepted preview. */
export async function importedFinishPrerequisites(node: ImportedDeclaration, target: Pick<ImportedFinishTarget, 'assetPath'>, document: string,
  documents: Readonly<Record<string, string>>): Promise<LanguageEditOperation[]> {
  const changes: LanguageEditOperation[] = [];
  if (!node.fields.some(field => ['sha256', 'textsha256'].includes(field.name.toLowerCase()))) {
    const asset = document.split('/').slice(0, -1);
    for (const segment of target.assetPath.split('/')) {
      if (segment === '..') asset.pop();
      else if (segment && segment !== '.') asset.push(segment);
    }
    const original = documents[asset.join('/')];
    if (original === undefined) throw new Error('Reopen the workspace with its original STEP file before applying a finish.');
    changes.push({ kind: 'setField', node: node.id, field: 'textSha256', value: JSON.stringify(await stepTextSha256(original)) });
  }
  if (!geometryOnly(node)) changes.push({ kind: 'setField', node: node.id,
    field: node.fields.find(field => field.name.toLowerCase() === 'geometryonly')?.name ?? 'geometryOnly', value: 'true' });
  return changes;
}
