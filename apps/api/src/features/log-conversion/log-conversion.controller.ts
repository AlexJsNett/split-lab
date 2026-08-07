import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ProjectIdParam } from '@/shared/decorators/project-id-param.decorator';
import { LogConversionService } from './log-conversion.service';
import { LogConversionDto } from './dto/log-conversion.dto';

@ProjectIdParam('projectId')
@Controller('projects/:projectId/experiments/:id/conversions')
export class LogConversionController {
  constructor(private readonly logConversionService: LogConversionService) {}

  @Post()
  logConversion(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LogConversionDto,
  ) {
    return this.logConversionService.logConversion(projectId, id, dto.userId);
  }
}
