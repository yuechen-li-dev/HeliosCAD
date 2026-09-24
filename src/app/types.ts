import type { Diagnostic, ModelSession, RuntimeInfo } from '@aetheris/cad';

export type ThemeName = 'mars' | 'sirius';
export type BusyState = 'Initializing Aetheris Worker' | 'Building' | 'Rewriting source' | 'Exporting' | 'Worker failed' | null;
export type ViewMode = 'perspective' | 'orthographic';
export type DisplayMode = 'shaded' | 'edges' | 'wireframe';

export interface EditorSnapshot {
  model: ModelSession | null;
  runtimeInfo: RuntimeInfo | null;
  diagnostics: readonly Diagnostic[];
  selectedEntityId: string | null;
  selectedFaceId: string | null;
  busy: BusyState;
}
