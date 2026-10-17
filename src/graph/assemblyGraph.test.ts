import { describe, expect, it } from 'vitest';
import type { LanguageOutline } from '@aetheris/cad';
import twoLinkArm from './fixtures/two-link-arm.outline.json';
import articulated from './fixtures/articulated.outline.json';
import machine from './fixtures/executable-machine.outline.json';
import atlas from './fixtures/atlas-industrial.outline.json';
import chimera from './fixtures/chimera.outline.json';
import { assembliesOf, buildAssemblyGraph, jointOperation, layoutAssembly, portOf } from './assemblyGraph';

const outline = (json: unknown) => json as LanguageOutline;
const summary = (json: unknown, assembly?: string) => {
  const graph = buildAssemblyGraph(outline(json), assembly)!;
  const name = (id: string) => graph.parts.find(p => p.id === id)?.name ?? `?${id}`;
  return {
    parts: graph.parts.map(p => `${p.name}${p.definition ? ` = ${p.definition}` : ''} [${p.kind}${p.anchored ? ', anchored' : ''}] ${p.ports.map(x => x.key).join(',')}`),
    joints: graph.joints.map(j => `${j.name} ${j.kind}: ${j.a ? `${name(j.a.part)}.${j.a.port}` : '?'} -> ${j.b ? `${name(j.b.part)}.${j.b.port}` : '?'}`),
  };
};

describe('assembly graph', () => {
  it('reads parts, ports and joints of a simple arm', () => {
    expect(summary(twoLinkArm)).toEqual({
      parts: ['Base = ArmBase [part, anchored] Hinge', 'Link1 = ArmLink [part] Input,Output', 'Link2 = ArmLink [part] Input'],
      joints: ['Shoulder Revolute: Base.Hinge -> Link1.Input', 'Elbow Revolute: Link1.Output -> Link2.Input'],
    });
  });

  it('puts joints on the assembly frame onto a ground card and reads frames exposed by subassemblies', () => {
    expect(assembliesOf(outline(articulated)).map(a => a.name)).toEqual(['Articulated', 'Arm']);
    expect(summary(articulated)).toEqual({
      parts: ['Articulated [ground, anchored] Root', 'First = Arm [subassembly] Tool,Mount', 'Slider = Link<H:4mm> [part] Pivot.Frame',
        'Follower = Link<H:4mm> [part] Pivot.Frame', 'Second = Arm [subassembly] '],
      joints: ['Slide Prismatic: Articulated.Root.Frame -> Slider.Pivot.Frame', 'Follow Fixed: First.Tool -> Follower.Pivot.Frame',
        'Shoulder Revolute: Articulated.Root.Frame -> First.Mount'],
    });
    // The subassembly itself: its nested occurrence carries the joint's A end.
    expect(summary(articulated, 'Arm').joints).toEqual(['Elbow Revolute: Rigid.Tip.Frame -> Tip.Pivot.Frame']);
  });

  it('takes a Mate kind from its Interface definition', () => {
    expect(summary(machine).joints).toEqual(['PlaceA Axial: CellA.Port -> Frame.Left', 'PlaceB Axial: CellB.Port -> Frame.Right']);
    expect(buildAssemblyGraph(outline(machine))!.joints[0].definition).toBe('InstallCell');
  });

  it('lands a joint on a frame path at the port that holds it', () => {
    const graph = buildAssemblyGraph(outline(atlas))!;
    const wrist = graph.joints.find(j => j.name === 'WristMount')!;
    expect(wrist.b).toEqual({ part: expect.stringContaining('Gripper'), port: 'Input.Frame' });
    expect(portOf(graph, wrist.b!)?.key).toBe('Input.Frame');
    expect(graph.joints.map(j => j.kind)).toEqual(['Revolute', 'Revolute', 'Fixed', 'Prismatic', 'Prismatic']);
  });

  it('is absent for a part model', () => {
    expect(assembliesOf(outline(chimera))).toEqual([]);
    expect(buildAssemblyGraph(outline(chimera))).toBeNull();
  });

  it('lays the anchor out first and joints left to right', () => {
    const laid = layoutAssembly(buildAssemblyGraph(outline(twoLinkArm))!);
    const x = (name: string) => laid.find(p => p.name === name)!.x;
    expect(x('Base')).toBeLessThan(x('Link1'));
    expect(x('Link1')).toBeLessThan(x('Link2'));
  });

  it('writes a new joint between two ports with a unique name after the last joint', () => {
    const graph = buildAssemblyGraph(outline(twoLinkArm))!;
    const [base, link1] = graph.parts;
    expect(jointOperation(graph, 'Fixed', { part: link1.id, port: 'Output' }, { part: base.id, port: 'Hinge' }, outline(twoLinkArm))).toEqual({
      kind: 'insertDeclaration', parent: 'TwoLinkArm', after: 'TwoLinkArm/Elbow',
      source: 'Interface<Fixed> Link1Base { A: TwoLinkArm.Link1.Output; B: TwoLinkArm.Base.Hinge; }' });
    expect(jointOperation(graph, 'Fixed', { part: base.id, port: 'Hinge' }, { part: base.id, port: 'Hinge' }, outline(twoLinkArm))).toEqual({ reason: 'A joint connects two different parts.' });
  });
});
