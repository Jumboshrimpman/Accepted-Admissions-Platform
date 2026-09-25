# Accepted Admissions production provisioning

The API applies committed Drizzle migrations before it starts. Portal access is deny-by-default and is never opened by public self-enrollment. Administrators provision **tutors**, **students**, and **parent viewers** from `/admin/curriculum?section=people`. That path is the source of truth for those roles: the API finds or creates the user in **Production Clerk** (`CLERK_SECRET_KEY`), marks the email verified when the API allows, and stores the real Production `clerkUserId` on `portal_access_grants`. **Do not update Railway `ACCEPTED_*_CLERK_USER_IDS` / `ACCEPTED_*_EMAILS` for People-provisioned tutors, students, or parent viewers.** Administrator identities remain environment-only. The browser keeps the Clerk session in Clerk-managed secure cookies; the app does not persist bearer tokens in `localStorage`.

Set the following environment variables as comma-separated Clerk user IDs via
host Secrets or a local `.env` (see `.env.example`). Do not commit allowlist
values into `.replit` or other tracked config. Email matching is performed only
against Clerk's verified server-side primary email; the approved email fallback
roster below is operator documentation, not committed runtime configuration.

- `ACCEPTED_ADMIN_CLERK_USER_IDS`: administrators; administrators can see all courses.
- `ACCEPTED_SAT_TUTOR_CLERK_USER_IDS`: optional legacy SAT tutor override. New SAT tutors should be provisioned under People instead. If this fallback is still set, it must include Xavier’s Production id `user_3IxUfoT1xRnDsqhlx5NN1eGfRg6` and must **not** include the retired duplicate `user_3IsvKVDGAg5KdvwHhvODf2VFqtd`. DB grants remain the source of truth (PR #25).
- `ACCEPTED_ENGLISH_TUTOR_CLERK_USER_IDS`: optional legacy English/IELTS tutor override. New IELTS tutors should be provisioned under People instead.
- `ACCEPTED_TUTOR_CLERK_USER_IDS`: optional legacy tutor allowlist for a tutor who is intentionally assigned to all subjects.
- `ACCEPTED_STUDENT_CLERK_USER_IDS`: optional legacy student override. New students should be provisioned under People instead.
- `ACCEPTED_VIEWER_CLERK_USER_IDS`: optional legacy viewer override. New parent viewers should be provisioned under People and linked to exactly one student. If this fallback is still set, it still mirrors Taito (`taito0525@gmail.com`). Prefer the database grant.

The approved shared/development email roster is:

| Email | Role | Scope |
| --- | --- | --- |
| `admin@acceptedadmissions.org` | administrator | all courses |
| `xaver.rmz6@gmail.com` | SAT tutor | SAT. Production Clerk id `user_3IxUfoT1xRnDsqhlx5NN1eGfRg6`. Do not use `xavier.rmz6@gmail.com`, `xsfam6@gmail.com`, or Clerk id `user_3IsvKVDGAg5KdvwHhvODf2VFqtd`. |
| `eunice_chon@berkeley.edu` | SAT tutor | SAT |
| `taito0525@gmail.com` | student/client | Fall 2026 student course and sessions |
| `nika.raiffe@gmail.com` | English/IELTS tutor | IELTS/English |
| `ryo@jaac.co.jp` | parent viewer | read-only mirror of Taito’s client account |

Ryo (`ryo@jaac.co.jp`, Production Clerk `user_3IsvKcNhmcqPtcxFfGOYgtR4MAc`) is a parent viewer of Taito Goto (`taito0525@gmail.com`, Production Clerk `user_3IsvKdTAnOmfXNTiOlOvupgfjZl`). Migration `0041_viewer_role_category` adds the `viewer` grant role and `linked_student_email`. Migration `0042_ryo_taito_parent_mirror` activates the `viewer_links` row when both app users already exist. Before the API listens, startup upserts the `portal_access_grants` row (`role_category = viewer`, `linked_student_email = taito0525@gmail.com`, Clerk id `user_3IsvKcNhmcqPtcxFfGOYgtR4MAc`) and sets Ryo’s app role to `viewer` when his user row exists. No Clerk invitation is sent. Ryo signs in with his own account. He does not use Taito’s password. No People click is required for this pair.

The viewer link uses the relationship **“view only mirror of Taito’s client account”** and is the only permitted active link for Ryo. Other students are not visible. Taito’s own student login is unchanged, including off-platform SAT billing (no self-serve purchase or receipts). Parent writes are rejected with `VIEW_ONLY`. The portal shows a **Parent view · Viewing as {student}** banner.

To attach another parent later, use **Provision people**, choose **Parent viewer**, and select that one student. Revoking the grant turns the mirror off.

People provisioning does **not** send Clerk invitation emails. Sign-in uses the Production Clerk account created or linked from the provisioned email (OTP works after admin email verification).

## Xavier Morales identity (canonical vs retired duplicate)

A wrong email was provisioned first, which created a second Production Clerk user and a second People / portal Xavier.

| | Keep | Retire |
| --- | --- | --- |
| Email | `xaver.rmz6@gmail.com` (not `xavier.rmz6`) | `xavier.rmz6@gmail.com`, `xsfam6@gmail.com` |
| Production Clerk id | `user_3IxUfoT1xRnDsqhlx5NN1eGfRg6` | `user_3IsvKVDGAg5KdvwHhvODf2VFqtd` |

Migration `0034_retire_duplicate_xavier_clerk` and startup reconcile:

- Re-point sessions, tutor assignments, course memberships, calendar rows, and grants from the retired app user to the canonical Xavier when both rows exist. API start runs this reconcile before the #33 SAT capability-test session seed so that session stays on `user_3IxUfoT1xRnDsqhlx5NN1eGfRg6`.
- Soft-retire the duplicate app user and tutor profile (unlink, deactivate, mark `SUPERSEDED`). Rows are not hard-deleted.
- Deny the retired Clerk id / emails even if they remain on a Railway allowlist, so the duplicate cannot be re-created on sign-in.

### Owner steps after deploy

1. Confirm People shows one Xavier: `xaver.rmz6@gmail.com` / `user_3IxUfoT1xRnDsqhlx5NN1eGfRg6`.
2. **Railway allowlist (only if `ACCEPTED_SAT_TUTOR_CLERK_USER_IDS` is still used as a fallback):** set it to include `user_3IxUfoT1xRnDsqhlx5NN1eGfRg6` and remove `user_3IsvKVDGAg5KdvwHhvODf2VFqtd`. Restart the API service. Prefer leaving SAT tutor access on the People DB grant (PR #25) instead of the env list.
3. Xavier signs in at `/login` with **`xaver.rmz6@gmail.com`** and completes Google Calendar consent at `/tutor` if the calendar is still disconnected.
4. **Clerk Dashboard (manual, optional):** after the app-side retire is live and the Railway allowlist no longer contains the bad id, the retired Clerk user `user_3IsvKVDGAg5KdvwHhvODf2VFqtd` may be deleted in the Production Clerk Dashboard. Do not delete `user_3IxUfoT1xRnDsqhlx5NN1eGfRg6`. This repo does not call Clerk delete APIs and does not send invites.

Eunice Chon is unchanged: `eunice_chon@berkeley.edu`.

## Owner onboarding checklist

1. Keep public sign-up disabled on the Production Clerk instance. Administrator identities still use environment allowlists (`ACCEPTED_ADMIN_*`). `ACCEPTED_VIEWER_*` is only a legacy fallback.
2. For **tutors, students, and parent viewers**, use **Provision people** at
   `/admin/curriculum?section=people`. Enter the email (and optional Production
   Clerk user ID). For a parent viewer, select the one student to mirror. The
   API looks up the Production user; if missing, it creates one without an
   invitation. A pasted ID from another Clerk instance is ignored and replaced.
   Railway env sync is not required for these roles.
3. Restart the **API Server** workflow only after changing **administrator**
   environment allowlists (or the legacy viewer fallback). People grants take
   effect without a Railway variable change. Ryo’s Taito mirror is applied by
   migrations `0041_viewer_role_category` and `0042_ryo_taito_parent_mirror`,
   then the access grant is upserted on API startup. No separate People step
   is required for this pair.
4. Have the provisioned person sign in at `/login`; `/portal` is the canonical return path. `/sign-in` remains an alias, and `/t-g` only redirects to the secure entry point.
5. On the first authorized request, the API records the application user and the appropriate PostgreSQL course membership. The approved seed roster (Taito/Nika/Eunice/Michelle) still receives those tutor assignments automatically. Additional links are created only from People assign.
6. Sign in as the administrator and review **Clients & tutors** at
   `/admin/curriculum?section=people`. Use **Provision people** to grant
   student or tutor access, then **Assign** to link tutors and students.
   Client preview is read-only and reflects those live links.
   Administrator roles remain environment-only. Parent viewers are People grants
   linked to one student.
7. To revoke in-app grants, use **Revoke** on the access grant. Revoking a parent
   viewer turns off that mirror. To revoke environment allowlist access for
   administrators (or a legacy viewer fallback), remove the Clerk user ID from
   the allowlist and restart the API workflow. Remove old PostgreSQL memberships
   or tutor assignments as part of the offboarding review.

An identity that is not an administrator on the environment allowlists and does not have an active `portal_access_grants` row (or a legacy tutor/student/viewer env override) can authenticate with Clerk but receives no application user, course membership, or private course/session/assignment/attempt/review data. Existing database roles are never selected by the browser. The API records denied requests for previously provisioned users without storing session tokens or passwords. A parent viewer’s active link is the only student they can read.

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
8. For Ryo, sign in as `ryo@jaac.co.jp` (not as Taito). Confirm the banner says
   “Viewing as” Taito, the curriculum matches Taito’s portal (including hidden
   SAT payment/receipts), and both UI actions and direct mutation requests are
   rejected with `VIEW_ONLY`. Confirm another student’s sessions are not listed.

Expected error states:

- `401`: Clerk has no valid browser session; return to `/login`.
- `403` with `IDENTITY_NOT_PROVISIONED`: Clerk sign-in succeeded, but the
  development user ID is missing from all role allowlists.
- `403` with `ROLE_PROVISIONING_MISMATCH`: the Clerk ID is allowlisted for a
  different role than the existing application user; review the role assignment
  before changing it.
- `403` with `VIEW_ONLY`: the authenticated account is a linked viewer and the
  requested method would modify private portal data.

## Stripe webhook

Production Stripe must deliver to `https://app.acceptedadmissions.org/api/stripe/webhook`. Do not use the retired Replit host. People provisioning still does not send Clerk invitations. See `docs/stripe-webhook.md`.

## Public guidance form email

The `/client-request` form always saves a row for the admin portal (**`/admin#guidance-requests`**). Email to **`admin@acceptedadmissions.org`** is optional best-effort (no Clerk invites, no submitter `To`). `RESEND_API_KEY` is not required for submit success. See `docs/transactional-email.md`.