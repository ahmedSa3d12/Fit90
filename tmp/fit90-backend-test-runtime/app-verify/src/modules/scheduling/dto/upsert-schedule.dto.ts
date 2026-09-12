import { IsDateString, IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { SCHEDULE_STATUSES, ScheduleStatus } from './list-schedule.dto';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const toIntOrUndef = ({ value }: { value: unknown }) =>
  value == null || value === '' ? undefined : parseInt(String(value), 10);
const toIntOrNull = ({ value }: { value: unknown }) =>
  value == null || value === '' ? null : parseInt(String(value), 10);

export class UpsertScheduleDto {
  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  monthlyScheduleId?: number;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  serviceId?: number;

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
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'slotDate must be yyyy-mm-dd' })
  slotDate?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'startTime must be HH:mm' })
  startTime?: string;

  @IsOptional()
  @IsString()
  @Matches(HHMM, { message: 'endTime must be HH:mm' })
  endTime?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  bookingStartAt?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  bookingEndAt?: string;

  @IsOptional()
  @Transform(toIntOrUndef)
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsIn(SCHEDULE_STATUSES)
  status?: ScheduleStatus;

  @IsOptional()
  @IsString()
  notes?: string;
}
