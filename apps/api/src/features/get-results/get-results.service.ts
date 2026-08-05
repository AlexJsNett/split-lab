import { DRIZZLE } from '@/db/drizzle.module';
import * as schema from '@/db/schema';
import { events } from '@/entities/event/infrastructure/event.schema';
import { variants } from '@/entities/variant/infrastructure/variant.schema';
import { ManageExperimentsService } from '@/features/manage-experiments/manage-experiments.service';
import { Inject, Injectable } from '@nestjs/common';
import { count, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface VariantResult {
  variantId: string;
  key: string;
  exposures: number;
  conversions: number;
  conversionRate: number;
}

@Injectable()
export class GetResultsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly manageExperimentsService: ManageExperimentsService,
  ) {}

  async getResults(
    projectId: string,
    experimentId: string,
  ): Promise<VariantResult[]> {
    await this.manageExperimentsService.findOne(projectId, experimentId);

    // all variants of this experimentId — even ones with zero events yet,
    // so they show up as 0/0 in the result instead of silently disappearing
    const experimentVariants = await this.db
      .select()
      .from(variants)
      .where(eq(variants.experimentId, experimentId));

    // intermediate, "flat" result: one row per (variantId, type) pair with a
    // count — not the shape the client needs, reshaped into a map below
    const counts = await this.db
      .select({
        variantId: events.variantId,
        type: events.type,
        count: count(),
      })
      .from(events)
      .where(eq(events.experimentId, experimentId))
      .groupBy(events.variantId, events.type);

    const countsByVariant = new Map<
      string,
      { exposures: number; conversions: number }
    >();
    for (const row of counts) {
      const entry = countsByVariant.get(row.variantId) ?? {
        exposures: 0,
        conversions: 0,
      };
      if (row.type === 'exposure') {
        entry.exposures = row.count;
      } else if (row.type === 'conversion') {
        entry.conversions = row.count;
      }
      countsByVariant.set(row.variantId, entry);
    }

    return experimentVariants.map((variant) => {
      const { exposures, conversions } = countsByVariant.get(variant.id) ?? {
        exposures: 0,
        conversions: 0,
      };
      return {
        variantId: variant.id,
        key: variant.key,
        exposures,
        conversions,
        conversionRate: exposures === 0 ? 0 : conversions / exposures,
      };
    });
  }
}
