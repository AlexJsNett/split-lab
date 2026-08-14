CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT uuid_generate_v4() NOT NULL,
	"experimentId" uuid NOT NULL,
	"idempotencyKey" varchar NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"responseStatus" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"deliveredAt" timestamp,
	CONSTRAINT "webhook_deliveries_idempotencyKey_unique" UNIQUE("idempotencyKey")
);
--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_experimentId_experiments_id_fk" FOREIGN KEY ("experimentId") REFERENCES "public"."experiments"("id") ON DELETE no action ON UPDATE no action;