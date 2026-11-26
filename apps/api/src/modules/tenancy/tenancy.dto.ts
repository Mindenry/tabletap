import { Transform, Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const HEX_COLOR = /^#([0-9a-fA-F]{6})$/;

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  logoUrl?: string;
}

export class CreateBranchDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @Matches(/^[A-Z0-9_-]{2,12}$/, { message: 'code must be 2-12 uppercase letters, digits, _ or -' })
  code!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @IsBoolean()
  vatInclusive?: boolean;

  @IsOptional()
  @IsBoolean()
  serviceChargeEnabled?: boolean;

  @IsOptional()
  @IsIn(['PERCENT', 'FIXED'])
  serviceChargeType?: 'PERCENT' | 'FIXED';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  serviceChargeValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  promptPayId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promptPayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  receiptHeader?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  receiptFooter?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE'])
  status?: 'ACTIVE' | 'INACTIVE';
}

export class UpdateBranchDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  vatRate?: number;

  @IsOptional()
  @IsBoolean()
  vatInclusive?: boolean;

  @IsOptional()
  @IsBoolean()
  serviceChargeEnabled?: boolean;

  @IsOptional()
  @IsIn(['PERCENT', 'FIXED'])
  serviceChargeType?: 'PERCENT' | 'FIXED';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  serviceChargeValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  promptPayId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promptPayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  receiptHeader?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  receiptFooter?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INACTIVE', 'ARCHIVED'])
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
}

export class InviteStaffDto {
  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @IsString()
  @IsIn(['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'WAITER', 'VIEWER'])
  role!: string;

  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  branchIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class UpdateStaffDto {
  @IsOptional()
  @IsString()
  @IsIn(['OWNER', 'MANAGER', 'CASHIER', 'KITCHEN', 'WAITER', 'VIEWER'])
  role?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  branchIds?: string[];

  @IsOptional()
  @IsEnum(['ACTIVE', 'DEACTIVATED'])
  status?: 'ACTIVE' | 'DEACTIVATED';
}

export class UpdateTablePositionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TablePositionDto)
  tables!: TablePositionDto[];
}

export class TablePositionDto {
  @IsUUID('4')
  id!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  posX!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  posY!: number;
}

export class ZoneDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(999)
  displayOrder?: number;
}
