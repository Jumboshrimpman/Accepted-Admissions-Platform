# Accepted Admissions production provisioning

The API applies committed Drizzle migrations before it starts. Portal access is deny-by-default and is provisioned with Clerk user IDs, never by public self-enrollment. The browser keeps the Clerk session in Clerk-managed secure cookies; the app does not persist bearer tokens in `localStorage`.

Set the following environment variables as comma-separated Clerk user IDs via
host Secrets or a local `.env` (see `.env.example`). Do not commit allowlist
values into `.replit` or other tracked config. Email matching is performed only
against Clerk's verified server-side primary email; the approved email fallback
roster below is operator documentation, not committed runtime configuration.

- `ACCEPTED_ADMIN_CLERK_USER_IDS`: administrators; administrators can see all courses.
- `ACCEPTED_SAT_TUTOR_CLERK_USER_IDS`: SAT tutors; they receive the SAT subject scope.
- `ACCEPTED_ENGLISH_TUTOR_CLERK_USER_IDS`: English/IELTS tutors; they receive the IELTS subject scope.
- `ACCEPTED_TUTOR_CLERK_USER_IDS`: optional legacy tutor allowlist for a tutor who is intentionally assigned to all subjects.
- `ACCEPTED_STUDENT_CLERK_USER_IDS`: students enrolled in the seeded Fall 2026 course.
- `ACCEPTED_VIEWER_CLERK_USER_IDS`: read-only viewers; the current viewer policy links to Taito’s student record when it exists.

The approved shared/development email roster is:

| Email | Role | Scope |
| --- | --- | --- |
| `admin@acceptedadmissions.org` | administrator | all courses |
| `xsfam6@gmail.com` | SAT tutor | SAT |
| `eunice_chon@berkeley.edu` | SAT tutor | SAT |
| `taito0525@gmail.com` | student/client | Fall 2026 student course and sessions |
| `nika.raiffe@gmail.com` | English/IELTS tutor | IELTS/English |
| `ryo@jaac.co.jp` | viewer | read-only mirror of Taito’s client account |

Ryo's viewer link uses the relationship **“view only mirror of Taito’s client
account”** and is the only permitted active link for that viewer. The link is
reconciled on either account's first authorized request, so it does not depend
on whether Ryo or Taito signs in first. Viewer writes are rejected with
`VIEW_ONLY`.

Do not send invitations until the owner confirms these production addresses.

## Owner onboarding checklist

1. In the Clerk Development or Production instance, create or invite the confirmed email addresses. Do not enable a public sign-up path for this private portal.
2. After each invited user has a Clerk account, copy the Clerk user ID into the matching role-specific environment variable. Never use an email address as the authorization key. The approved shared/development email roster remains as a fallback when a user ID changes between sign-in providers.
3. Restart the **API Server** workflow after changing the environment configuration so the new allowlists are loaded.
4. Reload the browser preview after the API restart, then have each invited user sign in at `/login`; `/portal` is the canonical return path. `/sign-in` remains an alias, and `/t-g` only redirects to the secure entry point.
5. On the first authorized request, the API records the application user and the appropriate PostgreSQL course membership. Tutors also receive a subject-scoped tutor assignment to provisioned students in that course.
6. Sign in as the administrator and review the **Access provisioning** and **Memberships & audit** panels at `/admin`.
7. To revoke access, remove the Clerk user ID from the allowlist, restart the API workflow, and revoke the Clerk session/invitation. Remove old PostgreSQL memberships or tutor assignments as part of the offboarding review.

An identity not present in an allowlist can authenticate with Clerk but receives no application user, course membership, or private course/session/assignment/attempt/review data. Existing database roles are never selected by the browser. The API records denied requests for previously provisioned users without storing session tokens or passwords.

There is no development auto-enrollment exception: preview identities must also be explicitly allowlisted. This prevents a test identity from becoming a student merely by signing in.

## Preview verification

Development and production use separate Clerk user stores. Use the following
sequence when checking the preview:

1. Open `/login` in the preview and sign in with the intended development account.
2. If `/portal` says the account is not on the access list, copy the
   **Development account reference** shown on that page.
3. Put that exact ID in the matching shared/development allowlist. Do not use
   the email address as the environment variable value.
4. Restart the API workflow so it loads the updated allowlist.
5. Reload `/portal`. The first successful `/api/me` request creates the
   application user and role-specific memberships.
6. Confirm the role landing page: student at `/portal`, tutors at `/tutor`, and
   administrators at `/admin`.
7. Confirm a direct URL for another role shows an access message rather than
   private data.
8. For a viewer, confirm the dashboard displays “You are viewing Taito Goto’s
   dashboard in view-only mode.” and that both UI actions and direct mutation
   requests are rejected with `VIEW_ONLY`.

Expected error states:

- `401`: Clerk has no valid browser session; return to `/login`.
- `403` with `IDENTITY_NOT_PROVISIONED`: Clerk sign-in succeeded, but the
  development user ID is missing from all role allowlists.
- `403` with `ROLE_PROVISIONING_MISMATCH`: the Clerk ID is allowlisted for a
  different role than the existing application user; review the role assignment
  before changing it.
- `403` with `VIEW_ONLY`: the authenticated account is a linked viewer and the
  requested method would modify private portal data.