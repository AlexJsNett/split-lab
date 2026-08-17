# Full-Text Search (Elasticsearch, M12)

`target-stack.md` requires "Experience with Redis, MongoDB, or Elasticsearch." M12 picks
Elasticsearch specifically, for the concrete use case it's actually built for: full-text,
ranked, typo-tolerant search over experiments and feature flags. Postgres stays the source of
truth for every entity in this app; Elasticsearch holds a secondary, best-effort search index —
this is the project's first taste of **polyglot persistence**: different stores for different
access patterns, not "the database" as a single monolith.

## Why not Postgres full-text search

Postgres has `tsvector`/`tsquery` and `pg_trgm` — a real option, and the honest reason it
wasn't picked here isn't "Postgres can't do this," it's that `target-stack.md` explicitly asks
for hands-on Elasticsearch experience, and a second real datastore (its own connection
lifecycle, its own index/mapping concept, its own eventual-consistency story) is a more
representative training exercise than extending the existing Postgres connection with a
`tsvector` column. Elasticsearch's `multi_match` + `fuzziness: 'AUTO'` also gives typo-tolerant
ranking essentially for free — the concrete, demonstrable reason this feature isn't just
`WHERE name ILIKE '%q%'`.

## Two indices, not one

`${prefix}-experiments` and `${prefix}-flags` (`splitlab-experiments`/`splitlab-flags` in dev,
`splitlab-test-*` in e2e — see "Test isolation" below), not one shared index with a `type`
field doing double duty as a document discriminator. Two indices means two independent
mappings — `experiments` has `status`, `flags` has `enabled`/no `status` — without one giant
mapping full of fields that are `null` on half the documents. The search endpoint still queries
both together in one request when `type` isn't specified (`GET .../search?index=a,b` — a comma
-joined index list is a first-class Elasticsearch feature, not a client-side merge of two
separate calls).

Both indices: `number_of_shards: 1, number_of_replicas: 0`. A single-node dev cluster with the
default `number_of_replicas: 1` sits permanently "yellow" (Elasticsearch wants a replica shard
on a *different* node that doesn't exist) — confusing on a first run, and zero benefit for a
throwaway dev/learning cluster. `dynamic: 'strict'` on both mappings: an unexpected field on a
write throws loudly (`strict_dynamic_mapping_exception`) instead of Elasticsearch silently
auto-mapping it as a guessed type — a mapping mistake is a bug you want to see immediately, not
one that quietly succeeds into the wrong shape.

```
experiments:  projectId keyword | type keyword | name text | description text | status keyword | flagId keyword
flags:        projectId keyword | type keyword | key  text | description text | enabled boolean
```

`text` = analyzed by the standard analyzer (lowercased, split on word boundaries) — this is
what makes a field full-text searchable and ranked. `keyword` = stored exactly as-is, exact
-match only, never contributes to relevance scoring — `projectId` has to be `keyword`, not
`text`, or the `term` filter below would silently fail to match (a `term` query against an
analyzed field compares against the analyzer's *output*, which for a UUID is not the UUID
string you'd expect). `type` (`'experiment'` | `'flag'`) is stored explicitly even though
`hit._index` already implies it — the search response's shaping logic (`toResultItem()` in
`search-catalog.service.ts`) reads `source.type`, not the index name, so it never has to parse
`splitlab-experiments` back into `'experiment'`.

## `_id` = the Postgres UUID

Every `client.index({ index, id: row.id, document })` call uses the row's own UUID as the
Elasticsearch document ID, not an auto-generated one. Three things fall out of this one choice:

- **`index()` becomes an upsert.** Indexing the same `id` twice replaces the document instead
  of creating a duplicate — repeated writes (an update, or a `search:reindex` re-run) can never
  leave two documents for the same row.
- **Delete needs no lookup.** `client.delete({ index, id })` deletes by the same ID a `remove()`
  call already has in hand — no "find the document that matches this Postgres row" query first.
- **The two stores stay joinable by one identifier.** A search hit's `id` is directly the
  Postgres primary key a client would `GET /projects/:id/experiments/:experimentId` with — no
  translation table.

## Write-through sync: synchronous, inline, best-effort (not RabbitMQ)

`manage-experiments.service.ts`/`manage-flags.service.ts` call
`searchIndexer.indexExperiment(...)`/`indexFlag(...)` **inline, right after the Postgres write
succeeds**, awaited in the same request — not published to RabbitMQ for
`apps/event-processor` (or a new consumer) to pick up asynchronously. This was a real trade-off,
walked through concretely before picking it:

- **Latency**: a single `client.index()` call against a local/same-network Elasticsearch is
  single-digit milliseconds — negligible next to the Postgres round-trip already happening in
  the same request. `assign()` (M4's hot path, called on every flag/experiment check) is not
  touched by this feature at all — write-through only happens on `create`/`update`/`remove`,
  operator actions, not the hot read path RabbitMQ was introduced to protect back in M9/M10.
- **Code footprint**: RabbitMQ needs a new consumer (a queue, a handler, retry/DLX wiring —
  the whole `messaging.md` topology) for a feature whose entire job is "keep a secondary index
  reasonably fresh." Inline is a few `await` calls.
- **What breaks if Elasticsearch is down**: with RabbitMQ, nothing — the event sits queued
  until a consumer processes it, matching M9/M10's actual reason for existing (protect the hot
  path from a slow/unreliable downstream). With inline sync, a `create`/`update`/`remove` call
  still has to not fail the user's request when Elasticsearch is unreachable — solved
  separately, see "Contract: indexing never fails a write" below. Once that's guaranteed, the
  RabbitMQ alternative doesn't buy anything this milestone actually needs.

**The accepted trade-off, written down rather than hidden**: a failed Elasticsearch write
leaves the index *stale* until the next `pnpm run search:reindex` — a search result can point
at a row that's since been renamed, or (rarer) deleted. This is why search results are treated
as **pointers (ids), not authoritative records**: a real UI re-fetches through the normal REST
endpoints (`GET /projects/:id/experiments/:experimentId`) rather than trusting the search
response's fields as current truth. The industry-standard fix for this class of problem is a
**transactional outbox** (write the Postgres row and an "index this" outbox row in the same DB
transaction, a separate process drains the outbox with real delivery guarantees) — deliberately
out of scope here: it's real infrastructure investment for a learning milestone whose actual
goal is Elasticsearch itself, not exactly-once dual-write semantics.

## Contract: indexing never fails a write

`SearchIndexerService` (`apps/api/src/search/search-indexer.service.ts`) is the **one and only**
place `try/catch` + `Logger.error` for Elasticsearch failures lives. Every public method
(`indexExperiment`, `indexFlag`, `removeExperiment`, `removeFlag`) returns `Promise<void>` and
**never rejects** — proven by its own unit tests (`search-indexer.service.spec.ts`: "resolves
instead of rejecting when the client throws, and logs"). `manage-experiments.service.ts`/
`manage-flags.service.ts` call it with a plain `await`, no try/catch of their own — they trust
the contract instead of duplicating the same defensive code at every call site. A 404 on delete
(document already gone, or never existed) is treated as success, not an error — nothing to
remove either way. A missing index (`index_not_found_exception` — the app never creates indices
at boot, see below) gets a distinct log line pointing at the fix
(`pnpm run search:reindex`) instead of a generic error message.

## Gotcha found live: `action.auto_create_index` defeats the "missing index" guard

**Found during M12's live verification, not theorized.** The original design assumed a
`client.index()` call against a missing index throws `index_not_found_exception` — catch that,
log "run `search:reindex`," done. Live testing (create a flag before ever running
`search:reindex`) proved that assumption wrong: Elasticsearch's own
`action.auto_create_index` cluster setting **defaults to enabled**, so a write against a
missing index **silently auto-creates it** with a *dynamic* mapping instead of throwing
anything. The write "succeeds" — but into a broken schema: `projectId` came back mapped as
analyzed `text` (with a `.keyword` subfield ES adds automatically for dynamic string fields),
not the `keyword` type `search-index.ts` declares, so the `term: { projectId }` filter every
search query relies on silently matched nothing. This is exactly the "succeeding into a broken
mapping" failure mode the design already named as the risk to guard against — the first
implementation just guarded against the wrong trigger (a thrown error) for a failure that
doesn't actually throw.

**The fix**: `SearchIndexerService`'s private `index()` helper calls `client.indices.exists({
index })` *before* every `client.index()` call, and skips (logging the same "run
`search:reindex`" message) if it returns `false` — deterministic regardless of what
`action.auto_create_index` happens to be set to on a given cluster, instead of depending on ES
throwing an exception that its own defaults make unlikely. `delete()` didn't need the same
fix — unlike writes, Elasticsearch's delete/search/get APIs never auto-create an index, a
missing index reliably 404s with a real `index_not_found_exception` there. The one thing that
*did* need fixing on the delete side: distinguishing that specific 404 (missing index) from an
ordinary "this document is already gone" 404 — both looked identical at the `statusCode: 404`
level, and treating a missing index as "nothing to delete, all fine" would have silently
swallowed the same signal.

## `search:reindex`: the repair mechanism, and who owns index creation

`apps/api/src/search/reindex.ts`, wired as `pnpm run search:reindex` / `search:reindex:test` —
same shape as `src/db/migrate.ts` (its own `Pool`+Drizzle, its own ES `Client`, `dotenv`
switched by `NODE_ENV`, no Nest DI at all). **The CLI owns index creation, not app boot** —
exactly the same rule this project already has for Postgres ("schema is created by
`migration:run`, never at boot"). Running it: deletes each index if present, creates it fresh
from `search-index.ts`'s mapping, bulk-loads every row from both Postgres tables via
`_bulk`, refreshes, prints counts.

Delete-and-recreate, not upsert-in-place, is deliberate: this CLI is also how a **mapping
change** gets applied, and Elasticsearch mappings are largely immutable once a field exists
(you cannot change `description`'s type from `text` to `keyword` on a live index — only add
new fields to an existing mapping). A destructive reindex is the correct repair tool both for
"the index drifted from Postgres because some writes failed" and "the mapping itself changed."

The one exception to "the CLI owns index creation": `apps/api/test/support/test-app.ts`'s
`ensureSearchIndices()`, called from `createTestApp()` — exactly the same exception
`assertEventsQueueExists()` already makes for the `events_test` RabbitMQ queue. Without
something asserting the `splitlab-test-*` indices exist before the first spec runs, the very
first `indexExperiment()` call in a fresh test environment would hit
`index_not_found_exception`.

## `multi_match`, never `query_string` — a security call

`search-catalog.service.ts`'s query body:

```
bool: {
  must:   [ multi_match: { query: q, fields: ['name', 'description', 'key'], fuzziness: 'AUTO' } ],
  filter: [ term: { projectId } ]
}
```

`multi_match` takes `q` as an opaque string to match against — the query text is data, never
syntax. `query_string` (and `simple_query_string`) instead lets the caller's raw text carry
**Lucene query syntax** — `AND`/`OR`/`NOT`, field-scoped queries (`secretField:*`), and
particularly expensive **leading wildcards** (`*ttack`) that force Elasticsearch to scan the
entire term dictionary instead of using an index efficiently. Building a search query straight
from `query_string` + unsanitized user input is the Elasticsearch-flavored version of building
SQL from string concatenation — not literally SQL injection, but the same *"let the user's
input become part of the query language instead of a query parameter"* mistake. `multi_match`
is the parameterized-query equivalent here. `fuzziness: 'AUTO'` is the one relevance feature
this milestone bothers with (typo-tolerant matching, scaled by term length) — no custom
analyzers, no synonyms, no boosting; this is a learning milestone about Elasticsearch
fundamentals, not a relevance-tuning project.

## The near-real-time refresh gotcha

Elasticsearch does not make a write searchable the instant `client.index()` resolves — by
default, a write becomes visible to search only after the next **refresh**, which happens
automatically about once per second (near-real-time, not real-time). A test that creates a
flag and immediately searches for it, with no refresh in between, reliably gets **zero hits** —
not a flaky test, a deterministic consequence of how Elasticsearch actually works.

Production code deliberately does **not** force a refresh on every write (`refresh: true` on
`client.index()` would fix the test-timing problem, but it defeats the whole reason
Elasticsearch batches refreshes — real write throughput). Instead,
`test/support/test-app.ts` exports `refreshSearchIndices(app)`, and every e2e spec that writes
then immediately searches calls it explicitly before asserting
(`test/search.e2e-spec.ts`). **Never paper over this with a `sleep`** — a fixed delay is either
flaky (too short under load) or wastes real time in the suite (too long); an explicit refresh
call is deterministic and instant.

## Test isolation: index-name prefix, not a separate cluster

One shared Elasticsearch instance for both dev and the e2e suite (same container, same
`docker-compose.yml` service) — isolation comes from `ELASTICSEARCH_INDEX_PREFIX`
(`splitlab` in `.env`, `splitlab-test` in `.env.test`), exactly the same trick
`RABBITMQ_QUEUE=events_test` already uses for the message broker, and `DB_NAME=splitlab_test`
uses for Postgres. `cleanSearchIndices()` (called from `test-app.ts`'s `cleanDatabase()`, once
per test) runs `delete_by_query { match_all }` + refresh against the `splitlab-test-*` indices
— clears documents between tests without dropping the mapping, the same "reset data, not
schema" split `TRUNCATE` already has for the Postgres tables in the same function.

## `SearchModule`: `@Global()`, mirrors `DrizzleModule`

`apps/api/src/search/search.module.ts` provides `ELASTICSEARCH` (a `Symbol` token holding the
`@elastic/elasticsearch` `Client` instance directly) and `SEARCH_CONFIG`, marked `@Global()`
and imported once in `AppModule` — identical shape to `DrizzleModule`/`DRIZZLE`. Unlike M11's
`WEBHOOK_HTTP`, no interface-wrapping around the client is needed: that wrapping existed only
because `fetch` is a bare global function with nothing to `@Inject()` in principle;
`@elastic/elasticsearch`'s `Client` is a real class, so it can be provided and mocked exactly
like `DRIZZLE` (`{ provide: ELASTICSEARCH, useValue: mockClient }`) with no indirection. Full
contrast between the two cases: `nestjs-concepts.md`'s "Custom tokens, second use case"
section. `SearchModule implements OnModuleDestroy` and calls `client.close()` — same reason
`DrizzleModule` closes its `pg.Pool`: without it, e2e runs hang on an open handle after each
test file.
