import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Project } from '@/entities/project/domain/project';
import { Request } from 'express';

export const AuthProject = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Project => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.project as Project;
  },
);
