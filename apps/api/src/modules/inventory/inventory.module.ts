import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { InventoryController, RecipesController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [TenancyModule],
  controllers: [InventoryController, RecipesController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
