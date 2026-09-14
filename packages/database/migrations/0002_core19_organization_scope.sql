CREATE TABLE IF NOT EXISTS "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"parent_organization_id" text,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"country" text,
	"education_system" text,
	"status" text DEFAULT 'active' NOT NULL,
	"operation_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_id_tenant_uniq" UNIQUE("id","tenant_id"),
	CONSTRAINT "organizations_tenant_code_uniq" UNIQUE("tenant_id","code"),
	CONSTRAINT "organizations_operation_key_uniq" UNIQUE("tenant_id","operation_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"school_id" text,
	"organization_id" text,
	"role" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"active_from" timestamp with time zone DEFAULT now() NOT NULL,
	"active_to" timestamp with time zone,
	"operation_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_memberships_operation_key_uniq" UNIQUE("tenant_id","operation_key")
);
--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "stage_key" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "organization_id" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "code" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "education_system" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "operation_key" text;--> statement-breakpoint
ALTER TABLE "schools" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_tenant_uniq" UNIQUE("id","tenant_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organizations" ADD CONSTRAINT "organizations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parent_tenant_fk" FOREIGN KEY ("parent_organization_id","tenant_id") REFERENCES "public"."organizations"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_user_tenant_fk" FOREIGN KEY ("user_id","tenant_id") REFERENCES "public"."users"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_school_tenant_fk" FOREIGN KEY ("school_id","tenant_id") REFERENCES "public"."schools"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_organization_tenant_fk" FOREIGN KEY ("organization_id","tenant_id") REFERENCES "public"."organizations"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "organizations_parent_idx" ON "organizations" USING btree ("tenant_id","parent_organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_memberships_user_idx" ON "staff_memberships" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_memberships_school_idx" ON "staff_memberships" USING btree ("tenant_id","school_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "classes" ADD CONSTRAINT "classes_school_tenant_fk" FOREIGN KEY ("school_id","tenant_id") REFERENCES "public"."schools"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "schools" ADD CONSTRAINT "schools_organization_tenant_fk" FOREIGN KEY ("organization_id","tenant_id") REFERENCES "public"."organizations"("id","tenant_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "schools_organization_idx" ON "schools" USING btree ("tenant_id","organization_id");--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_tenant_code_uniq" UNIQUE("tenant_id","code");--> statement-breakpoint
ALTER TABLE "schools" ADD CONSTRAINT "schools_operation_key_uniq" UNIQUE("tenant_id","operation_key");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_no_self_parent" CHECK (parent_organization_id is null or parent_organization_id <> id);--> statement-breakpoint
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_has_anchor" CHECK (school_id is not null or organization_id is not null);
