import type { RouteResult } from '@archcode/core/canvas';
import { useSyncExternalStore } from 'react';

/**
 * Kho đường đi của connector, tách khỏi state của React Flow: khi kéo node chỉ những
 * connector có đường đi thay đổi mới render lại (quan trọng với 200 node / 400 connector).
 */
let routes = new Map<string, RouteResult>();
const listeners = new Set<() => void>();

function same(a: RouteResult, b: RouteResult): boolean {
  if (a.points.length !== b.points.length) return false;
  if (a.label?.x !== b.label?.x || a.label?.y !== b.label?.y) return false;
  return a.points.every((p, i) => p.x === b.points[i]!.x && p.y === b.points[i]!.y);
}

export function setRoutes(next: Map<string, RouteResult>): void {
  const merged = new Map<string, RouteResult>();
  for (const [id, route] of next) {
    const old = routes.get(id);
    merged.set(id, old && same(old, route) ? old : route);
  }
  routes = merged;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRoute(id: string): RouteResult | undefined {
  return useSyncExternalStore(subscribe, () => routes.get(id));
}
