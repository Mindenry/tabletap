import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { BillingService } from './billing.service';
import { BillsController, PaymentsController } from './billing.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [TenancyModule],
  controllers: [BillsController, PaymentsController],
  providers: [BillingService, PaymentsService],
  exports: [BillingService, PaymentsService],
})
export class BillingModule {}
