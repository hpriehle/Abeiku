// Real I/O for src/lib/partner/signup.ts (Supabase, Resend, rate limiter). Server only.
import { getAttemptStore } from "@/lib/auth/rate-limit";
import { supabaseAccountStore } from "@/lib/db/partner-accounts";
import { supabaseSignupStore } from "@/lib/db/partner-signup";
import { sendEmail } from "@/lib/notifications/email";
import { hashPassword } from "./auth";
import type { SignupDeps } from "./signup";

export async function signupDeps(): Promise<SignupDeps> {
  return {
    accounts: supabaseAccountStore,
    signup: supabaseSignupStore,
    attempts: await getAttemptStore(),
    hash: hashPassword,
    sendEmail,
  };
}
