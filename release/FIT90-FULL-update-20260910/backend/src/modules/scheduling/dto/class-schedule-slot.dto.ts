import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, Min } from 'class-validator';

export const CLASS_SCHEDULE_SLOT_STATUSES = [
  'available',
  'unavailable',
  'cancelled',
] as const;
export type ClassScheduleSlotStatusValue = (typeof CLASS_SCHEDULE_SLOT_STATUSES)[number];

export class CreateClassScheduleSlotDto {
  @IsDateString({ strict: true })
  startAt!: string;

  @IsDateString({ strict: true })
  endAt!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  bookingStartAt?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  bookingEndAt?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity!: number;

  @IsOptional()
  @IsIn(CLASS_SCHEDULE_SLOT_STATUSES)
  status?: ClassScheduleSlotStatusValue;
}

export class UpdateClassScheduleSlotDto {
  @IsOptional()
  @IsDateString({ strict: true })
  startAt?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  endAt?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  bookingStartAt?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  bookingEndAt?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsIn(CLASS_SCHEDULE_SLOT_STATUSES)
  status?: ClassScheduleSlotStatusValue;
}
