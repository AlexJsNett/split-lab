import { ExperimentEntity } from '@/entities/experiment/infrastructure/experiment.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('variants')
export class VariantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  experimentId: string;

  @ManyToOne(() => ExperimentEntity)
  @JoinColumn({ name: 'experimentId' })
  experiment: ExperimentEntity;

  @Column()
  key: string;

  @Column({ type: 'int' })
  weight: number;
}
