import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).+$/;

export class LoginDto {
  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class RegisterRestaurantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  restaurantName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  ownerName!: string;

  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: 'password must contain at least one letter and one number' })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  branchName?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: 'password must contain at least one letter and one number' })
  newPassword!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: 'password must contain at least one letter and one number' })
  newPassword!: string;
}

export class AcceptInvitationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: 'password must contain at least one letter and one number' })
  password!: string;
}

export class SwitchTenantDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;
}
