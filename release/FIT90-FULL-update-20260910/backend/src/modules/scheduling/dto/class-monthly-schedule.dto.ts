import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const CLASS_MONTHLY_SCHEDULE_STATUSES = ['draft', 'published', 'archived'] as const;
export type ClassMonthlyScheduleStatusValue =
  (typeof CLASS_MONTHLY_SCHEDULE_STATUSES)[number];

export class CreateClassMonthlyScheduleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  classId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  trainerId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}

export class ListClassMonthlySchedulesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  classId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  trainerId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @IsOptional()
  @IsIn(CLASS_MONTHLY_SCHEDULE_STATUSES)
  status?: ClassMonthlyScheduleStatusValue;
}
