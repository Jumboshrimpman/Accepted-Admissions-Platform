# Accepted Admissions production provisioning

The API applies committed Drizzle migrations before it starts. Production access is deny-by-default and is provisioned with Clerk user IDs, never by public self-enrollment.

Set the following environment variables as comma-separated Clerk user IDs:

- `ACCEPTED_ADMIN_CLERK_USER_IDS`: administrators; administrators can see all courses.
- `ACCEPTED_TUTOR_CLERK_USER_IDS`: tutors enrolled in the seeded Fall 2026 course.
- `ACCEPTED_STUDENT_CLERK_USER_IDS`: students enrolled in the seeded Fall 2026 course.

An identity not present in an allowlist can authenticate but receives no course membership and cannot read private course, session, assignment, attempt, or review data. Update allowlists through Replit environment configuration, then restart the API workflow. Existing database roles and memberships remain unchanged; use a database administrator to revoke existing access when needed.

Development preview users are automatically enrolled in the seeded course so the private portal can be evaluated locally. This branch is gated by `NODE_ENV === "development"` and is not active in published deployments.