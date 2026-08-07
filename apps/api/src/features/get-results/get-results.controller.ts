import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ProjectIdParam } from '@/shared/decorators/project-id-param.decorator';
import { GetResultsService } from './get-results.service';

@ProjectIdParam('projectId')
@Controller('projects/:projectId/experiments/:id/results')
export class GetResultsController {
  constructor(private readonly getResultsService: GetResultsService) {}

  @Get()
  getResults(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.getResultsService.getResults(projectId, id);
  }
}
