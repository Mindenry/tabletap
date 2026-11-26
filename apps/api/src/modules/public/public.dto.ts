import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

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

export class ProviderWebhookDto {
  /** The provider's own event id; the ingest is idempotent on this value. */
  @IsString()
  @MaxLength(120)
  eventId!: string;

  /** The payment reference the provider was given (PAY-...). */
  @IsString()
  @MaxLength(80)
  reference!: string;

  @IsIn(['PAID', 'FAILED', 'EXPIRED'])
  status!: 'PAID' | 'FAILED' | 'EXPIRED';

  /** Decimal string, e.g. "731.50". Defaults to the payment amount when absent. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  amount?: string;

  @IsOptional()
  @IsISO8601()
  paidAt?: string;
}
