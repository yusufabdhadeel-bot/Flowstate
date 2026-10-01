export type LogLevel = 'info' | 'warn' | 'error';

const formatArgs = (level: LogLevel, ...args: unknown[]) => {
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  return [prefix, ...args];
};

export const logger = {
  info: (...args: unknown[]) => console.log(...formatArgs('info', ...args)),
  warn: (...args: unknown[]) => console.warn(...formatArgs('warn', ...args)),
  error: (...args: unknown[]) => console.error(...formatArgs('error', ...args)),
};
