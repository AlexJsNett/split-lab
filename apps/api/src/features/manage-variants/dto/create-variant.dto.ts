import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsInt()
  @Min(0)
  @Max(100)
  weight: number;
}
