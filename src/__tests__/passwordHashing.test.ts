import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  isLegacyPlaintextPassword,
} from "../utils/password";
import { createUser } from "../services/userService";
import { deleteOrganizationCascade } from "./helpers/cleanup";

const PASSWORD = "correct-horse-battery-staple";

test("hashPassword produces a bcrypt hash that verifyPassword accepts", async () => {
  const hash = await hashPassword(PASSWORD);

  assert.notEqual(hash, PASSWORD);
  assert.match(hash, /^\$2[aby]\$12\$/, "expected a bcrypt hash with cost 12");
  assert.equal(isLegacyPlaintextPassword(hash), false);

  assert.equal(await verifyPassword(PASSWORD, hash), true);
});

test("verifyPassword rejects the wrong password", async () => {
  const hash = await hashPassword(PASSWORD);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("bcrypt salts each hash, so equal passwords produce different hashes", async () => {
  const first = await hashPassword(PASSWORD);
  const second = await hashPassword(PASSWORD);

  assert.notEqual(first, second);
  assert.equal(await verifyPassword(PASSWORD, first), true);
  assert.equal(await verifyPassword(PASSWORD, second), true);
});

test("verifyPassword returns false for legacy or malformed stored values", async () => {
  assert.equal(await verifyPassword(PASSWORD, "hashed-admin-password"), false);
  assert.equal(await verifyPassword(PASSWORD, null), false);
  assert.equal(await verifyPassword(PASSWORD, undefined), false);
  assert.equal(await verifyPassword(PASSWORD, ""), false);
  assert.equal(await verifyPassword("", "anything"), false);
});

test("isLegacyPlaintextPassword flags the original seed placeholders", () => {
  assert.equal(isLegacyPlaintextPassword("hashed-admin-password"), true);
  assert.equal(isLegacyPlaintextPassword("plaintext"), true);
  assert.equal(isLegacyPlaintextPassword(null), true);
});

test("createUser hashes the password instead of storing it verbatim", async () => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `hash-check-${suffix}@example.test`;

  const { prisma } = await import("../prismaClient");

  const organization = await prisma.organization.create({
    data: {
      name: `Hash Check Org ${suffix}`,
      slug: `hash-check-org-${suffix}`,
      isActive: true,
    },
  });

  try {
    const created = await createUser({
      name: "Hash Check User",
      email,
      password: PASSWORD,
      role: "STAFF",
      organizationId: organization.id,
    });

    const stored = await prisma.user.findUnique({ where: { id: created.id } });

    assert.ok(stored, "expected the user to be persisted");
    assert.notEqual(
      stored!.passwordHash,
      PASSWORD,
      "password must not be stored in plaintext",
    );
    assert.match(stored!.passwordHash, /^\$2[aby]\$12\$/);
    assert.equal(await verifyPassword(PASSWORD, stored!.passwordHash), true);
  } finally {
    await deleteOrganizationCascade(organization.id);
  }
});

test("createUser refuses a password that is too short", async () => {
  const { prisma } = await import("../prismaClient");

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const organization = await prisma.organization.create({
    data: {
      name: `Short Password Org ${suffix}`,
      slug: `short-pw-org-${suffix}`,
      isActive: true,
    },
  });

  try {
    await assert.rejects(
      () =>
        createUser({
          name: "Short Password User",
          email: `short-pw-${suffix}@example.test`,
          password: "short",
          role: "STAFF",
          organizationId: organization.id,
        }),
      /at least 12 characters/,
    );
  } finally {
    await deleteOrganizationCascade(organization.id);
  }
});

test("createUser does not return the password hash to the caller", async () => {
  const { prisma } = await import("../prismaClient");

  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const organization = await prisma.organization.create({
    data: {
      name: `No Leak Org ${suffix}`,
      slug: `no-leak-org-${suffix}`,
      isActive: true,
    },
  });

  try {
    const created = await createUser({
      name: "No Leak User",
      email: `no-leak-${suffix}@example.test`,
      password: PASSWORD,
      role: "STAFF",
      organizationId: organization.id,
    });

    assert.equal(
      Object.prototype.hasOwnProperty.call(created, "passwordHash"),
      false,
      "the API response must not contain passwordHash",
    );
  } finally {
    await deleteOrganizationCascade(organization.id);
  }
});

