import { IsInt, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpsertLostFoundDto {
  @IsString()
  itemName!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Staff member who logged / handled the item (الموظف). */
  @IsOptional()
  @IsString()
  staffName?: string;

  /** Date the item was found (التاريخ) — yyyy-mm-dd. */
  @IsString()
  foundDate!: string;

  /** Time the item was found (الوقت) — HH:mm. */
  @IsOptional()
  @IsString()
  foundTime?: string;

  /** Action taken (الإجراء المتخذ). */
  @IsOptional()
  @IsString()
  actionTaken?: string;

  @IsOptional()
  @Transform(({ value }) => (value == null || value === '' ? undefined : parseInt(value, 10)))
  @IsInt()
  branchId?: number;
}
