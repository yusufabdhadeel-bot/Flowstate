import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { prisma } from "../prismaClient";
import { UnauthorizedError, ForbiddenError, ValidationError } from "../errors";
import { verifyPassword, isLegacyPlaintextPassword } from "../utils/password";
import { createSession } from "./sessionManagementService";
import {
  detectMultipleFailedLogins,
  recordSecurityEvent,
} from "./securityMonitoringService";

const ACCESS_TOKEN_TTL_MINUTES = 60;
const SESSION_TTL_MINUTES = 60 * 24;

/** Failed-login attempts before we start raising security alerts. */
const FAILED_LOGIN_ALERT_THRESHOLD = 5;
const FAILED_LOGIN_WINDOW_MINUTES = 15;

/**
 * A bcrypt hash of a random value, used to keep the timing of a login attempt
 * roughly constant whether or not the account exists. Without this, a
 * "user not found" returns noticeably faster than "wrong password", which lets
 * an attacker enumerate valid email addresses.
 */
const DUMMY_HASH =
  "$2b$12$C6UzMDM.H6dfI/f/IKcEe.7dJEbT2XrJ4A3VvE9BuxR5O9Y5H3KHi";

export interface LoginInput {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface LoginResult {
  accessToken: string;
  expiresInSeconds: number;
  sessionId: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    organizationId: string;
  };
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "JWT_SECRET must be configured with at least 32 characters",
    );
  }
  return secret;
}

function normalizeEmail(email: unknown): string {
  if (typeof email !== "string" || !email.trim()) {
    throw new ValidationError("Email and password are required");
  }
  return email.trim().toLowerCase();
}

/**
 * Verify credentials, issue an access token, and open a security session.
 *
 * Failures return a single generic message for every cause (unknown account,
 * wrong password, disabled account) so the endpoint cannot be used to
 * enumerate which email addresses are registered.
 */
export async function login(input: LoginInput): Promise<LoginResult> {
  const email = normalizeEmail(input.email);

  if (typeof input.password !== "string" || !input.password) {
    throw new ValidationError("Email and password are required");
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // The original seed data stored plaintext placeholders. Check for that before
  // verifying, so these accounts get an explicit "reset your password" response
  // and can never authenticate.
  if (user && isLegacyPlaintextPassword(user.passwordHash)) {
    throw new ForbiddenError(
      "This account must reset its password before signing in",
    );
  }

  // Burn comparable time on the miss path so response timing does not leak
  // whether the account exists.
  const storedHash = user ? user.passwordHash : DUMMY_HASH;
  const passwordMatches = await verifyPassword(input.password, storedHash);

  if (!user || !passwordMatches) {
    if (user) {
      await recordFailedLogin(user, input);
    }
    throw new UnauthorizedError("Invalid email or password");
  }

  if (!user.isActive || user.isSuspended) {
    throw new ForbiddenError(
      "This account has been disabled. Contact your administrator.",
    );
  }

  if (user.mfaEnabled) {
    // MFA verification is a separate step and is not yet wired into this
    // endpoint. Fail closed rather than granting a token that bypasses it.
    throw new ForbiddenError(
      "Multi-factor authentication is required. Complete MFA enrolment before signing in.",
    );
  }

  const secret = getJwtSecret();
  const expiresInSeconds = ACCESS_TOKEN_TTL_MINUTES * 60;
  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    },
    secret,
    { expiresIn: `${ACCESS_TOKEN_TTL_MINUTES}m` },
  );

  const session = await createSession({
    userId: user.id,
    organizationId: user.organizationId,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    expiresInMinutes: SESSION_TTL_MINUTES,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await recordSecurityEvent({
    eventType: "LOGIN_SUCCESS",
    severity: "LOW",
    organizationId: user.organizationId,
    userId: user.id,
    ipAddress: input.ipAddress,
    description: `Successful login for ${user.email}`,
    timestamp: new Date(),
    resolved: false,
  });

  return {
    accessToken,
    expiresInSeconds,
    sessionId: session.id,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    },
  };
}

/**
 * Record a failed password attempt and, once the threshold is crossed, raise
 * a brute-force alert through the existing monitoring service.
 */
async function recordFailedLogin(
  user: { id: string; organizationId: string; email: string },
  input: LoginInput,
): Promise<void> {
  try {
    await recordSecurityEvent({
      eventType: "FAILED_LOGIN",
      severity: "LOW",
      organizationId: user.organizationId,
      userId: user.id,
      ipAddress: input.ipAddress,
      description: `Failed login attempt for ${user.email}`,
      metadata: { userAgent: input.userAgent ?? null },
      timestamp: new Date(),
      resolved: false,
    });

    await detectMultipleFailedLogins(
      user.organizationId,
      user.id,
      input.ipAddress,
      FAILED_LOGIN_ALERT_THRESHOLD,
      FAILED_LOGIN_WINDOW_MINUTES,
    );
  } catch (error) {
    // Security bookkeeping must never turn a valid failure response into a 500.
    console.error("[AUTH] Failed to record failed-login event", error);
  }
}

/** Opaque random token, used where a JWT is not required. */
export function generateOpaqueToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}
