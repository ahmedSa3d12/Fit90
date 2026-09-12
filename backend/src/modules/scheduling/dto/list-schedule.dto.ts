import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { SERVICE_CATEGORIES, ServiceCategory } from './list-service.dto';

export const SCHEDULE_STATUSES = ['available', 'cancelled', 'hidden'] as const;
export type ScheduleStatus = (typeof SCHEDULE_STATUSES)[number];

const toIntOrUndef = ({ value }: { value: unknown }) =>
  value == null || value === '' ? undefined : parseInt(String(value), 10);

export class ListScheduleDto extends PaginationDto {
  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  monthlyScheduleId?: number;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  serviceId?: number;

  /** Filter by the service department/category (drives the isolated scheduling pages). */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(SERVICE_CATEGORIES)
  category?: ServiceCategory;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  employeeId?: number;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  roomId?: number;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  machineId?: number;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsIn([...SCHEDULE_STATUSES, 'all'])
  status?: ScheduleStatus | 'all';

  /** Inclusive date range — yyyy-mm-dd. */
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;

  /** When 'true', only slots that still have free capacity are returned. */
  @IsOptional()
  @IsIn(['true', 'false'])
  bookable?: 'true' | 'false';
}
