import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ProjectIdParam } from '@/shared/decorators/project-id-param.decorator';
import { AssignVariantService } from './assign-variant.service';
import { AssignVariantQueryDto } from './dto/assign-variant-query.dto';

@ProjectIdParam('projectId')
@Controller('projects/:projectId/experiments/:id/assign')
export class AssignVariantController {
  constructor(private readonly assignVariantService: AssignVariantService) {}

  @Get()
  assign(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AssignVariantQueryDto,
  ) {
    return this.assignVariantService.assign(projectId, id, query.userId);
  }
}
