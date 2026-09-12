import { IsInt, IsNumberString, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

const toIntOrNull = ({ value }: { value: unknown }) =>
  value == null || value === '' ? null : parseInt(String(value), 10);
const toDecOrUndef = ({ value }: { value: unknown }) =>
  value == null || value === '' ? undefined : String(value);

export class UpsertInbodyRecordDto {
  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(String(value), 10)))
  @IsInt()
  memberId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memberName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'recordDate must be yyyy-mm-dd' })
  recordDate?: string;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  employeeId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  staffName?: string;

  /** Public URL of the uploaded PDF/image (from POST /api/uploads/:category). */
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  filePath?: string;

  @IsOptional()
  @Transform(toDecOrUndef)
  @IsNumberString()
  weight?: string;

  @IsOptional()
  @Transform(toDecOrUndef)
  @IsNumberString()
  bodyFat?: string;

  @IsOptional()
  @Transform(toDecOrUndef)
  @IsNumberString()
  muscleMass?: string;

  @IsOptional()
  @Transform(toDecOrUndef)
  @IsNumberString()
  bmi?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Transform(toIntOrNull)
  @IsInt()
  branchId?: number | null;
}
