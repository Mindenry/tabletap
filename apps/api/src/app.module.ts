import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CsrfGuard, PermissionsGuard, StaffAuthGuard } from './modules/auth/guards';
import { CommonModule } from './common/common.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { MailModule } from './modules/mail/mail.module';
import { HealthController } from './modules/health/health.controller';
import { RequestContextInterceptor } from './common/request-context.interceptor';
import { env } from './config/env';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { FloorModule } from './modules/floor/floor.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { PromotionsModule } from './modules/promotions/promotions.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { OrdersModule } from './modules/orders/orders.module';
import { KitchenModule } from './modules/kitchen/kitchen.module';
import { BillingModule } from './modules/billing/billing.module';
import { PublicModule } from './modules/public/public.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PlatformModule } from './modules/platform/platform.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RedisModule } from './modules/redis/redis.module';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    RedisModule,
    AuditModule,
    MailModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: env.throttleTtlMs,
        limit: env.throttleLimit,
      },
    ]),
    RealtimeModule,
    AuthModule,
    TenancyModule,
    CatalogModule,
    FloorModule,
    InventoryModule,
    PromotionsModule,
    MetricsModule,
    OrdersModule,
    KitchenModule,
    BillingModule,
    PublicModule,
    AnalyticsModule,
    PlatformModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: StaffAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
  ],
})
export class AppModule {}
