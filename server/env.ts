export interface Env {
  DB: D1Database;
  APP_NAME?: string;
  ADMIN_EMAIL?: string;
  ADMIN_SETUP_CODE?: string;
  SESSION_PEPPER?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  AI_DAILY_LIMIT?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string | null;
  email_verified: number;
  role: string;
  disabled: number;
  terms_version: string | null;
  terms_accepted_at: number | null;
  taste: string;
  created_at: number;
  last_login_at: number | null;
}

export type AppEnv = { Bindings: Env; Variables: { user: UserRow | null } };

/** Bump when the terms change: users are asked to accept again before saving. */
export const TERMS_VERSION = "2026-11-01";
