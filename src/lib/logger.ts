/**
 * Structured server-side logger — SERVER-SIDE ONLY.
 *
 * Wraps console with consistent prefixes and log levels.
 * In production, only warn/error are emitted. In development, all levels log.
 *
 * Never log secrets, tokens, or passwords.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

function shouldLog(level: LogLevel): boolean {
  if (isTest) return false;
  if (level === 'debug') return isDev;
  if (level === 'info') return isDev;
  return true; // warn + error always log
}

function prefix(level: LogLevel, domain: string): string {
  const ts = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  const lvl = level.toUpperCase().padEnd(5);
  return `[${ts}] ${lvl} [${domain}]`;
}

function log(level: LogLevel, domain: string, message: string, data?: Record<string, unknown>) {
  if (!shouldLog(level)) return;
  const p = prefix(level, domain);
  if (data && Object.keys(data).length > 0) {
    const safe = JSON.stringify(data, null, 0);
    if (level === 'error') console.error(`${p} ${message}`, safe);
    else if (level === 'warn') console.warn(`${p} ${message}`, safe);
    else console.log(`${p} ${message}`, safe);
  } else {
    if (level === 'error') console.error(`${p} ${message}`);
    else if (level === 'warn') console.warn(`${p} ${message}`);
    else console.log(`${p} ${message}`);
  }
}

export const logger = {
  debug: (domain: string, message: string, data?: Record<string, unknown>) =>
    log('debug', domain, message, data),
  info: (domain: string, message: string, data?: Record<string, unknown>) =>
    log('info', domain, message, data),
  warn: (domain: string, message: string, data?: Record<string, unknown>) =>
    log('warn', domain, message, data),
  error: (domain: string, message: string, data?: Record<string, unknown>) =>
    log('error', domain, message, data),

  // Domain-specific helpers
  oauth: {
    connect: (userId: string, mlUserId: string, siteId: string) =>
      log('info', 'oauth', 'ML account connected', { userId, mlUserId, siteId }),
    disconnect: (userId: string) =>
      log('info', 'oauth', 'ML account disconnected', { userId }),
    tokenRefresh: (userId: string) =>
      log('info', 'oauth', 'Access token refreshed', { userId }),
    tokenRefreshFailed: (userId: string, reason: string) =>
      log('warn', 'oauth', 'Token refresh failed', { userId, reason }),
    callbackError: (error: string) =>
      log('error', 'oauth', 'OAuth callback error', { error }),
  },

  publish: {
    attempt: (userId: string, dryRun: boolean, itemCount: number) =>
      log('info', 'publish', `Publish attempt (dryRun=${dryRun})`, { userId, itemCount, dryRun }),
    success: (userId: string, itemId: string, dryRun: boolean) =>
      log('info', 'publish', `Publish ${dryRun ? 'simulated' : 'succeeded'}`, { userId, itemId, dryRun }),
    failed: (userId: string, reason: string) =>
      log('warn', 'publish', 'Publish failed', { userId, reason }),
    preflightBlocked: (userId: string, blockingCount: number) =>
      log('warn', 'publish', 'Blocked by preflight', { userId, blockingCount }),
    imagesPrepFailed: (userId: string, errorCount: number) =>
      log('warn', 'publish', 'Image preparation blocked publish', { userId, errorCount }),
  },

  db: {
    connectError: (reason: string) =>
      log('error', 'db', 'Database connection failed', { reason }),
    queryError: (domain: string, reason: string) =>
      log('error', 'db', `Query failed in ${domain}`, { reason }),
  },

  health: {
    check: (status: string) =>
      log('debug', 'health', `Health check: ${status}`),
  },
};
