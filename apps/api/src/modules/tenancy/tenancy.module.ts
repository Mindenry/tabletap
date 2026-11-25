import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditController } from './audit.controller';
import { BranchAccessService } from './branch-access.service';
import { BranchesController } from './branches.controller';
import { EntitlementsService } from './entitlements.service';
import { StaffController } from './staff.controller';
import { TenancyService } from './tenancy.service';
import { TenantsController } from './tenants.controller';

@Module({
  imports: [AuthModule],
  controllers: [TenantsController, BranchesController, StaffController, AuditController],
  providers: [TenancyService, BranchAccessService, EntitlementsService],
  exports: [TenancyService, BranchAccessService, EntitlementsService],
})
export class TenancyModule {}
