export function requireConfig(name: string, minimumLength?: number): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  if (minimumLength && value.length < minimumLength) {
    throw new Error(`${name} must be at least ${minimumLength} characters long`);
  }

  return value;
}

export function getOptionalConfig(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function validateRuntimeConfig(): void {
  requireConfig('DATABASE_URL', 20);
  requireConfig('JWT_SECRET', 32);

  if (process.env.NODE_ENV === 'production') {
    const secretManager = process.env.SECRET_MANAGER ?? 'env';
    if (!['env', 'aws-secrets-manager', 'azure-key-vault'].includes(secretManager)) {
      throw new Error(`Unsupported SECRET_MANAGER value: ${secretManager}`);
    }
  }
}
