import { Module } from '@nestjs/common';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CatalogService } from './catalog.service';
import { CategoriesController, MenuItemsController, ModifierGroupsController } from './menu.controller';

@Module({
  imports: [TenancyModule],
  controllers: [CategoriesController, MenuItemsController, ModifierGroupsController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
