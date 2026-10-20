import { useEffect, useRef } from 'react';
import { SketchWorkspace, type SketchCallbacks } from '@aetheris/three-telos';

/** The compiler owns geometry and edit preparation; the application owns source transactions. */
export function SketchPanel({ revision, node, callbacks }: { revision: number; node: string | null; callbacks: SketchCallbacks }) {
  const host = useRef<HTMLDivElement>(null);
  const workspace = useRef<SketchWorkspace | null>(null);
  const current = useRef(callbacks); current.current = callbacks;
  useEffect(() => {
    const panel = new SketchWorkspace(host.current!, {
      project: id => current.current.project(id), preview: edit => current.current.preview(edit),
      apply: edit => current.current.apply(edit), source: span => current.current.source(span), close: () => current.current.close(),
    });
    workspace.current = panel;
    return () => { panel.dispose(); workspace.current = null; };
  }, []);
  useEffect(() => { void workspace.current?.load(revision, node); }, [revision, node]);
  return <div ref={host} />;
}
