import { IsOptional, IsString } from 'class-validator';

export class DeliverLostFoundDto {
  /** Person the item was handed to (تسليم المفقود). */
  @IsString()
  deliveredTo!: string;

  @IsOptional()
  @IsString()
  deliveredPhone?: string;

  @IsOptional()
  @IsString()
  deliveredNote?: string;
}
