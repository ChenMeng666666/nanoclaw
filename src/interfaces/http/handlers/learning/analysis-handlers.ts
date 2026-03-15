import type http from 'http';
import type { URL } from 'url';

import { memoryManager } from '../../../../memory-manager.js';
import { reflectionExecutor } from '../../../../application/learning/reflection-executor.js';
import {
  createLearningResult,
  getAgentByFolder,
  getLearningResultsByAgent,
  getRecentLearningResults,
} from '../../../../db-agents.js';
import { MEMORY_CONFIG } from '../../../../config.js';
import {
  analyzeLearningOutcome,
  extractKnowledgePoints,
} from '../../../../domain/learning/services/learning-outcome-analyzer.js';
import {
  generateDailySummary,
  generateRuntimeReflection,
} from '../../../../domain/learning/services/reflection-generator.js';
import {
  parseLearningResultStatus,
  parseOptionalBlastRadius,
  parseOptionalIntegerInRange,
  parseOptionalNumberInRange,
  parseOptionalString,
  parseOptionalStringArray,
  parseOptionalStringWithLimit,
  parseRequiredString,
  readJSON,
} from '../../parsers/runtime-api-parsers.js';
import { writeJSON } from '../../response.js';

export function createAnalysisHandlers(): {
  handle(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
    path: string,
  ): Promise<boolean>;
} {
  return {
    async handle(req, res, url, path) {
      if (path === '/api/learning/analyze-outcome' && req.method === 'POST') {
        const body = await readJSON(req);
        const { taskId } = body;

        if (!taskId) {
          writeJSON(res, 400, { error: 'Missing taskId' });
          return true;
        }

        const analysis = analyzeLearningOutcome(String(taskId));

        writeJSON(res, 200, analysis);
        return true;
      }

      if (path === '/api/learning/extract-knowledge' && req.method === 'POST') {
        const body = await readJSON(req);
        const { taskId, reflectionId } = body;

        if (!taskId && !reflectionId) {
          writeJSON(res, 400, { error: 'Missing taskId or reflectionId' });
          return true;
        }

        const knowledge = extractKnowledgePoints(
          taskId ? String(taskId) : undefined,
          reflectionId ? Number(reflectionId) : undefined,
        );

        writeJSON(res, 200, { knowledgePoints: knowledge });
        return true;
      }

      if (
        path === '/api/learning/reflection/generate' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { agentFolder, type } = body;

        if (!agentFolder || !type) {
          writeJSON(res, 400, { error: 'Missing agentFolder or type' });
          return true;
        }

        const agentFolderStr = String(agentFolder);

        const reflection = await generateRuntimeReflection(
          agentFolderStr,
          String(type),
        );

        writeJSON(res, 200, reflection);
        return true;
      }

      if (
        path === '/api/learning/generate-daily-summary' &&
        req.method === 'POST'
      ) {
        const body = await readJSON(req);
        const { agentFolder, tasks } = body;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return true;
        }

        const agentFolderStr = String(agentFolder);
        const taskList = Array.isArray(tasks) ? tasks : undefined;
        const summary = await generateDailySummary(agentFolderStr, taskList);

        writeJSON(res, 200, summary);
        return true;
      }

      if (path === '/api/reflection/trigger' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder, type, triggeredBy } = body;

        if (!agentFolder || !type) {
          writeJSON(res, 400, { error: 'Missing agentFolder or type' });
          return true;
        }

        const reflectionType = type as
          | 'hourly'
          | 'daily'
          | 'weekly'
          | 'monthly'
          | 'yearly'
          | 'task';
        const supportedTypes = new Set([
          'hourly',
          'daily',
          'weekly',
          'monthly',
          'yearly',
          'task',
        ]);

        if (!supportedTypes.has(reflectionType)) {
          writeJSON(res, 400, { error: 'Invalid reflection type' });
          return true;
        }

        const agent = getAgentByFolder(agentFolder as string);
        if (!agent) {
          writeJSON(res, 404, { error: 'Agent not found' });
          return true;
        }

        await reflectionExecutor.triggerReflection(
          agent,
          reflectionType,
          triggeredBy as string | undefined,
        );

        writeJSON(res, 200, {
          status: 'triggered',
          agentFolder,
          type: reflectionType,
        });
        return true;
      }

      if (path === '/api/learning/result' && req.method === 'POST') {
        const body = await readJSON(req);
        const agentFolder = parseRequiredString(
          body.agentFolder,
          'agentFolder',
        );
        const status = parseLearningResultStatus(body.status, 'status');
        const taskId = parseOptionalString(body.taskId);
        const metricBefore = parseOptionalNumberInRange(
          body.metricBefore,
          'metricBefore',
          -1000000000,
          1000000000,
        );
        const metricAfter = parseOptionalNumberInRange(
          body.metricAfter,
          'metricAfter',
          -1000000000,
          1000000000,
        );
        const metricName = parseOptionalStringWithLimit(
          body.metricName,
          'metricName',
          120,
        );
        const description = parseOptionalStringWithLimit(
          body.description,
          'description',
          MEMORY_CONFIG.api.maxContentLength,
        );
        const signals = parseOptionalStringArray(body.signals, 'signals');
        const geneId = parseOptionalString(body.geneId);
        const blastRadius = parseOptionalBlastRadius(
          body.blastRadius,
          'blastRadius',
        );

        const id = createLearningResult({
          taskId,
          agentFolder,
          metricBefore,
          metricAfter,
          metricName,
          status,
          description,
          signals,
          geneId,
          blastRadius,
        });

        writeJSON(res, 200, { id, status: 'recorded' });
        return true;
      }

      if (path === '/api/learning/results' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');
        const limit =
          parseOptionalIntegerInRange(
            url.searchParams.get('limit'),
            'limit',
            MEMORY_CONFIG.api.minLimit,
            MEMORY_CONFIG.api.maxLimit,
          ) || 50;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return true;
        }

        const results = getLearningResultsByAgent(agentFolder, limit);
        writeJSON(res, 200, { results });
        return true;
      }

      if (path === '/api/learning/system/version' && req.method === 'GET') {
        const LATEST_VERSION = '1.1';
        writeJSON(res, 200, {
          version: LATEST_VERSION,
          releaseDate: '2026-03-10',
          features: [
            '增强版本管理和增量更新',
            '学习体系版本API',
            '优化同步钩子',
          ],
        });
        return true;
      }

      if (path === '/api/learning/system/update' && req.method === 'POST') {
        const body = await readJSON(req);
        const { agentFolder } = body;

        if (!agentFolder) {
          writeJSON(res, 400, { error: 'Missing agentFolder' });
          return true;
        }

        writeJSON(res, 200, {
          status: 'updated',
          version: '1.1',
          message: '学习体系已更新到最新版本',
          agentFolder,
        });
        return true;
      }

      if (path === '/api/learning/system/diff' && req.method === 'GET') {
        const fromVersion = url.searchParams.get('fromVersion') || '1.0';
        const toVersion = url.searchParams.get('toVersion') || '1.1';

        writeJSON(res, 200, {
          fromVersion,
          toVersion,
          changes: [
            {
              file: 'config.json',
              type: 'modified',
              description: '添加迁移历史记录字段',
            },
            {
              file: 'init.sh',
              type: 'modified',
              description: '增强版本管理和增量更新功能',
            },
            {
              file: 'post-load.sh',
              type: 'modified',
              description: '优化同步钩子，添加增量同步',
            },
          ],
          breakingChanges: [],
          migrationSteps: [
            '检查当前版本',
            '备份配置文件',
            '执行版本迁移',
            '验证更新结果',
          ],
        });
        return true;
      }

      if (path === '/api/signals/extract' && req.method === 'POST') {
        const body = await readJSON(req);
        const { content, memorySnippet, language } = body;

        if (!content) {
          writeJSON(res, 400, { error: 'Missing content' });
          return true;
        }

        const { extractSignals } =
          await import('../../../../signal-extractor.js');
        const signals = extractSignals({
          content: content as string,
          memorySnippet: memorySnippet as string | undefined,
          language: language as 'en' | 'zh-CN' | 'zh-TW' | 'ja' | undefined,
        });

        writeJSON(res, 200, { signals });
        return true;
      }

      if (path === '/api/saturation/detect' && req.method === 'GET') {
        const agentFolder = url.searchParams.get('agentFolder');
        const limit =
          parseOptionalIntegerInRange(
            url.searchParams.get('limit'),
            'limit',
            MEMORY_CONFIG.api.minLimit,
            MEMORY_CONFIG.api.maxLimit,
          ) || 10;

        const recentResults = agentFolder
          ? getLearningResultsByAgent(agentFolder, limit)
          : getRecentLearningResults(limit);

        const { detectSaturation, getSaturationSummary } =
          await import('../../../../saturation-detector.js');
        const state = detectSaturation(
          recentResults.map((r) => ({
            id: String(r.id),
            taskId: r.taskId,
            agentFolder: r.agentFolder,
            status: r.status,
            createdAt: r.createdAt,
            signals: r.signals,
            geneId: r.geneId,
            metricBefore: r.metricBefore,
            metricAfter: r.metricAfter,
          })),
        );

        const summary = getSaturationSummary(state);

        writeJSON(res, 200, { state, summary });
        return true;
      }

      return false;
    },
  };
}
