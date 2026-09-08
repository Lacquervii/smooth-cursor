/**
 * App-local snapshot store, built on plain React-free primitives. This
 * deliberately replaces `createSnapshotStore` from the DSH runtime so the
 * plugin does not depend on the runtime package's path (the runtime moved
 * from `@deepseek-ai/dsh-client-runtime` to the `@deepseek-ai/dsh-client-store`
 * seed across DSH versions). Keeps the plugin cross-version.
 */
import type { ObservableSnapshot } from './make-cursor-hook.ts'

/** Writable snapshot store: observable read side + full-replacement write side. */
export interface SnapshotStore<T> extends ObservableSnapshot<T> {
  /** Replace the state wholesale and notify subscribers. */
  set(next: T): void
}

/**
 * Create a snapshot store.
 * @param init - initial state.
 * @returns the store (getSnapshot/subscribe/set).
 */
export function createSnapshotStore<T>(init: T): SnapshotStore<T> {
  let state = init
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void): () => void {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
    set(next: T): void {
      state = next
      for (const listener of [...listeners]) listener()
    },
  }
}