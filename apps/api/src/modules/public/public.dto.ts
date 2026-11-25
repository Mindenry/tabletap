import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateCustomerSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  guestLabel?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  guestCount?: number;
}

export class CustomerRequestDto {
  @IsIn(['CALL_WAITER', 'REQUEST_BILL', 'REQUEST_WATER', 'REQUEST_UTENSILS', 'REPORT_ISSUE'])
  type!: 'CALL_WAITER' | 'REQUEST_BILL' | 'REQUEST_WATER' | 'REQUEST_UTENSILS' | 'REPORT_ISSUE';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CustomerCancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
