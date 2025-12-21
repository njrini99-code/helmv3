const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (isDev) console.log(`[DEBUG] ${message}`, ...args);
  },
  info: (message: string, ...args: unknown[]) => {
    if (isDev) console.info(`[INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  error: (message: string, error?: unknown) => {
    console.error(`[ERROR] ${message}`, error);
  },
};
