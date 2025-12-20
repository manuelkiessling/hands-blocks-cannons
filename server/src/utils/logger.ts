type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  data?: Record<string, unknown> | undefined;
}

function formatLog(entry: LogEntry): string {
  const base = `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`;
  if (entry.data) {
    return `${base} ${JSON.stringify(entry.data)}`;
  }
  return base;
}

function createLogEntry(
  level: LogLevel,
  message: string,
  data?: Record<string, unknown>
): LogEntry {
  return {
    level,
    message,
    timestamp: new Date().toISOString(),
    data,
  };
}

export const logger = {
  debug(message: string, data?: Record<string, unknown>): void {
    console.debug(formatLog(createLogEntry('debug', message, data)));
  },

  info(message: string, data?: Record<string, unknown>): void {
    console.info(formatLog(createLogEntry('info', message, data)));
  },

  warn(message: string, data?: Record<string, unknown>): void {
    console.warn(formatLog(createLogEntry('warn', message, data)));
  },

  error(message: string, data?: Record<string, unknown>): void {
    console.error(formatLog(createLogEntry('error', message, data)));
  },
};
