CREATE TABLE IF NOT EXISTS "content_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"root_content_id" text NOT NULL,
	"parent_version_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"title" text NOT NULL,
	"body_ref" text,
	"language" text DEFAULT 'ar' NOT NULL,
	"curriculum_id" text NOT NULL,
	"curriculum_version" text NOT NULL,
	"country" text,
	"education_system" text,
	"stage_key" text NOT NULL,
	"grade_key" text,
	"grade_level" text NOT NULL,
	"subject" text NOT NULL,
	"book_id" text,
	"unit_id" text,
	"lesson_id" text,
	"objective_id" text,
	"skill" text,
	"dimension" text,
	"created_by" text NOT NULL,
	"operation_key" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_id_tenant_uniq" UNIQUE("id","tenant_id"),
	CONSTRAINT "content_lineage_version_uniq" UNIQUE("tenant_id","root_content_id","version"),
	CONSTRAINT "content_op_key_tenant_uniq" UNIQUE("tenant_id","operation_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exercise_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"root_exercise_id" text NOT NULL,
	"parent_version_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"content_id" text,
	"activity_type" text NOT NULL,
	"engine_binding" text NOT NULL,
	"expected_response_type" text NOT NULL,
	"expected_response_config" jsonb,
	"assessment_ref" text,
	"max_attempts" integer,
	"time_limit_ms" integer,
	"source" text NOT NULL,
	"curriculum_id" text NOT NULL,
	"curriculum_version" text NOT NULL,
	"country" text,
	"education_system" text,
	"stage_key" text NOT NULL,
	"grade_key" text,
	"grade_level" text NOT NULL,
	"subject" text NOT NULL,
	"book_id" text,
	"unit_id" text,
	"lesson_id" text,
	"objective_id" text,
	"skill" text,
	"dimension" text,
	"created_by" text NOT NULL,
	"operation_key" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercise_id_tenant_uniq" UNIQUE("id","tenant_id"),
	CONSTRAINT "exercise_lineage_version_uniq" UNIQUE("tenant_id","root_exercise_id","version"),
	CONSTRAINT "exercise_op_key_tenant_uniq" UNIQUE("tenant_id","operation_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_definitions" ADD CONSTRAINT "content_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_definitions" ADD CONSTRAINT "content_created_by_tenant_fk" FOREIGN KEY ("created_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_definitions" ADD CONSTRAINT "content_parent_tenant_fk" FOREIGN KEY ("parent_version_id","tenant_id") REFERENCES "public"."content_definitions"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_definitions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_created_by_tenant_fk" FOREIGN KEY ("created_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_content_tenant_fk" FOREIGN KEY ("content_id","tenant_id") REFERENCES "public"."content_definitions"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_parent_tenant_fk" FOREIGN KEY ("parent_version_id","tenant_id") REFERENCES "public"."exercise_definitions"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_tenant_idx" ON "content_definitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_tenant_status_idx" ON "content_definitions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_tenant_kind_idx" ON "content_definitions" USING btree ("tenant_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_tenant_subject_idx" ON "content_definitions" USING btree ("tenant_id","subject");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_curriculum_idx" ON "content_definitions" USING btree ("tenant_id","curriculum_id","curriculum_version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_root_version_idx" ON "content_definitions" USING btree ("tenant_id","root_content_id","version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_lesson_idx" ON "content_definitions" USING btree ("tenant_id","lesson_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "content_created_by_idx" ON "content_definitions" USING btree ("tenant_id","created_by");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_tenant_idx" ON "exercise_definitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_tenant_status_idx" ON "exercise_definitions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_engine_idx" ON "exercise_definitions" USING btree ("tenant_id","engine_binding");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_activity_type_idx" ON "exercise_definitions" USING btree ("tenant_id","activity_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_curriculum_idx" ON "exercise_definitions" USING btree ("tenant_id","curriculum_id","curriculum_version");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "exercise_content_idx" ON "exercise_definitions" USING btree ("tenant_id","content_id");--> statement-breakpoint
ALTER TABLE "content_definitions" ADD CONSTRAINT "content_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','SUPERSEDED'));
--> statement-breakpoint
ALTER TABLE "content_definitions" ADD CONSTRAINT "content_no_self_parent" CHECK ("parent_version_id" IS NULL OR "parent_version_id" <> "id");
--> statement-breakpoint
ALTER TABLE "content_definitions" ADD CONSTRAINT "content_version_positive" CHECK ("version" >= 1);
--> statement-breakpoint
ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_status_check" CHECK ("status" IN ('DRAFT','PUBLISHED','SUPERSEDED'));
--> statement-breakpoint
ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_engine_check" CHECK ("engine_binding" IN ('READING','DICTATION','NUMERACY','ASSESSMENT'));
--> statement-breakpoint
ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_no_self_parent" CHECK ("parent_version_id" IS NULL OR "parent_version_id" <> "id");
--> statement-breakpoint
ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_version_positive" CHECK ("version" >= 1);
--> statement-breakpoint
ALTER TABLE "exercise_definitions" ADD CONSTRAINT "exercise_max_attempts_check" CHECK ("max_attempts" IS NULL OR "max_attempts" >= 1);
