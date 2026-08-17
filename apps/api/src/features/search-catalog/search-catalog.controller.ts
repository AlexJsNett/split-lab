import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ProjectIdParam } from '@/shared/decorators/project-id-param.decorator';
import { SearchCatalogService } from './search-catalog.service';
import { SearchQueryDto } from './dto/search-query.dto';

@ProjectIdParam('projectId')
@Controller('projects/:projectId/search')
export class SearchCatalogController {
  constructor(private readonly searchCatalogService: SearchCatalogService) {}

  @Get()
  search(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: SearchQueryDto,
  ) {
    return this.searchCatalogService.search(projectId, query);
  }
}
