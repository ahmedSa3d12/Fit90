import { ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { BOOKING_STATUSES, BookingStatusValue } from './list-booking.dto';

const toIntOrNull = ({ value }: { value: unknown }) =>
  value == null || value === '' ? null : parseInt(String(value), 10);

export class CreateBookingDto {
  /** The slot being booked. Service/employee/date are derived from it. */
  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  scheduleId!: number;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  memberId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memberName?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** Reception may create an already-confirmed booking; members default to pending. */
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(BOOKING_STATUSES)
  status?: BookingStatusValue;

  /** Optional SPA add-ons; required add-ons are included automatically. */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @Transform(({ value }) => Array.isArray(value) ? value.map((item) => parseInt(String(item), 10)) : value)
  @IsInt({ each: true })
  @Min(1, { each: true })
  additionalServiceIds?: number[];
}

export class UpdateBookingDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(BOOKING_STATUSES)
  status?: BookingStatusValue;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  memberId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memberName?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
