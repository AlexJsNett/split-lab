export interface FeatureFlag {
  id: string;
  projectId: string;
  key: string;
  description: string | null;
  enabled: boolean;
  rolloutPercent: number;
}
