import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TenantBootstrapService } from '../tenancy/tenant-bootstrap.service';
import { CustomerAuthGuard } from './customer-auth.guard';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      signOptions: { algorithm: 'HS256' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, TenantBootstrapService, CustomerAuthGuard],
  exports: [AuthService, TenantBootstrapService, CustomerAuthGuard],
})
export class AuthModule {}
