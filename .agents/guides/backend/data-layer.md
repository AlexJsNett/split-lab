# Back-end Data Layer (TypeORM/Postgres)

Not written yet — lands with M2 (Data layer: Docker Compose Postgres + TypeORM + first
entities).

Fill in here once M2 lands:
- How entities are organized (one file per entity? per module?).
- Migration workflow — command to generate/run migrations, and the rule that
  `synchronize: true` never ships.
- Repository access pattern (raw `@InjectRepository`, or a custom repository wrapper).
