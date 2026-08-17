import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SearchQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  q: string;

  @IsOptional()
  @IsIn(['experiment', 'flag'])
  type?: 'experiment' | 'flag';
}
