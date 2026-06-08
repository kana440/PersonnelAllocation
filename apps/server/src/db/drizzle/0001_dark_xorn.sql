CREATE TABLE "skill_defs" (
	"id" text PRIMARY KEY NOT NULL,
	"tool_name" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"approved_by" text,
	"approved_at" text,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "skill_defs_tool_name_unique" UNIQUE("tool_name")
);
--> statement-breakpoint
ALTER TABLE "skill_defs" ADD CONSTRAINT "skill_defs_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;