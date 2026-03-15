
import { logger } from './logger.js';
import { Bootstrap } from './application/bootstrap/bootstrap.js';

// Re-export for backwards compatibility during refactor
export { escapeXml, formatMessages } from './router.js';

// Guard: only run when executed directly, not when imported by tests
const isDirectRun =
  process.argv[1] &&
  new URL(import.meta.url).pathname ===
    new URL(`file://${process.argv[1]}`).pathname;

if (isDirectRun) {
  Bootstrap.init().catch((err) => {
    logger.error({ err }, 'Failed to start NanoClaw');
    process.exit(1);
  });
}
