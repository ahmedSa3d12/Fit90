import { ArrayMinSize, IsArray, IsDateString, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const toIntOrNull = ({ value }: { value: unknown }) =>
  value == null || value === '' ? null : parseInt(String(value), 10);

/**
 * Weekly recurrence: generate one slot per matching weekday between dateFrom and
 * dateTo (inclusive), each spanning [startTime, endTime).
 *
 * Example: weekdays [1] (Monday), 18:00–19:00, 2025-07-01 → 2025-07-31 → all
 * Mondays in July.
 */
export class GenerateRecurringDto {
  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(String(value), 10)))
  @IsInt()
  monthlyScheduleId?: number;

  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  serviceId!: number;

  /** Weekdays to emit on (0 = Sunday .. 6 = Saturday). */
  @IsArray()
  @ArrayMinSize(1)
  @Transform(({ value }) =>
    (Array.isArray(value) ? value : [value]).map((v) => parseInt(String(v), 10)),
  )
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays!: number[];

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom must be yyyy-mm-dd' })
  dateFrom!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo must be yyyy-mm-dd' })
  dateTo!: string;

  /** The clicked calendar date, used to preserve booking-window offsets. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'templateDate must be yyyy-mm-dd' })
  templateDate?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  bookingStartAt?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  bookingEndAt?: string;

  @IsString()
  @Matches(HHMM, { message: 'startTime must be HH:mm' })
  startTime!: string;

  @IsString()
  @Matches(HHMM, { message: 'endTime must be HH:mm' })
  endTime!: string;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  employeeId?: number | null;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  roomId?: number | null;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  machineId?: number | null;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  branchId?: number | null;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(String(value), 10)))
  @IsInt()
  @Min(1)
  capacity?: number;
}
