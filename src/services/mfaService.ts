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

const MFA_SECRETS = new Map<string, string>();
const BACKUP_CODES = new Map<string, Set<string>>();
const USED_TOTP_CODES = new Map<string, Set<string>>();
const TRUSTED_DEVICES = new Map<string, TrustedDevice[]>();

export function generateMFASecret(userId: string): MFASetup {
  const secret = generateRandomSecret(32);
  const backupCodes = generateBackupCodes(10);

  MFA_SECRETS.set(userId, secret);
  BACKUP_CODES.set(userId, new Set(backupCodes));
  USED_TOTP_CODES.set(userId, new Set());

  const qrCode = `otpauth://totp/FlowState:${userId}?secret=${secret}&issuer=FlowState`;

  return {
    secret,
    qrCode,
    backupCodes,
  };
}

export function verifyTOTPCode(userId: string, code: string, timeWindow = 1): boolean {
  const secret = MFA_SECRETS.get(userId);
  if (!secret) {
    throw new NotFoundError('MFA not setup for user');
  }

  const usedCodes = USED_TOTP_CODES.get(userId);
  if (usedCodes?.has(code)) {
    throw new ValidationError('TOTP code already used');
  }

  const calculatedCodes = generateTOTPCodes(secret, timeWindow);

  if (calculatedCodes.includes(code)) {
    usedCodes?.add(code);
    setTimeout(() => usedCodes?.delete(code), 30000);
    return true;
  }

  return false;
}

export function verifyBackupCode(userId: string, code: string): boolean {
  const backupCodes = BACKUP_CODES.get(userId);
  if (!backupCodes || !backupCodes.has(code)) {
    return false;
  }

  backupCodes.delete(code);
  return true;
}

export function getBackupCodesRemaining(userId: string): number {
  const backupCodes = BACKUP_CODES.get(userId);
  return backupCodes ? backupCodes.size : 0;
}

export function disableMFA(userId: string): boolean {
  const removed = MFA_SECRETS.delete(userId);
  BACKUP_CODES.delete(userId);
  USED_TOTP_CODES.delete(userId);
  return removed;
}

export function registerTrustedDevice(userId: string, name: string, fingerprint: string, expiresInDays = 30): TrustedDevice {
  const device: TrustedDevice = {
    id: `device-${Math.random().toString(36).substring(7)}`,
    userId,
    name,
    fingerprint,
    isTrusted: true,
    createdAt: new Date(),
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
  };

  if (!TRUSTED_DEVICES.has(userId)) {
    TRUSTED_DEVICES.set(userId, []);
  }

  TRUSTED_DEVICES.get(userId)!.push(device);
  return device;
}

export function isTrustedDevice(userId: string, fingerprint: string): boolean {
  const devices = TRUSTED_DEVICES.get(userId) ?? [];
  return devices.some((device) => device.isTrusted && device.fingerprint === fingerprint && device.expiresAt > new Date());
}

export function getTrustedDevices(userId: string): TrustedDevice[] {
  const devices = TRUSTED_DEVICES.get(userId) ?? [];
  return devices.filter((device) => device.expiresAt > new Date());
}

export function revokeTrustedDevice(userId: string, deviceId: string): boolean {
  const devices = TRUSTED_DEVICES.get(userId);
  if (!devices) return false;

  const device = devices.find((d) => d.id === deviceId);
  if (device) {
    device.isTrusted = false;
    return true;
  }

  return false;
}

export function revokeAllTrustedDevices(userId: string): number {
  const devices = TRUSTED_DEVICES.get(userId) ?? [];
  let count = 0;
  for (const device of devices) {
    if (device.isTrusted) {
      device.isTrusted = false;
      count++;
    }
  }
  return count;
}

function generateRandomSecret(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function generateBackupCodes(count: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(generateRandomSecret(8));
  }
  return codes;
}

function generateTOTPCodes(secret: string, timeWindow: number): string[] {
  const codes: string[] = [];
  const time = Math.floor(Date.now() / 1000 / 30);

  for (let i = -timeWindow; i <= timeWindow; i++) {
    const hmac = require('crypto').createHmac('sha1', secret);
    hmac.update(Buffer.from(new Uint8Array(8)));
    const hash = hmac.digest();
    const offset = hash[hash.length - 1] & 0xf;
    const value = ((hash[offset] & 0x7f) << 24) | ((hash[offset + 1] & 0xff) << 16) | ((hash[offset + 2] & 0xff) << 8) | (hash[offset + 3] & 0xff);
    codes.push((value % 1000000).toString().padStart(6, '0'));
  }

  return codes;
}
