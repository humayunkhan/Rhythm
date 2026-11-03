export interface Env {
  DB: D1Database;
  APP_NAME?: string;
  ADMIN_EMAIL?: string;
  ADMIN_SETUP_CODE?: string;
  SESSION_PEPPER?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
  /** OpenAI-compatible server; takes precedence over Claude when set. */
  LLM_BASE_URL?: string;
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  LLM_MAX_TOKENS?: string;
  /** "off" sends vLLM's chat_template_kwargs to turn model thinking off. */
  LLM_THINKING?: string;
  /** How long one AI call may run before the engine answers instead. Default 45000. */
  LLM_TIMEOUT_MS?: string;
  /** Encrypts users' own AI keys. Falls back to SESSION_PEPPER. Changing it makes stored keys unreadable. */
  AI_KEY_SECRET?: string;
  AI_OWN_KEY_DAILY_LIMIT?: string;
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
  disclaimer_ack_at?: number | null;
  /** JSON map of the user's stock dilutions by note id. */
  dilutions?: string;
  /** 1 when the user has saved their own AI provider; only set by loadUser. */
  own_ai?: number;
}

export type AppEnv = { Bindings: Env; Variables: { user: UserRow | null } };

/** Bump when the terms change: users are asked to accept again before saving. */
export const TERMS_VERSION = "2026-11-01";
