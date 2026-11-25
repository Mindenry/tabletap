import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { FloorController, TablesController } from './floor.controller';
import { TableRequestsController } from './requests.controller';
import { FloorService } from './floor.service';

@Module({
  imports: [TenancyModule],
  controllers: [FloorController, TablesController, TableRequestsController],
  providers: [FloorService],
  exports: [FloorService],
})
export class FloorModule {}
