export type ExperimentStatus = 'draft' | 'running' | 'completed';

export interface Experiment {
  id: string;
  projectId: string;
  flagId: string | null;
  name: string;
  status: ExperimentStatus;
}
