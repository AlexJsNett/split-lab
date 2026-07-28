import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExperimentsVariantsEvents1785228726566 implements MigrationInterface {
  name = 'AddExperimentsVariantsEvents1785228726566';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "experiments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "projectId" uuid NOT NULL, "flagId" uuid, "name" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'draft', CONSTRAINT "PK_aafe1321d916fac58ba06ad8178" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "variants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "experimentId" uuid NOT NULL, "key" character varying NOT NULL, "weight" integer NOT NULL, CONSTRAINT "PK_672d13d1a6de0197f20c6babb5e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "events" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "experimentId" uuid NOT NULL, "variantId" uuid NOT NULL, "userId" character varying NOT NULL, "type" character varying NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_40731c7151fe4be3116e45ddf73" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiments" ADD CONSTRAINT "FK_881a3c8eebab6515aa6ce2d171c" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiments" ADD CONSTRAINT "FK_d85032faffaa7ff1b89df3c4fe3" FOREIGN KEY ("flagId") REFERENCES "feature_flags"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "variants" ADD CONSTRAINT "FK_f8f6c432d4ea652e9c44d86d5eb" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD CONSTRAINT "FK_b7e21141de066733871c6a21cd4" FOREIGN KEY ("experimentId") REFERENCES "experiments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" ADD CONSTRAINT "FK_c3893516c6ff39d625d7be63977" FOREIGN KEY ("variantId") REFERENCES "variants"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "events" DROP CONSTRAINT "FK_c3893516c6ff39d625d7be63977"`,
    );
    await queryRunner.query(
      `ALTER TABLE "events" DROP CONSTRAINT "FK_b7e21141de066733871c6a21cd4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "variants" DROP CONSTRAINT "FK_f8f6c432d4ea652e9c44d86d5eb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiments" DROP CONSTRAINT "FK_d85032faffaa7ff1b89df3c4fe3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "experiments" DROP CONSTRAINT "FK_881a3c8eebab6515aa6ce2d171c"`,
    );
    await queryRunner.query(`DROP TABLE "events"`);
    await queryRunner.query(`DROP TABLE "variants"`);
    await queryRunner.query(`DROP TABLE "experiments"`);
  }
}
