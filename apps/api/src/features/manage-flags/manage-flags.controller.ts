import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ProjectIdParam } from '@/shared/decorators/project-id-param.decorator';
import { ManageFlagsService } from './manage-flags.service';
import { CreateFeatureFlagDto } from './dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from './dto/update-feature-flag.dto';

@ProjectIdParam('projectId')
@Controller('projects/:projectId/flags')
export class ManageFlagsController {
  constructor(private readonly manageFlagsService: ManageFlagsService) {}

  @Post()
  create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateFeatureFlagDto,
  ) {
    return this.manageFlagsService.create(projectId, dto);
  }

  @Get()
  findAll(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.manageFlagsService.findAll(projectId);
  }

  @Get(':id')
  findOne(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.manageFlagsService.findOne(projectId, id);
  }

  @Patch(':id')
  update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFeatureFlagDto,
  ) {
    return this.manageFlagsService.update(projectId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.manageFlagsService.remove(projectId, id);
  }
}
