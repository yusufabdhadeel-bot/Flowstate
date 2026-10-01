/**
 * Creates the isolated `_test` database (if missing) and applies the existing
 * Prisma migrations to it, so `npm test` never touches development data.
 *
 * Usage: npm run test:prepare
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    if (process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

loadEnvFile();

const baseUrl =
  process.env.FLOWSTATE_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!baseUrl) {
  throw new Error("DATABASE_URL (or FLOWSTATE_TEST_DATABASE_URL) must be set");
}

const parsed = new URL(baseUrl);
const devDbName = parsed.pathname.replace(/^\//, "");
const testDbName = devDbName.endsWith("_test")
  ? devDbName
  : `${devDbName}_test`;

if (testDbName === devDbName) {
  throw new Error(
    "Refusing to prepare: test and development database names are identical",
  );
}

const testUrl = new URL(baseUrl);
testUrl.pathname = `/${testDbName}`;

// `createdb` is not bundled with Prisma, so use the maintenance database to
// issue a CREATE DATABASE. CREATE DATABASE cannot run inside a transaction,
// hence the autocommit flag and --command.
const maintenanceUrl = new URL(baseUrl);
maintenanceUrl.pathname = "/postgres";

/**
 * Locate a real Node executable to run the Prisma CLI with.
 *
 * `process.execPath` cannot be trusted: in some shells (and inside the VS Code
 * integrated terminal) the `node` on PATH is a shim that launches the editor
 * itself, which makes execPath point at Code.exe rather than node.exe.
 */
function resolveNodeExecutable(): string {
  const isWindows = process.platform === 'win32';
  const exeName = isWindows ? 'node.exe' : 'node';
  const sep = isWindows ? ';' : ':';
  const joiner = isWindows ? '\\' : '/';

  const candidates: string[] = [];

  // process.execPath is normally Node itself, but in some shells (notably the
  // VS Code integrated terminal) it points at the editor instead.
  if (/(^|[\\/])node(\.exe)?$/i.test(process.execPath)) {
    candidates.push(process.execPath);
  }

  for (const entry of (process.env.PATH ?? '').split(sep)) {
    if (!entry) continue;
    candidates.push(`${entry.replace(/[\\/]+$/, '')}${joiner}${exeName}`);
  }

  // Common install locations, for the case where Node is not on PATH at all.
  if (isWindows) {
    for (const base of [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA]) {
      if (!base) continue;
      candidates.push(`${base}\\Programs\\nodejs\\${exeName}`);
      candidates.push(`${base}\\nodejs\\${exeName}`);
    }
  } else {
    candidates.push(`/usr/local/bin/${exeName}`, `/usr/bin/${exeName}`);
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore unreadable entries and keep looking.
    }
  }

  throw new Error(
    'Could not locate a Node executable. Ensure Node is installed and available on your PATH.'
  );
}

/**
 * Invoke the Prisma CLI by running its JS entrypoint with a real Node binary.
 *
 * spawnSync is used rather than execSync because paths on Windows frequently
 * contain spaces ("C:\Program Files\...", project folders), and execSync
 * routes through the shell, which splits on them. spawnSync passes the
 * executable and each argument directly, with no shell involved.
 */
function runPrisma(args: string[], env: NodeJS.ProcessEnv, input?: string): void {
  const prismaBin = require.resolve('prisma/build/index.js');
  const result = spawnSync(resolveNodeExecutable(), [prismaBin, ...args], {
    stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    env,
    input,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`Prisma CLI exited with status ${result.status}`);
  }
}

console.log(`[test:prepare] Ensuring test database "${testDbName}" exists`);

try {
  // Ignore failure: the database most likely already exists, which is fine.
  // CREATE DATABASE cannot run inside a transaction, so pipe it to
  // `prisma db execute --stdin` against the maintenance database.
  runPrisma(
    ['db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma', '--url', maintenanceUrl.toString()],
    { ...process.env },
    `CREATE DATABASE "${testDbName}";`
  );
  console.log(`[test:prepare] Created database "${testDbName}"`);
} catch {
  console.log(`[test:prepare] Database "${testDbName}" already exists`);
}

console.log('[test:prepare] Applying migrations to the test database');
runPrisma(['migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
  ...process.env,
  DATABASE_URL: testUrl.toString(),
});

console.log(`[test:prepare] Test database "${testDbName}" is ready`);
