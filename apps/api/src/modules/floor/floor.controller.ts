import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiProduces, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentStaff, RequirePermissions } from '../auth/decorators';
import type { StaffPrincipal } from '../auth/principal';
import { actorFrom } from '../../common/actor';
import { FloorService } from './floor.service';
import {
  CloseSessionDto,
  CreateTableDto,
  MarkAvailableDto,
  MergeTablesDto,
  MoveSessionDto,
  OpenSessionDto,
  UpdateTableDto,
} from './floor.dto';
import { TablePositionDto } from '../tenancy/tenancy.dto';

class ZoneBody {
  name!: string;
  displayOrder?: number;
}

@ApiTags('floor')
@ApiBearerAuth()
@Controller('branches/:branchId')
export class FloorController {
  constructor(private readonly floor: FloorService) {}

  @Get('zones')
  @RequirePermissions('table.read')
  zones(@CurrentStaff() principal: StaffPrincipal, @Param('branchId') branchId: string) {
    return this.floor.listZones(principal, branchId);
  }

  @Post('zones')
  @RequirePermissions('table.update')
  createZone(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('branchId') branchId: string,
    @Body() body: ZoneBody,
    @Req() req: Request,
  ) {
    return this.floor.createZone(principal, branchId, body, actorFrom(req));
  }

  @Patch('zones/:zoneId')
  @RequirePermissions('table.update')
  updateZone(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('branchId') branchId: string,
    @Param('zoneId') zoneId: string,
    @Body() body: ZoneBody,
    @Req() req: Request,
  ) {
    return this.floor.updateZone(principal, branchId, zoneId, body, actorFrom(req));
  }

  @Delete('zones/:zoneId')
  @RequirePermissions('table.update')
  async deleteZone(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('branchId') branchId: string,
    @Param('zoneId') zoneId: string,
  ): Promise<void> {
    await this.floor.deleteZone(principal, branchId, zoneId);
  }

  @Get('tables')
  @RequirePermissions('table.read')
  tables(@CurrentStaff() principal: StaffPrincipal, @Param('branchId') branchId: string) {
    return this.floor.listTables(principal, branchId);
  }

  @Post('tables')
  @RequirePermissions('table.update')
  createTable(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('branchId') branchId: string,
    @Body() dto: CreateTableDto,
    @Req() req: Request,
  ) {
    return this.floor.createTable(principal, branchId, dto, actorFrom(req));
  }

  @Patch('floor/positions')
  @RequirePermissions('table.update')
  updatePositions(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('branchId') branchId: string,
    @Body() body: { tables: TablePositionDto[] },
    @Req() req: Request,
  ) {
    return this.floor.updatePositions(
      principal,
      branchId,
      body.tables.map((table) => ({ id: table.id, posX: table.posX, posY: table.posY })),
      actorFrom(req),
    );
  }
}

@ApiTags('floor')
@ApiBearerAuth()
@Controller('tables')
export class TablesController {
  constructor(private readonly floor: FloorService) {}

  @Patch(':id')
  @RequirePermissions('table.update')
  update(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: UpdateTableDto,
    @Req() req: Request,
  ) {
    return this.floor.updateTable(principal, id, dto, actorFrom(req));
  }

  @Delete(':id')
  @RequirePermissions('table.update')
  async archive(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.floor.archiveTable(principal, id, actorFrom(req));
  }

  @Post(':id/open-session')
  @RequirePermissions('table.update')
  open(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: OpenSessionDto,
    @Req() req: Request,
  ) {
    return this.floor.openSession(principal, id, dto, actorFrom(req));
  }

  @Post(':id/close-session')
  @RequirePermissions('table.update', 'bill.create')
  close(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: CloseSessionDto,
    @Req() req: Request,
  ) {
    return this.floor.closeSession(principal, id, dto, actorFrom(req));
  }

  @Post(':id/move')
  @RequirePermissions('table.update')
  move(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: MoveSessionDto,
    @Req() req: Request,
  ) {
    return this.floor.moveSession(principal, id, dto, actorFrom(req));
  }

  @Post(':id/merge')
  @RequirePermissions('table.update')
  merge(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() dto: MergeTablesDto,
    @Req() req: Request,
  ) {
    return this.floor.mergeTables(principal, id, dto, actorFrom(req));
  }

  @Post(':id/cleaned')
  @RequirePermissions('table.update')
  cleaned(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Body() _body: MarkAvailableDto,
    @Req() req: Request,
  ) {
    return this.floor.markCleaned(principal, id, actorFrom(req));
  }

  @Post(':id/qr')
  @RequirePermissions('table.update')
  qr(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string) {
    return this.floor.ensureQr(principal, id);
  }

  @Post(':id/qr/rotate')
  @RequirePermissions('table.update')
  rotate(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.floor.rotateQr(principal, id, actorFrom(req));
  }

  @Post(':id/qr/revoke')
  @RequirePermissions('table.update')
  revoke(@CurrentStaff() principal: StaffPrincipal, @Param('id') id: string, @Req() req: Request) {
    return this.floor.revokeQr(principal, id, actorFrom(req));
  }

  @Get(':id/qr/download')
  @RequirePermissions('table.read')
  @ApiProduces('image/png', 'image/svg+xml')
  async download(
    @CurrentStaff() principal: StaffPrincipal,
    @Param('id') id: string,
    @Query('format') format: string,
    @Res() res: Response,
  ): Promise<void> {
    const type = format === 'svg' ? 'svg' : 'png';
    const image = await this.floor.qrImage(principal, id, type);
    res.setHeader('Content-Type', image.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${image.filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(image.buffer);
  }
}
