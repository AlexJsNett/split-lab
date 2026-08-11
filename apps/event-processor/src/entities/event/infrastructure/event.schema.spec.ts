import { getTableColumns } from 'drizzle-orm';
import type { EventMessage } from '@split-lab/events-contract';
import { events } from './event.schema';

// D3's duplication tripwire: this worker's `events` pgTable is a deliberate,
// separate copy of apps/api's authoritative schema (no shared ORM model
// across the process boundary — see the M10 plan). The drift risk that
// leaves behind is small since `events` is append-only and stable, but it's
// still a real risk, so it's covered here: every EventMessage field must be
// an insertable column on this table, and the only columns beyond that are
// the two the database itself generates (id, createdAt).
describe('events table column parity with EventMessage', () => {
  it('has exactly the EventMessage fields plus id and createdAt', () => {
    const columnNames = Object.keys(getTableColumns(events)).sort();
    const messageKeys: Array<keyof EventMessage> = [
      'experimentId',
      'variantId',
      'userId',
      'type',
    ];

    expect(columnNames).toEqual([...messageKeys, 'id', 'createdAt'].sort());
  });
});
