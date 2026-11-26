import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { OrdersModule } from '../orders/orders.module';
import { BillingModule } from '../billing/billing.module';
import { PublicController } from './public.controller';
import { PublicService } from './public.service';

@Module({
  imports: [AuthModule, CatalogModule, OrdersModule, BillingModule],
  controllers: [PublicController],
  providers: [PublicService],
  exports: [PublicService],
})
export class PublicModule {}
