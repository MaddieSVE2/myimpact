import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const RELOAD_FLAG_KEY = "chunk-reload-attempted";

const CHUNK_ERROR_PATTERNS: RegExp[] = [
  /Failed to fetch dynamically imported module/i,
  /Loading chunk \d+ failed/i,
  /ChunkLoadError/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
];

export function isChunkLoadError(err: unknown): boolean {
  const message =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return CHUNK_ERROR_PATTERNS.some((re) => re.test(message));
}

function safeGetFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG_KEY) === "1";
  } catch {
    return true; // no sessionStorage — don't risk a reload loop
  }
}

function safeSetFlag(): void {
  try {
    sessionStorage.setItem(RELOAD_FLAG_KEY, "1");
  } catch {
    // ignore
  }
}

export function clearChunkReloadFlag(): void {
  try {
    sessionStorage.removeItem(RELOAD_FLAG_KEY);
  } catch {
    // ignore
  }
}

/**
 * Attempts a one-time full page reload to recover from a stale-deploy chunk
 * load failure. Returns true if a reload was triggered, false if a reload was
 * already attempted this session (caller should surface the error instead).
 */
export function attemptChunkErrorReload(): boolean {
  if (safeGetFlag()) return false;
  safeSetFlag();
  window.location.reload();
  return true;
}

export type PreloadableLazy<T extends ComponentType<unknown>> = LazyExoticComponent<T> & {
  /** Loads the page's code ahead of rendering (see main.tsx). */
  preload: () => Promise<void>;
};

/**
 * A thenable that calls back at once. React.lazy then renders an
 * already-loaded page without suspending, which hydrating a prerendered
 * page needs: a suspended page can't take updates until its code arrives.
 */
function settledThenable<V>(value: V): Promise<V> {
  const thenable = {
    then(onFulfilled: (v: V) => unknown) {
      onFulfilled(value);
      return thenable;
    },
  };
  return thenable as unknown as Promise<V>;
}

/**
 * Drop-in replacement for React.lazy that recovers from stale-deploy chunk
 * fetch failures (old index.html referencing replaced chunk filenames) by
 * reloading the page once. Guarded via sessionStorage to avoid reload loops.
 * Once `preload()` has finished, the page renders without suspending.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
): PreloadableLazy<T> {
  let loaded: { default: T } | null = null;
  const load = () =>
    factory()
      .then((module) => {
        clearChunkReloadFlag();
        loaded = module;
        return module;
      })
      .catch((error: unknown) => {
        if (isChunkLoadError(error) && attemptChunkErrorReload()) {
          // Reload is underway; return a never-resolving promise so nothing
          // renders (and no error surfaces) while the page refreshes.
          return new Promise<{ default: T }>(() => {});
        }
        throw error;
      });
  const component = lazy(() => (loaded ? settledThenable(loaded) : load())) as PreloadableLazy<T>;
  component.preload = () => load().then(() => undefined);
  return component;
}
