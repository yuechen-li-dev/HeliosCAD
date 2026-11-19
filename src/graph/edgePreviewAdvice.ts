import type { Diagnostic, OutlineNode, SelectionDescription } from '@aetheris/cad';

/** Translate a compiler-owned face selector to EdgeFinish's face vocabulary. */
export function pickedRimFace(selection: SelectionDescription | null, body: OutlineNode | undefined): string | null {
  if (!body?.name || selection?.topologyKind !== 'Face' || selection.semanticEntityId !== body.name || !selection.selector) return null;
  // An extrusion cap can have a stable construction selector without its own source span.
  if (selection.sourceAddressability !== 'AuthoredStable' && selection.sourceAddressability !== 'DerivedStable') return null;
  if (body.kind === 'Box') return /^face\(([+-][XYZ])\)$/.exec(selection.selector)?.[1] ?? null;
  if (body.kind !== 'Extrude') return null;
  return ['Top', 'Bottom'].find(end => selection.selector === `face(${body.name}.${end})`) ?? null;
}

/** Explain a compiler refusal in terms of the controls the user can change. */
export function edgePreviewAdvice(
  diagnostics: readonly Diagnostic[], error: string, kind: 'fillet' | 'chamfer', singleEdge: boolean,
): string | null {
  const evidence = [
    error,
    ...diagnostics.filter(d => d.severity === 'error').map(d => `${d.code}: ${d.message} ${d.details ?? ''}`),
  ].join('\n');
  const size = kind === 'fillet' ? 'Radius' : 'Distance';
  const hole = /compose-face-hole:([\w.]+):(?:entry-or-existing-hole-clearance|exit-|no-contained-parallel-exit-support|tool-corridor-interaction)/.exec(evidence)?.[1];
  if (hole) {
    return `This ${kind} leaves too little clearance around the hole “${hole}”. Reduce the ${size}, or move the hole farther from this edge.`;
  }
  if (/ProfileBoundary(?:Chamfer|Fillet).*?Cavity|Finish.*(?:HoleClearance|CavityClearance)|crosses the edge of its entry face|clearance from the outer boundary or finish band/i.test(evidence)) {
    return `This ${kind} reaches an opening in the part. Reduce the ${size}, or move the opening farther from the finished edge.`;
  }

  const minimum = /Use a fillet Radius or chamfer Distance of at least ([\d.]+) mm/.exec(evidence)?.[1];
  if (minimum) return `Set ${size} to at least ${minimum} mm.`;
  if (/ProfileBoundary(?:ChamferDistance|FilletRadius)MustBePositive/.test(evidence)) {
    return `Set ${size} above 0 mm.`;
  }
  if (/radius is too large|adjacent edge|another boundary or finish|(?:Radius|Distance|Finish)(?:TooLarge|ExceedsHost)|InsetCollapse|bounded top-boundary finish size|BoxSingleEdgeSizeRejected/i.test(evidence)) {
    return `This ${size.toLowerCase()} is too large for the available material at the ${singleEdge ? 'selected edge' : 'face rim'}. Reduce the ${size} until the preview succeeds.`;
  }
  if (/compose-oriented-feature-not-admitted|Other Compose operations are not supported|CornerFinishHost/.test(evidence)) {
    return singleEdge
      ? 'This edge finish cannot be combined with the existing features. Click Iso and try an original straight corner along the extrusion. If that also fails, revise the interfering feature first.'
      : 'This face rim cannot be finished with the existing features. Try Finish an edge on an original straight corner instead.';
  }
  if (/ProfileBoundary(?:Chamfer|Fillet)InnerLoopUnsupported|polygonal outer profile without inner loops/.test(evidence)) {
    return 'This finish needs a simple outer outline. To round an outline with openings, edit its sketch and preview the extrusion.';
  }
  if (/ProfileBoundaryEdgeFinishFaceNotCap/.test(evidence)) {
    return 'Choose Top or Bottom in Face to finish an extrusion end. To finish a corner running along the extrusion, cancel and choose Finish an edge.';
  }
  if (/already finished or is curved|selected corner (?:is missing|no longer exists)|different original corner/.test(evidence)) {
    return 'This corner is already finished or has changed. Cancel and select an original straight corner, or edit the existing finish in Graph.';
  }
  if (/ProfileBoundaryFillet(?:LoopTopologyNotMaterialized|EndpointTerminationUnsupported|JunctionTopologyNotMaterialized)/.test(evidence)) {
    return 'This face rim cannot take a fillet. Try Chamfer face rim, or select a straight corner running along the extrusion.';
  }
  return null;
}

/** A pick can be useful for inspection even when it has no authored finish selector. */
export function edgeSelectionHelp(selection: SelectionDescription): string {
  if (selection.edgeFinish) return '';
  if (selection.sourceAddressability === 'ImportedStable') {
    return 'This edge comes from imported geometry. Open the original editable part to fillet or chamfer it here.';
  }
  if (selection.edgeFinishReason?.includes('picked-face holes')) {
    return 'The picked-face holes on this part cannot be combined with a corner finish. Try the finish on the original extrusion before placing the holes.';
  }
  return selection.edgeFinishReason ?? 'Choose an original straight outer edge on a Box or extrusion. To resize an existing finish, select it in Graph.';
}
