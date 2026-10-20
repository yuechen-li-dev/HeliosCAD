export interface ProjectSnapshot { root: string; documents: Record<string, string> }
export const cloneProject = (project: ProjectSnapshot): ProjectSnapshot => ({ root: project.root, documents: Object.assign(Object.create(null), project.documents) });

export interface EditableWorkspace {
  id: string;
  busy?: boolean;
  snapshot(): { project: ProjectSnapshot; revision: number };
  apply(project: ProjectSnapshot, expectedRevision: number, label: string): Promise<boolean>;
}
