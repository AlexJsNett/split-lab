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

  @Get()
  findAll() {
    return this.manageProjectsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.manageProjectsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.manageProjectsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.manageProjectsService.remove(id);
  }
}
