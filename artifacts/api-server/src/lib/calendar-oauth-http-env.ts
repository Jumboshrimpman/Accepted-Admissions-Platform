export const hasCalendarOAuthDatabase = Boolean(process.env.DATABASE_URL);

process.env.SESSION_SECRET ??= "calendar-oauth-http-test-secret";
process.env.DATABASE_URL ??=
  "postgres://127.0.0.1:5432/calendar_oauth_http_test_unused";
