import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class GenerateMonthTemplateDto {
  /** Day of week (0 = Sunday .. 6 = Saturday). */
  @Transform(({ value }) => (value == null || value === '' ? value : parseInt(value, 10)))
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  /** Start time — HH:mm. */
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  /** End time — HH:mm. */
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;
}

export class GenerateMonthDto {
  /** Module type (class | spa | inbody). */
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(['class', 'spa', 'inbody', 'nutrition'])
  moduleType!: 'class' | 'spa' | 'inbody' | 'nutrition';

  /** Target month — yyyy-mm. */
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in yyyy-mm format' })
  month!: string;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  branchId?: number;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  trainerId?: number;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  @Min(1)
  capacity?: number;

  /** Weekly recurrence templates applied across the month. */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GenerateMonthTemplateDto)
  templates!: GenerateMonthTemplateDto[];
}
