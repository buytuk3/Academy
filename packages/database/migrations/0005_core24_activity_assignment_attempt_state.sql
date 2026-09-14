CREATE TABLE IF NOT EXISTS "activity_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"activity_version" integer NOT NULL,
	"exercise_id" text,
	"exercise_version" integer,
	"curriculum_id" text NOT NULL,
	"curriculum_version" text NOT NULL,
	"stage_key" text NOT NULL,
	"grade_level" text NOT NULL,
	"subject" text NOT NULL,
	"target_student_id" text,
	"target_class_id" text,
	"target_grade_level" text,
	"target_stage_key" text,
	"target_school_id" text NOT NULL,
	"assigned_by" text NOT NULL,
	"assigned_by_role" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"due_at" timestamp with time zone,
	"operation_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_id_tenant_uniq" UNIQUE("id","tenant_id"),
	CONSTRAINT "assignment_op_key_tenant_uniq" UNIQUE("tenant_id","operation_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"student_id" text NOT NULL,
	"assignment_id" text,
	"activity_id" text NOT NULL,
	"exercise_id" text,
	"curriculum_id" text NOT NULL,
	"curriculum_version" text NOT NULL,
	"stage_key" text NOT NULL,
	"grade_level" text NOT NULL,
	"subject" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"state" text DEFAULT 'CREATED' NOT NULL,
	"started_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"duration_ms" integer,
	"activity_duration_ms" integer,
	"response_duration_ms" integer,
	"thinking_duration_ms" integer,
	"listening_duration_ms" integer,
	"pause_duration_ms" integer,
	"replay_duration_ms" integer,
	"evidence_ref" text,
	"operation_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_id_tenant_uniq" UNIQUE("id","tenant_id"),
	CONSTRAINT "attempt_op_key_tenant_uniq" UNIQUE("tenant_id","operation_key"),
	CONSTRAINT "attempt_logical_uniq" UNIQUE("tenant_id","student_id","activity_id","attempt_number")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_assignments" ADD CONSTRAINT "activity_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_assigned_by_tenant_fk" FOREIGN KEY ("assigned_by","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_target_student_tenant_fk" FOREIGN KEY ("target_student_id","tenant_id") REFERENCES "public"."students"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_target_class_tenant_fk" FOREIGN KEY ("target_class_id","tenant_id") REFERENCES "public"."classes"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_target_school_tenant_fk" FOREIGN KEY ("target_school_id","tenant_id") REFERENCES "public"."schools"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_exercise_tenant_fk" FOREIGN KEY ("exercise_id","tenant_id") REFERENCES "public"."exercise_definitions"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_attempts" ADD CONSTRAINT "activity_attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_attempts" ADD CONSTRAINT "attempt_student_tenant_fk" FOREIGN KEY ("student_id","tenant_id") REFERENCES "public"."students"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_attempts" ADD CONSTRAINT "attempt_assignment_tenant_fk" FOREIGN KEY ("assignment_id","tenant_id") REFERENCES "public"."activity_assignments"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "activity_attempts" ADD CONSTRAINT "attempt_exercise_tenant_fk" FOREIGN KEY ("exercise_id","tenant_id") REFERENCES "public"."exercise_definitions"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_tenant_idx" ON "activity_assignments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_tenant_status_idx" ON "activity_assignments" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_tenant_student_idx" ON "activity_assignments" USING btree ("tenant_id","target_student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_tenant_class_idx" ON "activity_assignments" USING btree ("tenant_id","target_class_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_tenant_activity_idx" ON "activity_assignments" USING btree ("tenant_id","activity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "assignment_tenant_school_idx" ON "activity_assignments" USING btree ("tenant_id","target_school_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempt_tenant_idx" ON "activity_attempts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempt_tenant_student_idx" ON "activity_attempts" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempt_tenant_state_idx" ON "activity_attempts" USING btree ("tenant_id","state");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempt_assignment_idx" ON "activity_attempts" USING btree ("tenant_id","assignment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempt_activity_idx" ON "activity_attempts" USING btree ("tenant_id","activity_id");--> statement-breakpoint
ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_status_check" CHECK ("status" IN ('ACTIVE','CANCELLED','CLOSED'));
--> statement-breakpoint
ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_source_check" CHECK ("source" IN ('teacherAssigned','recommended','curriculumRequired','reassessment','reinforcement'));
--> statement-breakpoint
ALTER TABLE "activity_assignments" ADD CONSTRAINT "assignment_has_anchor" CHECK ("target_student_id" IS NOT NULL OR "target_class_id" IS NOT NULL OR "target_grade_level" IS NOT NULL OR "target_stage_key" IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "activity_attempts" ADD CONSTRAINT "attempt_state_check" CHECK ("state" IN ('CREATED','STARTED','IN_PROGRESS','SUBMITTED','MEASURED','EVIDENCE_RECORDED'));
--> statement-breakpoint
ALTER TABLE "activity_attempts" ADD CONSTRAINT "attempt_number_check" CHECK ("attempt_number" >= 1);
--> statement-breakpoint
ALTER TABLE "activity_attempts" ADD CONSTRAINT "attempt_time_order" CHECK ("submitted_at" IS NULL OR "started_at" IS NULL OR "submitted_at" >= "started_at");
