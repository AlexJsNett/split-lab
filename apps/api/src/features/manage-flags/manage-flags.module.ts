import { Module } from '@nestjs/common';
import { ManageFlagsService } from './manage-flags.service';
import { ManageFlagsController } from './manage-flags.controller';

@Module({
  controllers: [ManageFlagsController],
  providers: [ManageFlagsService],
})
export class ManageFlagsModule {}
