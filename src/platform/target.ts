/**
 * The build target. `artifact` is Helios served as a claude.ai artifact: one fixed page in a
 * sandboxed frame, no Helios server (no accounts, projects, publications or AI Author), routes
 * on a plain `#name`, and files saved through the viewer's download prompt.
 */
export const artifactBuild = import.meta.env.VITE_HELIOS_TARGET === 'artifact';
