CREATE TABLE "allocation_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_company_id" text NOT NULL,
	"submission_id" text,
	"row_id" integer NOT NULL,
	"data" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"locale" text DEFAULT 'ja' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "companies_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "consistency_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_company_id" text NOT NULL,
	"group_employee_id" text NOT NULL,
	"field" text NOT NULL,
	"value_a" text,
	"value_b" text,
	"submission_a_id" text,
	"submission_b_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cross_company_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"group_employee_id" text NOT NULL,
	"company_a_id" text NOT NULL,
	"company_b_id" text NOT NULL,
	"field" text NOT NULL,
	"value_a" text,
	"value_b" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" serial PRIMARY KEY NOT NULL,
	"row_id" integer NOT NULL,
	"round_company_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"fields" text NOT NULL,
	"message" text NOT NULL,
	"reply" text,
	"replied_at" text,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_id" text NOT NULL,
	"template" text NOT NULL,
	"payload" text NOT NULL,
	"read_at" text,
	"sent_at" text
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"code" text PRIMARY KEY NOT NULL,
	"company_id" text,
	"status" text DEFAULT 'available' NOT NULL,
	"acquired_by" text,
	"acquired_at" text,
	"notes" text,
	"registered_by" text,
	"registered_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_companies" (
	"id" text PRIMARY KEY NOT NULL,
	"round_id" text NOT NULL,
	"company_id" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_company_code_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_company_id" text NOT NULL,
	"category" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"attributes" text
);
--> statement-breakpoint
CREATE TABLE "round_company_files" (
	"round_company_id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"data" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "round_company_orgs" (
	"id" serial PRIMARY KEY NOT NULL,
	"round_company_id" text NOT NULL,
	"is_after" boolean DEFAULT false NOT NULL,
	"external_code" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" integer,
	"level" integer DEFAULT 0 NOT NULL,
	"path" text DEFAULT '/' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"kind" text DEFAULT 'annual' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"based_on_round_id" text,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_rows" (
	"submission_id" text NOT NULL,
	"row_id" integer NOT NULL,
	"data" text NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL,
	CONSTRAINT "submission_rows_submission_id_row_id_pk" PRIMARY KEY("submission_id","row_id")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"round_company_id" text NOT NULL,
	"parent_id" text,
	"assignee_id" text NOT NULL,
	"scope" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"request_comment" text,
	"revision_comment" text,
	"snapshot_data" text,
	"conflict_fields" text,
	"created_by" text NOT NULL,
	"created_at" text DEFAULT now() NOT NULL,
	"updated_at" text DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_company_roles" (
	"user_id" text NOT NULL,
	"company_id" text NOT NULL,
	"role" text NOT NULL,
	"org_level_min" integer,
	"org_codes" text,
	CONSTRAINT "user_company_roles_user_id_company_id_pk" PRIMARY KEY("user_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "allocation_rows" ADD CONSTRAINT "allocation_rows_round_company_id_round_companies_id_fk" FOREIGN KEY ("round_company_id") REFERENCES "public"."round_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_rows" ADD CONSTRAINT "allocation_rows_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_issue_id_consistency_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."consistency_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consistency_issues" ADD CONSTRAINT "consistency_issues_round_company_id_round_companies_id_fk" FOREIGN KEY ("round_company_id") REFERENCES "public"."round_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consistency_issues" ADD CONSTRAINT "consistency_issues_submission_a_id_submissions_id_fk" FOREIGN KEY ("submission_a_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consistency_issues" ADD CONSTRAINT "consistency_issues_submission_b_id_submissions_id_fk" FOREIGN KEY ("submission_b_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_company_issues" ADD CONSTRAINT "cross_company_issues_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_company_issues" ADD CONSTRAINT "cross_company_issues_company_a_id_companies_id_fk" FOREIGN KEY ("company_a_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cross_company_issues" ADD CONSTRAINT "cross_company_issues_company_b_id_companies_id_fk" FOREIGN KEY ("company_b_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_round_company_id_round_companies_id_fk" FOREIGN KEY ("round_company_id") REFERENCES "public"."round_companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_to_user_id_users_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_companies" ADD CONSTRAINT "round_companies_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_companies" ADD CONSTRAINT "round_companies_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_company_code_items" ADD CONSTRAINT "round_company_code_items_round_company_id_round_companies_id_fk" FOREIGN KEY ("round_company_id") REFERENCES "public"."round_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_company_files" ADD CONSTRAINT "round_company_files_round_company_id_round_companies_id_fk" FOREIGN KEY ("round_company_id") REFERENCES "public"."round_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_company_orgs" ADD CONSTRAINT "round_company_orgs_round_company_id_round_companies_id_fk" FOREIGN KEY ("round_company_id") REFERENCES "public"."round_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_rows" ADD CONSTRAINT "submission_rows_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_round_company_id_round_companies_id_fk" FOREIGN KEY ("round_company_id") REFERENCES "public"."round_companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_company_roles" ADD CONSTRAINT "user_company_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_company_roles" ADD CONSTRAINT "user_company_roles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allocation_rows_rc_row" ON "allocation_rows" USING btree ("round_company_id","row_id");--> statement-breakpoint
CREATE UNIQUE INDEX "round_companies_round_company" ON "round_companies" USING btree ("round_id","company_id");--> statement-breakpoint
CREATE INDEX "rcci_rc_cat_idx" ON "round_company_code_items" USING btree ("round_company_id","category");--> statement-breakpoint
CREATE INDEX "rco_rc_idx" ON "round_company_orgs" USING btree ("round_company_id");--> statement-breakpoint
CREATE INDEX "rco_path_idx" ON "round_company_orgs" USING btree ("path");