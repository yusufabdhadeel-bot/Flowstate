import crypto from 'node:crypto';
import { prisma } from '../prismaClient';
import { NotFoundError, ValidationError } from '../errors';

export interface MFASetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface MFAVerification {
  valid: boolean;
  codeUsed?: boolean;
  codesRemaining?: number;
}

export interface TrustedDevice {
  id: string;
  userId: string;
  name: string;
  fingerprint: string;
  isTrusted: boolean;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
}

type BackupCodeRecord = { hash: string; usedAt: string | null };

function encryptionKey(): Buffer {
  const source = process.env.MFA_ENCRYPTION_KEY ?? process.env.JWT_SECRET;
  if (!source || source.length < 32) {
    throw new ValidationError('MFA_ENCRYPTION_KEY or a 32-character JWT_SECRET is required');
  }
  return crypto.createHash('sha256').update(source).digest();
}

function encryptSecret(secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function decryptSecret(value: string): string {
  const [ivValue, tagValue, ciphertextValue] = value.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, 'base64url')), decipher.final()]).toString('utf8');
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export async function generateMFASecret(userId: string): Promise<MFASetup> {
  const secret = crypto.randomBytes(20).toString('hex');
  const backupCodes = Array.from({ length: 10 }, () => crypto.randomBytes(6).toString('hex'));
  const records: BackupCodeRecord[] = backupCodes.map((code) => ({ hash: hashCode(code), usedAt: null }));

  await prisma.mfaCredential.upsert({
    where: { userId },
    create: { userId, secret: encryptSecret(secret), backupCodes: records, usedTotpSteps: [], isEnabled: false },
    update: { secret: encryptSecret(secret), backupCodes: records, usedTotpSteps: [], isEnabled: false },
  });

  return { secret, qrCode: `otpauth://totp/FlowState:${userId}?secret=${secret}&issuer=FlowState`, backupCodes };
}

export async function verifyTOTPCode(userId: string, code: string, timeWindow = 1): Promise<boolean> {
  const credential = await prisma.mfaCredential.findUnique({ where: { userId } });
  if (!credential) throw new NotFoundError('MFA not setup for user');

  const secret = decryptSecret(credential.secret);
  const currentStep = Math.floor(Date.now() / 30000);
  const usedSteps = new Set((credential.usedTotpSteps as number[]) ?? []);
  for (let offset = -timeWindow; offset <= timeWindow; offset += 1) {
    const step = currentStep + offset;
    if (usedSteps.has(step)) continue;
    const expected = generateTOTP(secret, step);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(code))) {
      usedSteps.add(step);
      await prisma.mfaCredential.update({ where: { userId }, data: { isEnabled: true, usedTotpSteps: Array.from(usedSteps) } });
      return true;
    }
  }
  return false;
}

export async function verifyBackupCode(userId: string, code: string): Promise<boolean> {
  const credential = await prisma.mfaCredential.findUnique({ where: { userId } });
  if (!credential) return false;
  const records = (credential.backupCodes as unknown as BackupCodeRecord[]) ?? [];
  const match = records.find((record) => record.hash === hashCode(code) && !record.usedAt);
  if (!match) return false;
  match.usedAt = new Date().toISOString();
  await prisma.mfaCredential.update({ where: { userId }, data: { isEnabled: true, backupCodes: records } });
  return true;
}

export async function getBackupCodesRemaining(userId: string): Promise<number> {
  const credential = await prisma.mfaCredential.findUnique({ where: { userId }, select: { backupCodes: true } });
  if (!credential) return 0;
  return ((credential.backupCodes as unknown as BackupCodeRecord[]) ?? []).filter((record) => !record.usedAt).length;
}

export async function disableMFA(userId: string): Promise<boolean> {
  const result = await prisma.mfaCredential.updateMany({ where: { userId }, data: { isEnabled: false } });
  return result.count > 0;
}

export async function registerTrustedDevice(userId: string, name: string, fingerprint: string, expiresInDays = 30): Promise<TrustedDevice> {
  const device = await prisma.trustedDevice.upsert({
    where: { uq_trustedDevice_user_device: { userId, deviceId: fingerprint } },
    create: { userId, deviceId: fingerprint, deviceName: name, expiresAt: new Date(Date.now() + expiresInDays * 86400000) },
    update: { deviceName: name, lastUsedAt: new Date(), expiresAt: new Date(Date.now() + expiresInDays * 86400000) },
  });
  return { id: device.id, userId: device.userId, name: device.deviceName ?? '', fingerprint: device.deviceId, isTrusted: true, createdAt: device.trustedAt, lastUsedAt: device.lastUsedAt, expiresAt: device.expiresAt ?? new Date(8640000000000000) };
}

export async function isTrustedDevice(userId: string, fingerprint: string): Promise<boolean> {
  const device = await prisma.trustedDevice.findUnique({ where: { uq_trustedDevice_user_device: { userId, deviceId: fingerprint } } });
  return Boolean(device && (!device.expiresAt || device.expiresAt > new Date()));
}

export async function getTrustedDevices(userId: string): Promise<TrustedDevice[]> {
  const devices = await prisma.trustedDevice.findMany({ where: { userId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
  return devices.map((device) => ({ id: device.id, userId: device.userId, name: device.deviceName ?? '', fingerprint: device.deviceId, isTrusted: true, createdAt: device.trustedAt, lastUsedAt: device.lastUsedAt, expiresAt: device.expiresAt ?? new Date(8640000000000000) }));
}

export async function revokeTrustedDevice(userId: string, deviceId: string): Promise<boolean> {
  const result = await prisma.trustedDevice.deleteMany({ where: { id: deviceId, userId } });
  return result.count > 0;
}

export async function revokeAllTrustedDevices(userId: string): Promise<number> {
  const result = await prisma.trustedDevice.deleteMany({ where: { userId } });
  return result.count;
}

function generateTOTP(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigInt64BE(BigInt(step));
  const digest = crypto.createHmac('sha1', Buffer.from(secret, 'utf8')).update(counter).digest();
  const offset = digest[digest.length - 1] & 0xf;
  const value = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16) | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(value % 1000000).padStart(6, '0');
}
