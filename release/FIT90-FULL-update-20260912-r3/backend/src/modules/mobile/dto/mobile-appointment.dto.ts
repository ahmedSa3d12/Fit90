import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const MOBILE_APPOINTMENT_CATEGORIES = ['spa', 'personal_training'] as const;
export type MobileAppointmentCategory = 'nutrition' | (typeof MOBILE_APPOINTMENT_CATEGORIES)[number];

export class MobileAppointmentCategoryQueryDto {
  @IsIn(MOBILE_APPOINTMENT_CATEGORIES)
  category!: (typeof MOBILE_APPOINTMENT_CATEGORIES)[number];
}

export class MobileAppointmentTrainerQueryDto extends MobileAppointmentCategoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId?: number;
}

export class MobileAppointmentScheduleQueryDto extends MobileAppointmentCategoryQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  trainerId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}

export class CreateMobileAppointmentBookingDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  scheduleId!: number;
}

export class MobileAppointmentBookingsQueryDto {
  @IsOptional()
  @IsIn(MOBILE_APPOINTMENT_CATEGORIES)
  category?: (typeof MOBILE_APPOINTMENT_CATEGORIES)[number];

  @IsOptional()
  @IsIn(['pending', 'confirmed', 'wait', 'completed', 'cancelled', 'no_show'])
  status?: 'pending' | 'confirmed' | 'wait' | 'completed' | 'cancelled' | 'no_show';

  @IsOptional()
  @IsIn(['upcoming', 'past', 'all'])
  scope?: 'upcoming' | 'past' | 'all';
}

/** Query DTOs for category-specific routes such as /spa and /personal-training. */
export class MobileDedicatedAppointmentTrainerQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId?: number;
}

export class MobileDedicatedAppointmentScheduleQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  trainerId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}

export class MobileDedicatedAppointmentBookingsQueryDto {
  @IsOptional()
  @IsIn(['pending', 'confirmed', 'wait', 'completed', 'cancelled', 'no_show'])
  status?: 'pending' | 'confirmed' | 'wait' | 'completed' | 'cancelled' | 'no_show';

  @IsOptional()
  @IsIn(['upcoming', 'past', 'all'])
  scope?: 'upcoming' | 'past' | 'all';
}
