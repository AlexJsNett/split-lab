import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameApiKeyToHash1785151917873 implements MigrationInterface {
  name = 'RenameApiKeyToHash1785151917873';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" RENAME COLUMN "apiKey" TO "apiKeyHash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" RENAME CONSTRAINT "UQ_abfe2253f0a1eece8ef441dd142" TO "UQ_f63e2be2a1f3f36aeb21b4fdaaa"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "projects" RENAME CONSTRAINT "UQ_f63e2be2a1f3f36aeb21b4fdaaa" TO "UQ_abfe2253f0a1eece8ef441dd142"`,
    );
    await queryRunner.query(
      `ALTER TABLE "projects" RENAME COLUMN "apiKeyHash" TO "apiKey"`,
    );
  }
}
