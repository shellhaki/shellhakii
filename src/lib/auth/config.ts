import "server-only";

/** Thrown when the auth layer is not configured. Routes map this to 503. */
export class AuthConfigError extends Error {
  constructor(message = "Sign-in is not configured.") {
    super(message);
    this.name = "AuthConfigError";
  }
}

/** Read AUTH_SECRET or throw AuthConfigError (mapped to 503 by auth routes). */
export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new AuthConfigError();
  }
  return secret;
}
