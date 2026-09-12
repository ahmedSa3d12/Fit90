import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ListAvailabilityDto extends PaginationDto {
  /** Module type filter (class | spa | inbody). */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['class', 'spa', 'inbody', 'nutrition'])
  moduleType?: 'class' | 'spa' | 'inbody' | 'nutrition';

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  branchId?: number;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  trainerId?: number;

  /** Start of date range (inclusive) — yyyy-mm-dd. */
  @IsOptional()
  @IsString()
  dateFrom?: string;

  /** End of date range (inclusive) — yyyy-mm-dd. */
  @IsOptional()
  @IsString()
  dateTo?: string;
}
