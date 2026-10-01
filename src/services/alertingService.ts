import { logger } from '../utils/logger';

export type AlertCategory = 'database' | 'auth' | 'api' | 'system';

export function emitAlert(category: AlertCategory, message: string, metadata?: Record<string, unknown>): void {
  const details = metadata && Object.keys(metadata).length > 0 ? ` ${JSON.stringify(metadata)}` : '';
  logger.warn(`[ALERT:${category}] ${message}${details}`);
}

export function alertDatabaseFailure(error: unknown, context?: string): void {
  emitAlert('database', context ?? 'Database failure detected', {
    error: error instanceof Error ? error.message : String(error),
  });
}

export function alertAuthAnomaly(message: string, metadata?: Record<string, unknown>): void {
  emitAlert('auth', message, metadata);
}

export function alertApiFailure(method: string, url: string, statusCode: number, message: string): void {
  emitAlert('api', 'API error surfaced to client', {
    method,
    url,
    statusCode,
    message,
  });
}
