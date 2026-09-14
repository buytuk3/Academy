DO $$ BEGIN
 CREATE TYPE "public"."plan_type" AS ENUM('starter', 'growth', 'school', 'district');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."user_role" AS ENUM('admin', 'principal', 'teacher', 'student', 'parent');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"plan_id" text DEFAULT 'starter' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"region" text,
	"city" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"username" text,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'teacher' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "classes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"school_id" text NOT NULL,
	"name" text NOT NULL,
	"grade_level" text NOT NULL,
	"section" text,
	"academic_year" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "schools" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"city" text,
	"region" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "students" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"class_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"student_code" text NOT NULL,
	"display_name" text,
	"grade" text,
	"native_language" text DEFAULT 'ar',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"session_id" text NOT NULL,
	"evidence_type" text NOT NULL,
	"value" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reading_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"student_id" text NOT NULL,
	"teacher_id" text,
	"session_type" text DEFAULT 'reading' NOT NULL,
	"raw_score" integer,
	"fluency_score" real,
	"comprehension_score" real,
	"pronunciation_score" real,
	"duration_seconds" integer,
	"status" text DEFAULT 'completed' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "gaps" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"student_id" text NOT NULL,
	"domain" text NOT NULL,
	"severity" text NOT NULL,
	"evidence_score" real,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"status" text DEFAULT 'open' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "impact_measurements" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"student_id" text NOT NULL,
	"gap_id" text NOT NULL,
	"measurement_type" text NOT NULL,
	"score_before" real,
	"score_after" real,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "remediation_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"activity_type" text NOT NULL,
	"description" text,
	"completed_at" timestamp with time zone,
	"outcome" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "remediation_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"student_id" text NOT NULL,
	"gap_id" text NOT NULL,
	"plan_type" text DEFAULT 'individual' NOT NULL,
	"assigned_to" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text,
	"entity_id" text,
	"metadata" text,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"family_id" text,
	"jti" text,
	"token_version" integer DEFAULT 2,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" varchar(200) NOT NULL,
	"key_hash" text NOT NULL,
	"user_id" text,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"session_id" text NOT NULL,
	"student_id" text NOT NULL,
	"passage_id" text NOT NULL,
	"audio_key" text,
	"encrypted_key" text,
	"transcript" text,
	"duration_sec" real,
	"job_id" text,
	"job_status" varchar(20) DEFAULT 'pending',
	"correlation_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "exercise_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"student_id" text NOT NULL,
	"attempt_id" text,
	"exercise_id" varchar(100) NOT NULL,
	"reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mastery_records" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"student_id" text NOT NULL,
	"passage_id" text NOT NULL,
	"level" varchar(30) NOT NULL,
	"score" real NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"trend" varchar(10),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "passages" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"teacher_id" text,
	"classroom_id" text,
	"title" varchar(500) NOT NULL,
	"text" text NOT NULL,
	"difficulty" integer DEFAULT 1 NOT NULL,
	"grade" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "phoneme_stats" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"student_id" text NOT NULL,
	"phoneme" varchar(20) NOT NULL,
	"total_occurrences" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"attempt_id" text NOT NULL,
	"overall_score" real NOT NULL,
	"accuracy_score" real NOT NULL,
	"pronunciation_score" real NOT NULL,
	"fluency_score" real NOT NULL,
	"prosody_score" real NOT NULL,
	"wpm" real NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"student_id" text NOT NULL,
	"actor_id" text,
	"actor_role" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subject" text,
	"grade" text,
	"curriculum_book" text,
	"unit_id" text,
	"lesson_id" text,
	"objective_id" text,
	"activity_id" text,
	"session_id" text,
	"attempt_id" text,
	"passage_id" text,
	"in_response_to_id" text,
	"evidence_type" text NOT NULL,
	"action" text,
	"response" jsonb,
	"result" text,
	"duration_ms" integer,
	"error_type" text,
	"confidence" real,
	"source_engine" text NOT NULL,
	"tool" text,
	"teacher_decision" jsonb,
	"follow_up" jsonb,
	"metadata" jsonb,
	"operation_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "event_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"type" text NOT NULL,
	"envelope" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"error_class" text,
	"trace_id" text,
	"request_id" text,
	"correlation_id" text,
	"job_id" text,
	"evidence_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"next_attempt_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "intervention_proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"student_id" text NOT NULL,
	"diagnosis_id" text NOT NULL,
	"skill" text NOT NULL,
	"activity_type" text NOT NULL,
	"config" jsonb,
	"suggested_by" text DEFAULT 'learning-loop' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"original_proposal" jsonb,
	"decision" jsonb,
	"decided_at" timestamp with time zone,
	"delivery_authorization" jsonb,
	"operation_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "intervention_proposals_op_uniq" UNIQUE("tenant_id","operation_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_diagnoses" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"student_id" text NOT NULL,
	"skill" text NOT NULL,
	"objective_id" text,
	"signal_key" text NOT NULL,
	"detected_at" timestamp with time zone NOT NULL,
	"evidence_refs" jsonb NOT NULL,
	"confidence" real NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'candidate' NOT NULL,
	"source" text NOT NULL,
	"previous_diagnosis_id" text,
	"operation_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_diagnoses_op_uniq" UNIQUE("tenant_id","operation_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"student_id" text NOT NULL,
	"diagnosis_id" text NOT NULL,
	"intervention_id" text NOT NULL,
	"reassessment_id" text NOT NULL,
	"result" text NOT NULL,
	"evidence_refs" jsonb NOT NULL,
	"comparison" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"confidence" real NOT NULL,
	"source" text NOT NULL,
	"operation_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_outcomes_op_uniq" UNIQUE("tenant_id","operation_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "learning_reassessments" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"student_id" text NOT NULL,
	"diagnosis_id" text NOT NULL,
	"intervention_id" text NOT NULL,
	"skill" text NOT NULL,
	"activity_used" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"baseline_evidence_ref" text,
	"reassessment_evidence_ref" text,
	"indicators" jsonb,
	"trend" text,
	"operation_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "learning_reassessments_op_uniq" UNIQUE("tenant_id","operation_key")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classes" ADD CONSTRAINT "classes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schools" ADD CONSTRAINT "schools_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_session_id_reading_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."reading_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gaps" ADD CONSTRAINT "gaps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "gaps" ADD CONSTRAINT "gaps_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impact_measurements" ADD CONSTRAINT "impact_measurements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impact_measurements" ADD CONSTRAINT "impact_measurements_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "impact_measurements" ADD CONSTRAINT "impact_measurements_gap_id_gaps_id_fk" FOREIGN KEY ("gap_id") REFERENCES "public"."gaps"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "remediation_activities" ADD CONSTRAINT "remediation_activities_plan_id_remediation_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."remediation_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "remediation_activities" ADD CONSTRAINT "remediation_activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "remediation_plans" ADD CONSTRAINT "remediation_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "remediation_plans" ADD CONSTRAINT "remediation_plans_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "remediation_plans" ADD CONSTRAINT "remediation_plans_gap_id_gaps_id_fk" FOREIGN KEY ("gap_id") REFERENCES "public"."gaps"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "remediation_plans" ADD CONSTRAINT "remediation_plans_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attempts" ADD CONSTRAINT "attempts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attempts" ADD CONSTRAINT "attempts_session_id_reading_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."reading_sessions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attempts" ADD CONSTRAINT "attempts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "attempts" ADD CONSTRAINT "attempts_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_assignments" ADD CONSTRAINT "exercise_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_assignments" ADD CONSTRAINT "exercise_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "exercise_assignments" ADD CONSTRAINT "exercise_assignments_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mastery_records" ADD CONSTRAINT "mastery_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mastery_records" ADD CONSTRAINT "mastery_records_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mastery_records" ADD CONSTRAINT "mastery_records_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "passages" ADD CONSTRAINT "passages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "passages" ADD CONSTRAINT "passages_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "passages" ADD CONSTRAINT "passages_classroom_id_classes_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "phoneme_stats" ADD CONSTRAINT "phoneme_stats_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "phoneme_stats" ADD CONSTRAINT "phoneme_stats_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence" ADD CONSTRAINT "evidence_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence" ADD CONSTRAINT "evidence_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence" ADD CONSTRAINT "evidence_session_id_reading_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."reading_sessions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence" ADD CONSTRAINT "evidence_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "evidence" ADD CONSTRAINT "evidence_passage_id_passages_id_fk" FOREIGN KEY ("passage_id") REFERENCES "public"."passages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "event_outbox" ADD CONSTRAINT "event_outbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "intervention_proposals" ADD CONSTRAINT "intervention_proposals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "intervention_proposals" ADD CONSTRAINT "intervention_proposals_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "intervention_proposals" ADD CONSTRAINT "intervention_proposals_diagnosis_id_learning_diagnoses_id_fk" FOREIGN KEY ("diagnosis_id") REFERENCES "public"."learning_diagnoses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_diagnoses" ADD CONSTRAINT "learning_diagnoses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_diagnoses" ADD CONSTRAINT "learning_diagnoses_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_outcomes" ADD CONSTRAINT "learning_outcomes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_outcomes" ADD CONSTRAINT "learning_outcomes_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_outcomes" ADD CONSTRAINT "learning_outcomes_diagnosis_id_learning_diagnoses_id_fk" FOREIGN KEY ("diagnosis_id") REFERENCES "public"."learning_diagnoses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_outcomes" ADD CONSTRAINT "learning_outcomes_intervention_id_intervention_proposals_id_fk" FOREIGN KEY ("intervention_id") REFERENCES "public"."intervention_proposals"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_outcomes" ADD CONSTRAINT "learning_outcomes_reassessment_id_learning_reassessments_id_fk" FOREIGN KEY ("reassessment_id") REFERENCES "public"."learning_reassessments"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_reassessments" ADD CONSTRAINT "learning_reassessments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_reassessments" ADD CONSTRAINT "learning_reassessments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_reassessments" ADD CONSTRAINT "learning_reassessments_diagnosis_id_learning_diagnoses_id_fk" FOREIGN KEY ("diagnosis_id") REFERENCES "public"."learning_diagnoses"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_reassessments" ADD CONSTRAINT "learning_reassessments_intervention_id_intervention_proposals_id_fk" FOREIGN KEY ("intervention_id") REFERENCES "public"."intervention_proposals"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_reassessments" ADD CONSTRAINT "learning_reassessments_baseline_evidence_ref_evidence_id_fk" FOREIGN KEY ("baseline_evidence_ref") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_reassessments" ADD CONSTRAINT "learning_reassessments_reassessment_evidence_ref_evidence_id_fk" FOREIGN KEY ("reassessment_evidence_ref") REFERENCES "public"."evidence"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_tenant_idx" ON "audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_hash_idx" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempts_student_idx" ON "attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "attempts_session_idx" ON "attempts" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mastery_records_unique" ON "mastery_records" USING btree ("student_id","passage_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passages_teacher_idx" ON "passages" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "passages_class_idx" ON "passages" USING btree ("classroom_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "phoneme_stats_unique" ON "phoneme_stats" USING btree ("student_id","phoneme");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reports_attempt_idx" ON "reports" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_student_idx" ON "evidence" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_time_idx" ON "evidence" USING btree ("student_id","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_attempt_idx" ON "evidence" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "evidence_type_idx" ON "evidence" USING btree ("student_id","evidence_type","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "evidence_operation_key_uniq" ON "evidence" USING btree ("tenant_id","operation_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_outbox_status_idx" ON "event_outbox" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "event_outbox_tenant_idx" ON "event_outbox" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "intervention_proposals_student_idx" ON "intervention_proposals" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_diagnoses_student_idx" ON "learning_diagnoses" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_outcomes_student_idx" ON "learning_outcomes" USING btree ("tenant_id","student_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "learning_reassessments_student_idx" ON "learning_reassessments" USING btree ("tenant_id","student_id");