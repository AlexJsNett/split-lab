import { ProjectEntity } from '@/entities/project/infrastructure/project.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('feature_flags')
export class FeatureFlagEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column()
  projectId: string;
  @ManyToOne(() => ProjectEntity)
  @JoinColumn({ name: 'projectId' })
  project: ProjectEntity;
  @Column()
  key: string;
  @Column({ default: false })
  enabled: boolean;
  @Column({ type: 'int', default: 0 })
  rolloutPercent: number;
}
