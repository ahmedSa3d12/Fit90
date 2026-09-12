import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const SERVICE_MONTHLY_CATEGORIES = ['nutrition', 'spa', 'personal_training'] as const;
export type ServiceMonthlyCategory = (typeof SERVICE_MONTHLY_CATEGORIES)[number];

export class CreateServiceMonthlyScheduleDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId!: number;

  @IsIn(SERVICE_MONTHLY_CATEGORIES)
  category!: ServiceMonthlyCategory;

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

export class ListServiceMonthlySchedulesDto {
  @IsOptional()
  @IsIn(SERVICE_MONTHLY_CATEGORIES)
  category?: ServiceMonthlyCategory;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employeeId?: number;
}
