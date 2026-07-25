import 'dotenv/config';
import { DataSource } from 'typeorm';
import { ProjectEntity } from './entities/project/infrastructure/project.entity';
import { FeatureFlagEntity } from './entities/feature-flag/infrastructure/feature-flag.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  entities: [ProjectEntity, FeatureFlagEntity],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
