CREATE TABLE IF NOT EXISTS "student_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"operation_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_history_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"identity_id" text NOT NULL,
	"source_tenant_id" text NOT NULL,
	"target_tenant_id" text NOT NULL,
	"scope" text NOT NULL,
	"granted_by" text NOT NULL,
	"consent_ref" text,
	"operation_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "student_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"identity_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"student_id" text NOT NULL,
	"school_id" text NOT NULL,
	"class_id" text NOT NULL,
	"status" text NOT NULL,
	"active_from" timestamp with time zone DEFAULT now() NOT NULL,
	"active_to" timestamp with time zone,
	"operation_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "students" ADD COLUMN "identity_id" text;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_id_tenant_uniq" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_id_tenant_uniq" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_id_tenant_uniq" UNIQUE("id","tenant_id");--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_identity_tenant_uniq" UNIQUE("identity_id","tenant_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_history_shares" ADD CONSTRAINT "student_history_shares_identity_id_student_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."student_identities"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_history_shares" ADD CONSTRAINT "student_history_shares_source_tenant_id_tenants_id_fk" FOREIGN KEY ("source_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_history_shares" ADD CONSTRAINT "student_history_shares_target_tenant_id_tenants_id_fk" FOREIGN KEY ("target_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_memberships" ADD CONSTRAINT "student_memberships_identity_id_student_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."student_identities"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_memberships" ADD CONSTRAINT "student_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_memberships" ADD CONSTRAINT "student_memberships_student_tenant_fk" FOREIGN KEY ("student_id","tenant_id") REFERENCES "public"."students"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_memberships" ADD CONSTRAINT "student_memberships_school_tenant_fk" FOREIGN KEY ("school_id","tenant_id") REFERENCES "public"."schools"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "student_memberships" ADD CONSTRAINT "student_memberships_class_tenant_fk" FOREIGN KEY ("class_id","tenant_id") REFERENCES "public"."classes"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_identities_operation_key_uniq" ON "student_identities" USING btree ("operation_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_history_shares_identity_target_idx" ON "student_history_shares" USING btree ("identity_id","target_tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_history_shares_operation_key_uniq" ON "student_history_shares" USING btree ("source_tenant_id","operation_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "student_memberships_identity_idx" ON "student_memberships" USING btree ("identity_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_memberships_operation_key_uniq" ON "student_memberships" USING btree ("tenant_id","operation_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "student_memberships_identity_active_uniq" ON "student_memberships" USING btree ("identity_id") WHERE status = 'active';--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_identity_id_student_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."student_identities"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "students" ADD CONSTRAINT "students_class_tenant_fk" FOREIGN KEY ("class_id","tenant_id") REFERENCES "public"."classes"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
