import type http from 'http';
import type { URL } from 'url';

import { createAutomationHandlers } from './automation-handlers.js';
import { createPlanningHandlers } from './planning-handlers.js';
import { createAnalysisHandlers } from './analysis-handlers.js';

export function createLearningHandlers(): {
  handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    path: string,
  ): Promise<boolean>;
} {
  const automationHandlers = createAutomationHandlers();
  const planningHandlers = createPlanningHandlers();
  const analysisHandlers = createAnalysisHandlers();

  return {
    async handle(req, res, url, path) {
      if (await automationHandlers.handle(req, res, url, path)) {
        return true;
      }
      if (await planningHandlers.handle(req, res, url, path)) {
        return true;
      }
      if (await analysisHandlers.handle(req, res, url, path)) {
        return true;
      }
      return false;
    },
  };
}
