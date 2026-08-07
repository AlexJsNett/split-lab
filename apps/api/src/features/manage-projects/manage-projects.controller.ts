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
import { Public } from '@/shared/decorators/public.decorator';
import { ProjectIdParam } from '@/shared/decorators/project-id-param.decorator';
import { AuthProject } from '@/shared/decorators/auth-project.decorator';
import type { Project } from '@/entities/project/domain/project';
import { ManageProjectsService } from './manage-projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Controller('projects')
export class ManageProjectsController {
  constructor(private readonly manageProjectsService: ManageProjectsService) {}

  @Public()
  @Post()
  create(@Body() dto: CreateProjectDto) {
    return this.manageProjectsService.create(dto);
  }

  // Scoped to the authenticated project's own id — a key only ever "lists"
  // the one project it belongs to. Still an array (not a single object) to
  // keep the route/response shape stable if multi-project keys ever exist.
  @Get()
  findAll(@AuthProject() project: Project) {
    return this.manageProjectsService.findAll(project.id);
  }

  @ProjectIdParam('id')
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.manageProjectsService.findOne(id);
  }

  @ProjectIdParam('id')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.manageProjectsService.update(id, dto);
  }

  @ProjectIdParam('id')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.manageProjectsService.remove(id);
  }
}
