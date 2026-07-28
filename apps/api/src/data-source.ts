import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ProjectEntity } from './entities/project/infrastructure/project.entity';
import { FeatureFlagEntity } from './entities/feature-flag/infrastructure/feature-flag.entity';
import { ExperimentEntity } from './entities/experiment/infrastructure/experiment.entity';
import { VariantEntity } from './entities/variant/infrastructure/variant.entity';
import { EventEntity } from './entities/event/infrastructure/event.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [
    ProjectEntity,
    FeatureFlagEntity,
    ExperimentEntity,
    VariantEntity,
    EventEntity,
  ],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
