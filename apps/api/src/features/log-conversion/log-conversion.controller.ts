import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { LogConversionService } from './log-conversion.service';
import { LogConversionDto } from './dto/log-conversion.dto';

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
