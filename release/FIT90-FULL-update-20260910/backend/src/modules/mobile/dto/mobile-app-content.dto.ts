import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class MobileCustomerLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  password!: string;
}

export class ChangeCustomerPasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(100)
  newPassword!: string;
}

export class DeleteCustomerAccountDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  password!: string;
}

export class CreateMobileTicketDto {
  @IsIn(['complaint', 'suggestion'])
  type!: 'complaint' | 'suggestion';

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  memberName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  memberId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  branchId?: number;
}

export class CreateMobileFeedbackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  memberName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  notes!: string;
}

export class CreateMobileInvitationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  inviteeName!: string;

  @IsOptional()
  @IsPhoneNumber(undefined)
  @MaxLength(30)
  inviteePhone?: string;

  @IsOptional()
  @IsIn(['male', 'female'])
  inviteeGender?: 'male' | 'female';

  @IsOptional()
  @IsInt()
  @Min(1)
  invitedById?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  invitedByName?: string;

  @IsOptional()
  @IsDateString()
  visitDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  branchId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
