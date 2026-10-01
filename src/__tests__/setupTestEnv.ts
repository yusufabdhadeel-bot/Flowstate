/**
 * Test bootstrap. Loaded via `-r` before any test module, so it must run
 * before anything imports the Prisma client.
 *
 * Derives a dedicated test database from DATABASE_URL (appending `_test` to
 * the database name) so the suite can never truncate or write to development
 * data. Set FLOWSTATE_TEST_DATABASE_URL to override the whole URL.
 */
import fs from "node:fs";
import path from "node:path";

process.env.NODE_ENV = "test";

// Parse .env into a separate object. We deliberately do NOT use process.env as
// the source of truth for DATABASE_URL: this module rewrites
// process.env.DATABASE_URL, and the test runner can load it more than once in
// a single process, so re-deriving from the already-rewritten value would trip
// the safety interlock below.
const fileEnv: Record<string, string> = {};
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fileEnv[match[1]] = value;
    if (process.env[match[1]] === undefined) {
      process.env[match[1]] = value;
    }
  }
}

const devUrl = fileEnv.DATABASE_URL ?? process.env.DATABASE_URL;
const override =
  fileEnv.FLOWSTATE_TEST_DATABASE_URL ??
  process.env.FLOWSTATE_TEST_DATABASE_URL;

if (!devUrl && !override) {
  throw new Error(
    "DATABASE_URL (or FLOWSTATE_TEST_DATABASE_URL) must be set to run tests",
  );
}

/**
 * Append `_test` to the database name, leaving credentials, host, port and
 * query parameters untouched.
 */
function deriveTestDatabaseUrl(url: string): string {
  const parsed = new URL(url);
  const current = parsed.pathname.replace(/^\//, "");
  if (!current) {
    throw new Error(`Could not determine a database name from: ${url}`);
  }
  const name = current.endsWith("_test") ? current : `${current}_test`;
  parsed.pathname = `/${name}`;
  return parsed.toString();
}

const testUrl = override ?? deriveTestDatabaseUrl(devUrl as string);

// Safety interlock: never let the suite run against the development database.
const testDbName = new URL(testUrl).pathname.replace(/^\//, "");
const devDbName = devUrl ? new URL(devUrl).pathname.replace(/^\//, "") : testDbName;
if (testDbName === devDbName) {
  throw new Error(
    `Refusing to run tests: resolved test database "${testDbName}" is the same as the development database.`,
  );
}

process.env.DATABASE_URL = testUrl;
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? "flowstate-test-jwt-secret-at-least-32-chars";
process.env.NODE_ENV = "test";

console.log(`[test] Using isolated database: ${testDbName}`);
