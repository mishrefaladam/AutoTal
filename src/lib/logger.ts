import "server-only";

/**
 * Minimaler strukturierter Logger.
 *
 * Wichtig: Es dürfen keine personenbezogenen Daten aus Formularen und keine
 * Secrets ins Log. `redact()` filtert die üblichen Verdächtigen heraus, ist
 * aber kein Ersatz für Nachdenken beim Aufrufer – logge im Zweifel nur IDs.
 */

type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY_PATTERN =
  /(pass(word)?|secret|token|api[-_]?key|authorization|cookie|session|email|phone|telefon|iban)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[tief verschachtelt]";

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redact(item, depth + 1));
  }

  if (value && typeof value === "object") {
    if (value instanceof Error) {
      return { name: value.name, message: value.message };
    }

    const result: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? "[redacted]"
        : redact(nested, depth + 1);
    }
    return result;
  }

  return value;
}

function write(level: Level, message: string, context?: Record<string, unknown>) {
  if (level === "debug" && process.env.NODE_ENV === "production") return;

  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...(context ? { context: redact(context) } : {}),
  };

  const line = JSON.stringify(entry);

  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) =>
    write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) =>
    write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    write("error", message, context),
};
