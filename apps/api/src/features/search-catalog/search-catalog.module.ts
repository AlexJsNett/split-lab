import { Module } from '@nestjs/common';
import { SearchCatalogController } from './search-catalog.controller';
import { SearchCatalogService } from './search-catalog.service';

// ELASTICSEARCH/SEARCH_CONFIG come from SearchModule, which is @Global() and
// imported once in app.module.ts — no need to import it here, same as no
// feature module imports DrizzleModule directly for DRIZZLE.
@Module({
  controllers: [SearchCatalogController],
  providers: [SearchCatalogService],
})
export class SearchCatalogModule {}
