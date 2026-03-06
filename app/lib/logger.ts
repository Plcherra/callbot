/**
 * Structured logger. In production, reduces verbose output.
 */

const isDev = process.env.NODE_ENV !== "production";

export function log(tag: string, ...args: unknown[]): void {
  if (isDev) {
    console.log(`[${tag}]`, ...args);
  }
}

export function warn(tag: string, ...args: unknown[]): void {
  console.warn(`[${tag}]`, ...args);
}

export function error(tag: string, ...args: unknown[]): void {
  console.error(`[${tag}]`, ...args);
}
