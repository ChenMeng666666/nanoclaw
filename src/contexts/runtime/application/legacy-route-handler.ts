import type { RuntimeApiRouteContext } from '../interfaces/http/runtime-api-router.js';

export async function handleRuntimeLegacyRoute(
  _context: RuntimeApiRouteContext,
): Promise<boolean> {
  return false;
}
