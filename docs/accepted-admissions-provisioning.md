# Accepted Admissions production provisioning

The API applies committed Drizzle migrations before it starts. Portal access is deny-by-default and is provisioned with Clerk user IDs, never by public self-enrollment. The browser keeps the Clerk session in Clerk-managed secure cookies; the app does not persist bearer tokens in `localStorage`.

Set the following environment variables as comma-separated Clerk user IDs:

- `ACCEPTED_ADMIN_CLERK_USER_IDS`: administrators; administrators can see all courses.
- `ACCEPTED_SAT_TUTOR_CLERK_USER_IDS`: SAT tutors; they receive the SAT subject scope.
- `ACCEPTED_ENGLISH_TUTOR_CLERK_USER_IDS`: English/IELTS tutors; they receive the IELTS subject scope.
- `ACCEPTED_TUTOR_CLERK_USER_IDS`: optional legacy tutor allowlist for a tutor who is intentionally assigned to all subjects.
- `ACCEPTED_STUDENT_CLERK_USER_IDS`: students enrolled in the seeded Fall 2026 course.

The intended roster is:

- Taito Goto — `taito0525@gmail.com` — student/client
- Eunice Chon — `eunice_chon@berkeley.edu` — SAT tutor
- Nika Raiffe — `nika.raiffe@gmail.com` — English/IELTS tutor
- `admin@acceptedadmissions.org` — master administrator

Do not send invitations until the owner confirms these production addresses.

## Owner onboarding checklist

1. In the Clerk Development or Production instance, create or invite the confirmed email addresses. Do not enable a public sign-up path for this private portal.
2. After each invited user has a Clerk account, copy the Clerk user ID into the matching role-specific environment variable. Never use an email address as the authorization key.
3. Restart the API workflow after changing the environment configuration.
4. Have each invited user sign in at `/login`; `/portal` is the canonical return path. `/sign-in` remains an alias, and `/t-g` only redirects to the secure entry point.
5. On the first authorized request, the API records the application user and the appropriate PostgreSQL course membership. Tutors also receive a subject-scoped tutor assignment to provisioned students in that course.
6. Sign in as the administrator and review the **Access provisioning** and **Memberships & audit** panels at `/admin`.
7. To revoke access, remove the Clerk user ID from the allowlist, restart the API workflow, and revoke the Clerk session/invitation. Remove old PostgreSQL memberships or tutor assignments as part of the offboarding review.

An identity not present in an allowlist can authenticate with Clerk but receives no application user, course membership, or private course/session/assignment/attempt/review data. Existing database roles are never selected by the browser. The API records denied requests for previously provisioned users without storing session tokens or passwords.

There is no development auto-enrollment exception: preview identities must also be explicitly allowlisted. This prevents a test identity from becoming a student merely by signing in.