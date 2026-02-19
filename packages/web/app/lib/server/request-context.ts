import { AsyncLocalStorage } from "node:async_hooks";

export const requestStorage = new AsyncLocalStorage<Request>();

export function getRequest(): Request | undefined {
  return requestStorage.getStore();
}
