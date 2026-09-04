export function getRequestId() { return undefined; }
export function runWithRequestContext<T>(fn: () => T) { return fn(); }
export function bindRequestContext<T extends (...args: never[]) => unknown>(fn: T) { return fn; }
