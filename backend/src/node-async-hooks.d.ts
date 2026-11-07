// Khai bao toi thieu cho AsyncLocalStorage (Workers ho tro qua compatibility_flags "nodejs_compat") - repo khong cai @types/node.
// Dung o lib/reportCache.ts (gom doc cache trong 1 request).
declare module "node:async_hooks" {
  export class AsyncLocalStorage<T> {
    getStore(): T | undefined;
    run<R>(store: T, fn: () => R): R;
  }
}
