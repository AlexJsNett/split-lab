export interface FeatureFlag {
  id: string;
  projectId: string;
  key: string;
  enabled: boolean;
  rolloutPercent: number;
}
