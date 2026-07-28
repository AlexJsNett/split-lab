import { ExperimentEntity } from '@/entities/experiment/infrastructure/experiment.entity';
import { VariantEntity } from '@/entities/variant/infrastructure/variant.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('events')
export class EventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  experimentId: string;

  @ManyToOne(() => ExperimentEntity)
  @JoinColumn({ name: 'experimentId' })
  experiment: ExperimentEntity;

  @Column()
  variantId: string;

  @ManyToOne(() => VariantEntity)
  @JoinColumn({ name: 'variantId' })
  variant: VariantEntity;

  @Column()
  userId: string;

  @Column()
  type: string;

  @CreateDateColumn()
  createdAt: Date;
}
