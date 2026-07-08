// ==========================================
// Structured Logger - Centralized Logging
// ==========================================

import * as Sentry from '@sentry/nextjs';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
    [key: string]: unknown;
}

interface LogEntry {
    level: LogLevel;
    message: string;
    context?: LogContext;
    timestamp: string;
    environment: string;
}

class StructuredLogger {
    private environment: string;
    private isDevelopment: boolean;

    constructor() {
        this.environment = process.env.NODE_ENV || 'development';
        this.isDevelopment = this.environment === 'development';
    }

    /**
     * Format log entry
     */
    private formatEntry(level: LogLevel, message: string, context?: LogContext): LogEntry {
        return {
            level,
            message,
            context,
            timestamp: new Date().toISOString(),
            environment: this.environment,
        };
    }

    /**
     * Log entry to console (development) or send to service (production)
     */
    private log(entry: LogEntry): void {
        if (this.isDevelopment) {
            // Pretty print in development
            const emoji = {
                debug: '🔍',
                info: 'ℹ️',
                warn: '⚠️',
                error: '❌',
            }[entry.level];

            console.log(`${emoji} [${entry.level.toUpperCase()}] ${entry.message}`, entry.context || '');
        } else {
            // Sentry.init() is a no-op when SENTRY_DSN/NEXT_PUBLIC_SENTRY_DSN
            // isn't configured, so these calls are safe before a DSN exists.
            // The `error` level's real Error object is reported from error()
            // below, where it's still available, so it keeps its stack trace.
            if (entry.level === 'error') {
                console.error(entry.message, entry.context);
            } else if (entry.level === 'warn') {
                Sentry.captureMessage(entry.message, { level: 'warning', extra: entry.context });
            }
        }
    }

    /**
     * Debug level
     */
    debug(message: string, context?: LogContext): void {
        if (this.isDevelopment) {
            this.log(this.formatEntry('debug', message, context));
        }
    }

    /**
     * Info level
     */
    info(message: string, context?: LogContext): void {
        this.log(this.formatEntry('info', message, context));
    }

    /**
     * Warning level
     */
    warn(message: string, context?: LogContext): void {
        this.log(this.formatEntry('warn', message, context));
    }

    /**
     * Error level
     */
    error(message: string, error?: Error | unknown, context?: LogContext): void {
        const errorContext: LogContext = {
            ...context,
        };

        if (error instanceof Error) {
            errorContext.error_name = error.name;
            errorContext.error_message = error.message;
            errorContext.error_stack = error.stack;
        } else if (error) {
            errorContext.error = error;
        }

        if (!this.isDevelopment) {
            Sentry.captureException(error instanceof Error ? error : new Error(message), {
                extra: errorContext,
            });
        }

        this.log(this.formatEntry('error', message, errorContext));
    }

    /**
     * Measure execution time of a function
     */
    async measure<T>(
        label: string,
        fn: () => Promise<T>,
        context?: LogContext
    ): Promise<T> {
        const startTime = performance.now();
        this.debug(`Starting: ${label}`, context);

        try {
            const result = await fn();
            const duration = performance.now() - startTime;

            this.info(`Completed: ${label}`, {
                ...context,
                duration_ms: duration.toFixed(2),
            });

            return result;
        } catch (error) {
            const duration = performance.now() - startTime;

            this.error(
                `Failed: ${label}`,
                error,
                {
                    ...context,
                    duration_ms: duration.toFixed(2),
                }
            );

            throw error;
        }
    }
}

// Export singleton instance
export const logger = new StructuredLogger();

/**
 * Log auth event specifically
 */
export function logAuthEvent(
    event: string,
    status: 'success' | 'failure' | 'attempt',
    context?: LogContext
): void {
    const level = status === 'failure' ? 'warn' : 'info';
    logger[level](`Auth Event: ${event}`, {
        ...context,
        event_type: event,
        status,
    });
}
