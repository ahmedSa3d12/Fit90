import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpsertInbodyBookingDto {
  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  memberId?: number;

  @IsOptional()
  @IsString()
  memberName?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  slotId?: number;

  /** Booking date — yyyy-mm-dd. */
  @IsString()
  bookingDate!: string;

  /** Start time — HH:mm. */
  @IsOptional()
  @IsString()
  startTime?: string;

  /** End time — HH:mm. */
  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsString()
  staffName?: string;

  @IsOptional()
  @IsIn(['booked', 'completed', 'cancelled'])
  status?: 'booked' | 'completed' | 'cancelled';

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  branchId?: number;
}
