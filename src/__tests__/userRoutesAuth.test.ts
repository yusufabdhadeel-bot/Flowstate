import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "user-routes-auth-test-secret-at-least-32-chars";

import app from "../app";
import { prisma } from "../prismaClient";
import { hashPassword } from "../utils/password";
import type { Role } from "@prisma/client";
import { deleteOrganizationCascade } from "./helpers/cleanup";

const PASSWORD = "a-very-strong-password-1";

let server: http.Server;
let baseUrl: string;

const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const createdOrgIds: string[] = [];

interface Seed {
  organizationId: string;
  adminId: string;
  memberId: string;
  token: string;
}

async function seed(label: string): Promise<Seed> {
  const organization = await prisma.organization.create({
    data: {
      name: `${label} Org`,
      slug: `${label}-org-${suffix}`.toLowerCase(),
      isActive: true,
    },
  });
  createdOrgIds.push(organization.id);

  const admin = await prisma.user.create({
    data: {
      name: `${label} Admin`,
      email: `${label.toLowerCase()}-admin-${suffix}@example.test`,
      passwordHash: await hashPassword(PASSWORD),
      role: "ADMIN",
      organizationId: organization.id,
      isActive: true,
    },
  });

  const member = await prisma.user.create({
    data: {
      name: `${label} Member`,
      email: `${label.toLowerCase()}-member-${suffix}@example.test`,
      passwordHash: await hashPassword(PASSWORD),
      role: "STAFF",
      organizationId: organization.id,
      isActive: true,
    },
  });

  const token = jwt.sign(
    {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      organizationId: organization.id,
    },
    process.env.JWT_SECRET!,
    { expiresIn: "1h" },
  );

  return {
    organizationId: organization.id,
    adminId: admin.id,
    memberId: member.id,
    token,
  };
}

before(async () => {
  server = app.listen(0);
  await new Promise<void>((resolve) =>
    server.once("listening", () => resolve()),
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = "http://127.0.0.1:" + address.port;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

  for (const id of createdOrgIds) {
    await deleteOrganizationCascade(id).catch(() => undefined);
  }
});

test("POST /users requires authentication", async () => {
  const response = await fetch(`${baseUrl}/users`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Unauthenticated",
      email: `unauth-${suffix}@example.test`,
      password: PASSWORD,
      role: "ADMIN" as Role,
      organizationId: "anything",
    }),
  });

  assert.equal(
    response.status,
    401,
    "must reject unauthenticated user creation",
  );
});

test("PATCH /users/:id/assign-manager requires authentication", async () => {
  const { memberId, adminId } = await seed("AssignNoauth");

  const response = await fetch(`${baseUrl}/users/${memberId}/assign-manager`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ managerId: adminId }),
  });

  assert.equal(
    response.status,
    401,
    "must reject unauthenticated manager assignment",
  );

  const user = await prisma.user.findUnique({ where: { id: memberId } });
  assert.equal(user?.reportsTo, null, "reportsTo must be unchanged");
});

test("POST /users rejects an invalid token", async () => {
  const response = await fetch(`${baseUrl}/users`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer not-a-real-token",
    },
    body: JSON.stringify({
      name: "Bad Token",
      email: `badtoken-${suffix}@example.test`,
      password: PASSWORD,
      role: "ADMIN" as Role,
    }),
  });

  assert.equal(response.status, 403);
});

test("POST /users hashes the password and omits it from the response", async () => {
  const { organizationId } = await seed("CreateHashed");

  const response = await fetch(`${baseUrl}/users`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${(await seed("CreateHashedAuth")).token}`,
    },
    body: JSON.stringify({
      name: "Created User",
      email: `created-${suffix}@example.test`,
      password: PASSWORD,
      role: "STAFF" as Role,
      organizationId,
    }),
  });

  assert.equal(response.status, 201);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(
    body.passwordHash,
    undefined,
    "response must not include passwordHash",
  );

  const stored = await prisma.user.findUnique({
    where: { email: `created-${suffix}@example.test` },
  });
  assert.ok(stored);
  assert.notEqual(stored!.passwordHash, PASSWORD);
  assert.match(stored!.passwordHash, /^\$2[aby]\$12\$/);
});

test("PATCH /users/:id/assign-manager cannot cross tenant boundaries", async () => {
  const orgA = await seed("TenantA");
  const orgB = await seed("TenantB");

  const target = await prisma.user.create({
    data: {
      name: "Tenant A Member",
      email: `tenanta-target-${suffix}@example.test`,
      passwordHash: await hashPassword(PASSWORD),
      role: "STAFF",
      organizationId: orgA.organizationId,
      isActive: true,
    },
  });

  // Caller is authenticated in org B but tries to reassign an org A user.
  const response = await fetch(`${baseUrl}/users/${target.id}/assign-manager`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${orgB.token}`,
    },
    body: JSON.stringify({ managerId: orgB.adminId }),
  });

  assert.equal(
    response.status,
    403,
    "cross-tenant manager assignment must be blocked",
  );

  const after = await prisma.user.findUnique({ where: { id: target.id } });
  assert.equal(after?.reportsTo, null, "reportsTo must remain unchanged");
});

