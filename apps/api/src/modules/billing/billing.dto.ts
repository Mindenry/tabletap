import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateBillDto {
  @IsUUID('4')
  tableSessionId!: string;
}

export class SplitGroupItemDto {
  @IsUUID('4')
  billItemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

export class SplitGroupDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SplitGroupItemDto)
  items!: SplitGroupItemDto[];
}

export class SplitBillDto {
  @IsIn(['EQUAL', 'AMOUNT', 'ITEMS'])
  mode!: 'EQUAL' | 'AMOUNT' | 'ITEMS';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(50)
  parts?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { each: true })
  @Min(0.01, { each: true })
  amounts?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SplitGroupDto)
  groups?: SplitGroupDto[];
}

export class CreatePaymentDto {
  @IsUUID('4')
  billId!: string;

  @IsIn(['CASH', 'PROMPTPAY', 'CARD', 'OTHER'])
  method!: 'CASH' | 'PROMPTPAY' | 'CARD' | 'OTHER';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount?: number;

  @IsOptional()
  @IsUUID('4')
  splitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNote?: string;
}

export class ConfirmPaymentDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  amountPaid?: number;
}

export class RefundDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000_000)
  amount!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class CancelBillDto {
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}

export class BillQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  branchId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
