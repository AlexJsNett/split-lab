import type { Project } from '@/entities/project/domain/project';

declare global {
  namespace Express {
    interface Request {
      project?: Project;
    }
  }
}

export {};
