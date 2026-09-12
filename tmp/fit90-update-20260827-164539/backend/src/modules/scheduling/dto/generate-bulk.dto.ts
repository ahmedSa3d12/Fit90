import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const toIntOrNull = ({ value }: { value: unknown }) =>
  value == null || value === '' ? null : parseInt(String(value), 10);

/**
 * Bulk day-fill: divide a working window into fixed-length slots separated by a
 * break. Emits slots for every date in `dates`, or for every matching weekday in
 * [dateFrom, dateTo] when `dates` is omitted.
 *
 * Example: 14:00–18:00, duration 20, break 5 → 14:00-14:20, 14:25-14:45, ...
 */
export class GenerateBulkDto {
  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(String(value), 10)))
  @IsInt()
  monthlyScheduleId?: number;

  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  serviceId!: number;

  /** Explicit dates (yyyy-mm-dd). Provide this OR dateFrom+dateTo(+weekdays). */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  dates?: string[];

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateFrom must be yyyy-mm-dd' })
  dateFrom?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateTo must be yyyy-mm-dd' })
  dateTo?: string;

  /** Optional weekday filter when using a date range (0=Sun..6=Sat). Empty = every day. */
  @IsOptional()
  @IsArray()
  @Transform(({ value }) =>
    value == null || value === ''
      ? undefined
      : (Array.isArray(value) ? value : [value]).map((v) => parseInt(String(v), 10)),
  )
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @IsString()
  @Matches(HHMM, { message: 'workStart must be HH:mm' })
  workStart!: string;

  @IsString()
  @Matches(HHMM, { message: 'workEnd must be HH:mm' })
  workEnd!: string;

  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  durationMin!: number;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? 0 : parseInt(String(value), 10)))
  @IsInt()
  @Min(0)
  breakMin?: number;

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
