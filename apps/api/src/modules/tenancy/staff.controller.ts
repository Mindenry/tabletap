import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentStaff, RequirePermissions } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { actorFrom } from '../../common/actor';
import { TenancyService } from './tenancy.service';
import { InviteStaffDto, UpdateStaffDto } from './tenancy.dto';

@ApiTags('staff')
@ApiBearerAuth()
@Controller('staff')
export class StaffController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get()
  @RequirePermissions('staff.read')
  list(@CurrentStaff() principal: StaffPrincipal) {
    return this.tenancy.listStaff(principal);
  }

  @Get('invitations')
  @RequirePermissions('staff.read')
  invitations(@CurrentStaff() principal: StaffPrincipal) {
    return this.tenancy.listInvitations(principal);
  }

  @Post('invitations')
  @RequirePermissions('staff.invite')
  invite(@CurrentStaff() principal: StaffPrincipal, @Body() dto: InviteStaffDto, @Req() req: Request) {
    return this.tenancy.inviteStaff(principal, dto, actorFrom(req));
  }

  @Delete('invitations/:id')
  @RequirePermissions('staff.invite')
  @HttpCode(204)
  async revokeInvitation(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.tenancy.revokeInvitation(principal, id, actorFrom(req));
  }

  @Patch(':id')
  @RequirePermissions('staff.update')
  update(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @Req() req: Request,
  ) {
    return this.tenancy.updateStaff(principal, id, dto, actorFrom(req));
  }
}
