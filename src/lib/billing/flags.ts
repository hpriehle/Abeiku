/** Self-serve sign-up is open only when SIGNUP_OPEN=true (default off: /signup shows "opens soon"). */
export function signupOpen(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SIGNUP_OPEN === "true";
}
