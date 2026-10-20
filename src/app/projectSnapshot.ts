export interface ProjectSnapshot { root: string; documents: Record<string, string>; referenceIds?: string[] }
export const cloneProject = (project: ProjectSnapshot): ProjectSnapshot => ({ ...project, root: project.root, documents: Object.assign(Object.create(null), project.documents), ...(project.referenceIds ? { referenceIds: [...project.referenceIds] } : {}) });

export interface EditableWorkspace {
  id: string;
  busy?: boolean;
  snapshot(): { project: ProjectSnapshot; revision: number };
  apply(project: ProjectSnapshot, expectedRevision: number, label: string): Promise<boolean>;
}
