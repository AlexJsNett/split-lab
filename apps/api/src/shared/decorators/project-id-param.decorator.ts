import { SetMetadata } from '@nestjs/common';

export const PROJECT_ID_PARAM_KEY = 'projectIdParam';
export const ProjectIdParam = (paramName: string) =>
  SetMetadata(PROJECT_ID_PARAM_KEY, paramName);
