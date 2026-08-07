import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PROJECT_ID_PARAM_KEY } from '../decorators/project-id-param.decorator';

@Injectable()
export class ProjectOwnershipGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const paramName = this.reflector.getAllAndOverride<string>(
      PROJECT_ID_PARAM_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!paramName) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    if (!request.project) {
      // no authenticated project on the request (e.g. a @Public() route) —
      // nothing to compare against, ApiKeyGuard already decided whether
      // this request is allowed through
      return true;
    }

    const urlProjectId = request.params[paramName];
    if (urlProjectId !== request.project.id) {
      throw new ForbiddenException(
        'This API key does not have access to that project',
      );
    }

    return true;
  }
}
