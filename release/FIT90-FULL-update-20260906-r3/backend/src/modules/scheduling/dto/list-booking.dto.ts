import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { SERVICE_CATEGORIES, ServiceCategory } from './list-service.dto';

export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'wait',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type BookingStatusValue = (typeof BOOKING_STATUSES)[number];

const toIntOrUndef = ({ value }: { value: unknown }) =>
  value == null || value === '' ? undefined : parseInt(String(value), 10);

export class ListBookingDto extends PaginationDto {
  /** Drives the per-department booking pages (Classes / Nutrition / SPA / Personal Training). */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(SERVICE_CATEGORIES)
  category?: ServiceCategory;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  serviceId?: number;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  scheduleId?: number;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  availabilitySlotId?: number;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  employeeId?: number;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  memberId?: number;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  branchId?: number;

  @IsOptional()
  @IsIn([...BOOKING_STATUSES, 'all'])
  status?: BookingStatusValue | 'all';

  /** Inclusive booking-date range — yyyy-mm-dd. */
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}
