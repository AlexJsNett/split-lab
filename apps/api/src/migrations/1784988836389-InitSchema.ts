import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1784988836389 implements MigrationInterface {
  name = 'InitSchema1784988836389';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "projects" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "apiKey" character varying NOT NULL, CONSTRAINT "UQ_abfe2253f0a1eece8ef441dd142" UNIQUE ("apiKey"), CONSTRAINT "PK_6271df0a7aed1d6c0691ce6ac50" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "feature_flags" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "projectId" uuid NOT NULL, "key" character varying NOT NULL, "enabled" boolean NOT NULL DEFAULT false, "rolloutPercent" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_db657d344e9caacfc9d5cf8bbac" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "feature_flags" ADD CONSTRAINT "FK_5db5b81b486a881a4ce99c02f95" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "feature_flags" DROP CONSTRAINT "FK_5db5b81b486a881a4ce99c02f95"`,
    );
    await queryRunner.query(`DROP TABLE "feature_flags"`);
    await queryRunner.query(`DROP TABLE "projects"`);
  }
}
