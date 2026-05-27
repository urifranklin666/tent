import { getEnv } from "./env.js";

type Level = "debug" | "info" | "warn" | "error";

const levelOrder: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

let minLevel: Level | undefined;

function activeLevel(): Level {
  if (minLevel) return minLevel;
  try {
    minLevel = getEnv().TENT_LOG_LEVEL;
  } catch {
    minLevel = "info";
  }
  return minLevel;
}

function log(level: Level, msg: string, fields?: Record<string, unknown>): void {
  if (levelOrder[level] < levelOrder[activeLevel()]) return;
  const entry: Record<string, unknown> = {
    at: new Date().toISOString(),
    level,
    msg,
  };
  if (fields) Object.assign(entry, fields);
  const out = level === "error" || level === "warn" ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + "\n");
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => log("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => log("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => log("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => log("error", msg, fields),
  child(bindings: Record<string, unknown>) {
    return {
      debug: (msg: string, fields?: Record<string, unknown>) =>
        log("debug", msg, { ...bindings, ...fields }),
      info: (msg: string, fields?: Record<string, unknown>) =>
        log("info", msg, { ...bindings, ...fields }),
      warn: (msg: string, fields?: Record<string, unknown>) =>
        log("warn", msg, { ...bindings, ...fields }),
      error: (msg: string, fields?: Record<string, unknown>) =>
        log("error", msg, { ...bindings, ...fields }),
    };
  },
};

export type Logger = typeof logger;
