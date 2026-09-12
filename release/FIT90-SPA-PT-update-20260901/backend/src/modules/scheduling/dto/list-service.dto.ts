import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export const SERVICE_CATEGORIES = [
  'class',
  'zumba',
  'nutrition',
  'spa',
  'personal_training',
  'inbody',
  'additional',
] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

export class ListServiceDto extends PaginationDto {
  /** Category filter for the independently managed service departments. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(SERVICE_CATEGORIES)
  category?: ServiceCategory;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  branchId?: number;

  /** 'true' | 'false' | 'all' — filter by active flag. */
  @IsOptional()
  @IsIn(['true', 'false', 'all'])
  active?: 'true' | 'false' | 'all';
}
