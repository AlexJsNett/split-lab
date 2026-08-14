import { Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ProjectIdParam } from '@/shared/decorators/project-id-param.decorator';
import { PushResultsService } from './push-results.service';

@ProjectIdParam('projectId')
@Controller('projects/:projectId/experiments/:id/results/push')
export class PushResultsController {
  constructor(private readonly pushResultsService: PushResultsService) {}

  @Post()
  push(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pushResultsService.pushResults(projectId, id);
  }
}
