import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { MobileDedicatedAppointmentBookingsQueryDto } from './mobile-appointment.dto';

export class MobileNutritionScheduleQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  serviceId?: number;

  @Type(() => Number) @IsInt() @Min(1)
  trainerId!: number;

  @Type(() => Number) @IsInt() @Min(2000) @Max(2100)
  year!: number;

  @Type(() => Number) @IsInt() @Min(1) @Max(12)
  month!: number;
}

export class MobileNutritionEligibilityQueryDto {
  @Type(() => Number) @IsInt() @Min(1)
  serviceId!: number;

  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;
}

export class CreateMobileNutritionBookingDto {
  @Type(() => Number) @IsInt() @Min(1)
  availabilitySlotId!: number;

  @Type(() => Number) @IsInt() @Min(1)
  serviceId!: number;

  @IsString() @Matches(/^\d{2}:\d{2}(?::\d{2})?$/)
  startTime!: string;

  @IsOptional() @IsString() @MaxLength(1000)
  notes?: string;
}

export class MobileNutritionBookingsQueryDto extends MobileDedicatedAppointmentBookingsQueryDto {}