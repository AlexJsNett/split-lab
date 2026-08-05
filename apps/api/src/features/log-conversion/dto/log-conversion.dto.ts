import { IsNotEmpty, IsString } from 'class-validator';

export class LogConversionDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}
