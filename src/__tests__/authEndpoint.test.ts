import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "auth-endpoint-test-secret-at-least-32-chars";

import app from "../app";
import { prisma } from "../prismaClient";
import { createUser } from "../services/userService";
import { hashPassword } from "../utils/password";
import { deleteOrganizationCascade } from "./helpers/cleanup";

const PASSWORD = "a-very-strong-password-1";

let server: http.Server;
let baseUrl: string;
let organizationId: string;
let userId: string;
let userEmail: string;

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) =>
    server.once("listening", () => resolve()),
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = "http://127.0.0.1:" + address.port;

  const organization = await prisma.organization.create({
    data: {
      name: `Auth Test Org ${suffix}`,
      slug: `auth-test-org-${suffix}`,
      isActive: true,
    },
  });
  organizationId = organization.id;
  userEmail = `auth-test-${suffix}@example.test`;

  const created = await createUser({
    name: "Auth Test User",
    email: userEmail,
    password: PASSWORD,
    role: "STAFF",
    organizationId,
  });
  userId = created.id;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

  if (organizationId) {
    await deleteOrganizationCascade(organizationId);
  }
});

async function post(path: string, body: unknown) {
  const response = await fetch(baseUrl + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

test("login succeeds with correct credentials and returns a usable token", async () => {
  const { status, body } = await post("/auth/login", {
    email: userEmail,
    password: PASSWORD,
  });

  assert.equal(status, 200);
  assert.ok(body?.accessToken, "expected an access token");
  assert.equal(body.user.id, userId);
  assert.equal(body.user.organizationId, organizationId);
  assert.equal(
    Object.prototype.hasOwnProperty.call(body.user, "passwordHash"),
    false,
    "login must not leak the password hash",
  );

  const claims = jwt.verify(body.accessToken, process.env.JWT_SECRET!) as {
    id: string;
    organizationId: string;
  };
  assert.equal(claims.id, userId);
  assert.equal(claims.organizationId, organizationId);

  // The issued token must actually work against a protected route.
  const me = await fetch(`${baseUrl}/users/${userId}`, {
    headers: { authorization: `Bearer ${body.accessToken}` },
  });
  assert.equal(me.status, 200);
});

test("login creates an active security session", async () => {
  const before = await prisma.securitySession.count({
    where: { userId, isActive: true },
  });

  await post("/auth/login", { email: userEmail, password: PASSWORD });

  const after = await prisma.securitySession.count({
    where: { userId, isActive: true },
  });

  assert.equal(after, before + 1, "expected a new active session per login");
});

test("login rejects a wrong password without revealing the account exists", async () => {
  const { status, body } = await post("/auth/login", {
    email: userEmail,
    password: "definitely-the-wrong-password",
  });

  assert.equal(status, 401);
  assert.equal(body.error, "Invalid email or password");
});

test("login returns the same error for an unknown email", async () => {
  const { status, body } = await post("/auth/login", {
    email: `nobody-${suffix}@example.test`,
    password: "some-password-attempt",
  });

  assert.equal(status, 401);
  assert.equal(
    body.error,
    "Invalid email or password",
    "the response must not distinguish unknown accounts from bad passwords",
  );
});

test("login rejects a disabled account", async () => {
  const email = `disabled-${suffix}@example.test`;

  await createUser({
    name: "Disabled User",
    email,
    password: PASSWORD,
    role: "STAFF",
    organizationId,
  });

  const disabled = await prisma.user.findUnique({ where: { email } });
  await prisma.user.update({
    where: { id: disabled!.id },
    data: { isActive: false },
  });

  const { status } = await post("/auth/login", { email, password: PASSWORD });
  assert.equal(status, 403);

  await prisma.user.delete({ where: { id: disabled!.id } });
});

test("login records a FAILED_LOGIN security event", async () => {
  const email = `failed-log-${suffix}@example.test`;

  const created = await createUser({
    name: "Failed Log User",
    email,
    password: PASSWORD,
    role: "STAFF",
    organizationId,
  });

  await post("/auth/login", { email, password: "wrong-password-entirely" });

  const events = await prisma.securityEvent.findMany({
    where: { userId: created.id, eventType: "FAILED_LOGIN" },
  });

  assert.ok(events.length >= 1, "expected a FAILED_LOGIN event to be recorded");

  await prisma.user.delete({ where: { id: created.id } });
});

test("login refuses an account still holding a legacy plaintext password", async () => {
  const email = `legacy-${suffix}@example.test`;

  // Deliberately bypass createUser to reproduce the pre-hardening seed state.
  const legacy = await prisma.user.create({
    data: {
      name: "Legacy User",
      email,
      passwordHash: "hashed-legacy-password",
      role: "STAFF",
      organizationId,
      isActive: true,
    },
  });

  const { status } = await post("/auth/login", {
    email,
    password: "hashed-legacy-password",
  });

  assert.equal(
    status,
    403,
    "legacy plaintext credentials must not authenticate",
  );

  await prisma.user.delete({ where: { id: legacy.id } });
});

test("login requires an email and password", async () => {
  const missingPassword = await post("/auth/login", { email: userEmail });
  assert.equal(missingPassword.status, 400);

  const missingEmail = await post("/auth/login", { password: PASSWORD });
  assert.equal(missingEmail.status, 400);
});

test("logout requires authentication", async () => {
  const { status } = await post("/auth/logout", {});
  assert.equal(status, 401);
});

test("logout revokes the caller sessions", async () => {
  const { body } = await post("/auth/login", {
    email: userEmail,
    password: PASSWORD,
  });
  const token = body.accessToken as string;

  const activeBefore = await prisma.securitySession.count({
    where: { userId, isActive: true },
  });
  assert.ok(activeBefore > 0);

  const response = await fetch(`${baseUrl}/auth/logout`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });

  assert.equal(response.status, 200);

  const activeAfter = await prisma.securitySession.count({
    where: { userId, isActive: true },
  });
  assert.equal(
    activeAfter,
    0,
    "logout should deactivate all sessions for the user",
  );
});

test("security headers are present", async () => {
  const response = await fetch(`${baseUrl}/health`);

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("x-content-type-options"),
    "nosniff",
    "helmet should set X-Content-Type-Options",
  );
  assert.equal(
    response.headers.get("x-powered-by"),
    null,
    "x-powered-by should be disabled",
  );
});

test("health endpoint responds", async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = (await response.json()) as { status: string };

  assert.equal(response.status, 200);
  assert.equal(body.status, "ok");
});

