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

  // NOTE: findAll() still returns every project in the system, regardless of
  // which API key is calling — @ProjectIdParam can't fix this (no :id in this
  // route to compare against). Flagged as an open question, not fixed here.
  @Get()
  findAll() {
    return this.manageProjectsService.findAll();
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
