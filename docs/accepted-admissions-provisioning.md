# Accepted Admissions production provisioning

The API applies committed Drizzle migrations before it starts. Portal access is deny-by-default and is never opened by public self-enrollment. Administrators provision **tutors** and **students** from `/admin/curriculum?section=people`. That path is the source of truth for those roles: the API finds or creates the user in **Production Clerk** (`CLERK_SECRET_KEY`), marks the email verified when the API allows, and stores the real Production `clerkUserId` on `portal_access_grants`. **Do not update Railway `ACCEPTED_*_CLERK_USER_IDS` / `ACCEPTED_*_EMAILS` for People-provisioned tutors or students.** Administrator and viewer roles remain environment-only. The browser keeps the Clerk session in Clerk-managed secure cookies; the app does not persist bearer tokens in `localStorage`.

Set the following environment variables as comma-separated Clerk user IDs via
host Secrets or a local `.env` (see `.env.example`). Do not commit allowlist
values into `.replit` or other tracked config. Email matching is performed only
against Clerk's verified server-side primary email; the approved email fallback
roster below is operator documentation, not committed runtime configuration.

- `ACCEPTED_ADMIN_CLERK_USER_IDS`: administrators; administrators can see all courses.
- `ACCEPTED_SAT_TUTOR_CLERK_USER_IDS`: optional legacy SAT tutor override. New SAT tutors should be provisioned under People instead.
- `ACCEPTED_ENGLISH_TUTOR_CLERK_USER_IDS`: optional legacy English/IELTS tutor override. New IELTS tutors should be provisioned under People instead.
- `ACCEPTED_TUTOR_CLERK_USER_IDS`: optional legacy tutor allowlist for a tutor who is intentionally assigned to all subjects.
- `ACCEPTED_STUDENT_CLERK_USER_IDS`: optional legacy student override. New students should be provisioned under People instead.
- `ACCEPTED_VIEWER_CLERK_USER_IDS`: read-only viewers; the current viewer policy links to Taito’s student record when it exists. Administrator and viewer identities are never created from the People UI.

The approved shared/development email roster is:

| Email | Role | Scope |
| --- | --- | --- |
| `admin@acceptedadmissions.org` | administrator | all courses |
| `xaver.rmz6@gmail.com` | SAT tutor | SAT |
| `eunice_chon@berkeley.edu` | SAT tutor | SAT |
| `taito0525@gmail.com` | student/client | Fall 2026 student course and sessions |
| `nika.raiffe@gmail.com` | English/IELTS tutor | IELTS/English |
| `ryo@jaac.co.jp` | viewer | read-only mirror of Taito’s client account |

Ryo's viewer link uses the relationship **“view only mirror of Taito’s client
account”** and is the only permitted active link for that viewer. The link is
reconciled on either account's first authorized request, so it does not depend
on whether Ryo or Taito signs in first. Viewer writes are rejected with
`VIEW_ONLY`.

People provisioning does **not** send Clerk invitation emails. Sign-in uses the Production Clerk account created or linked from the provisioned email (OTP works after admin email verification).

## Owner onboarding checklist

1. Keep public sign-up disabled on the Production Clerk instance. Administrator and viewer identities still use environment allowlists (`ACCEPTED_ADMIN_*` / `ACCEPTED_VIEWER_*`).
2. For **tutors and students**, use **Provision people** at
   `/admin/curriculum?section=people`. Enter the email (and optional Production
   Clerk user ID). The API looks up the Production user; if missing, it creates
   one without an invitation. A pasted ID from another Clerk instance is
   ignored and replaced. Railway env sync is not required for these roles.
3. Restart the **API Server** workflow only after changing **administrator or
   viewer** environment allowlists. Tutor/student People grants take effect
   without a Railway variable change.
4. Have the provisioned person sign in at `/login`; `/portal` is the canonical return path. `/sign-in` remains an alias, and `/t-g` only redirects to the secure entry point.
5. On the first authorized request, the API records the application user and the appropriate PostgreSQL course membership. Tutors also receive a subject-scoped tutor assignment to provisioned students in that course.
6. Sign in as the administrator and review **Clients & tutors** at
   `/admin/curriculum?section=people`. Use **Provision people** to grant
   student or tutor access without editing environment allowlists.
   Administrator and viewer roles remain environment-only.
7. To revoke in-app grants, use **Revoke** on the access grant. To revoke
   environment allowlist access for administrators or viewers, remove the
   Clerk user ID from the allowlist and restart the API workflow. Remove
   old PostgreSQL memberships or tutor assignments as part of the offboarding
   review.

An identity that is not an administrator/viewer on the environment allowlists and does not have an active `portal_access_grants` row (or a legacy tutor/student env override) can authenticate with Clerk but receives no application user, course membership, or private course/session/assignment/attempt/review data. Existing database roles are never selected by the browser. The API records denied requests for previously provisioned users without storing session tokens or passwords.

There is no development auto-enrollment exception: preview identities must also be explicitly provisioned (People grant or env allowlist). This prevents a test identity from becoming a student merely by signing in.

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