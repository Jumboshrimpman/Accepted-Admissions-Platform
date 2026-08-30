CREATE TABLE "tutor_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"tutor_user_id" uuid NOT NULL,
	"student_user_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_sources" ADD COLUMN "subject" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "course_memberships" ADD COLUMN "subject" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "tutor_assignments" ADD CONSTRAINT "tutor_assignments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_assignments" ADD CONSTRAINT "tutor_assignments_tutor_user_id_users_id_fk" FOREIGN KEY ("tutor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_assignments" ADD CONSTRAINT "tutor_assignments_student_user_id_users_id_fk" FOREIGN KEY ("student_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tutor_assignment_unique_idx" ON "tutor_assignments" USING btree ("course_id","tutor_user_id","student_user_id","subject");