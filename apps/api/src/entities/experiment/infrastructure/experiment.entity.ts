import { ProjectEntity } from '@/entities/project/infrastructure/project.entity';
import { FeatureFlagEntity } from '@/entities/feature-flag/infrastructure/feature-flag.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('experiments')
export class ExperimentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  projectId: string;

  @ManyToOne(() => ProjectEntity)
  @JoinColumn({ name: 'projectId' })
  project: ProjectEntity;

  @Column({ nullable: true })
  flagId: string | null;

  @ManyToOne(() => FeatureFlagEntity, { nullable: true })
  @JoinColumn({ name: 'flagId' })
  flag: FeatureFlagEntity | null;

  @Column()
  name: string;

  @Column({ default: 'draft' })
  status: string;
}
