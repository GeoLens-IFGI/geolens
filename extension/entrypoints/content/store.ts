// Tiny observable holding the single active Inspection.
// The React tree reads it via useSyncExternalStore; the content script's
// message handler writes to it as result messages stream in.

import type { Inspection } from './types';

let current: Inspection | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInspection(): Inspection | null {
  return current;
}

export function setInspection(next: Inspection | null): void {
  current = next;
  emit();
}

export function updateInspection(patch: Partial<Inspection>): void {
  if (!current) return;
  current = { ...current, ...patch };
  emit();
}
