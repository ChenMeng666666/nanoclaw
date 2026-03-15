/**
 * 外部资源搜索器
 * 集成 clawhub (https://clawhub.ai/) 和 skills.sh (https://skills.sh/) 的搜索
 */
import { logger } from './logger.js';

interface ClawhubResult {
  title: string;
  description: string;
  url: string;
}

interface SkillsShResult {
  name: string;
  description: string;
  url: string;
  installs: number;
}

export class ExternalSkillsSearcher {
  /**
   * 搜索 clawhub.ai
   */
  async searchClawhub(query: string): Promise<ClawhubResult[]> {
    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(
        `https://clawhub.ai/api/search?q=${encodedQuery}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as {
        results?: Array<{
          displayName?: string;
          title?: string;
          name?: string;
          summary?: string;
          description?: string;
          url?: string;
          slug?: string;
        }>;
      };

      return (
        data.results?.map((item) => ({
          title: item.displayName || item.title || item.name || 'Unknown',
          description: item.summary || item.description || '',
          url: item.url || `https://clawhub.ai/skills/${item.slug}`,
        })) || []
      );
    } catch (error) {
      logger.warn(
        {
          query,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to search clawhub, returning empty results',
      );

      return [];
    }
  }

  /**
   * 搜索 skills.sh
   */
  async searchSkillsSh(query: string): Promise<SkillsShResult[]> {
    try {
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(
        `https://skills.sh/api/search?q=${encodedQuery}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as {
        skills?: Array<{
          skillId: string;
          source?: string;
          name?: string;
          title?: string;
          summary?: string;
          description?: string;
          installs?: number;
        }>;
      };

      return (
        data.skills?.map((item) => {
          // 从 source 字段构建 GitHub 链接
          let contentUrl = `https://skills.sh/skills/${item.skillId}`;

          // 如果有 source 字段，尝试构建 GitHub 链接
          if (item.source) {
            const sourceParts = item.source.split('/');
            if (sourceParts.length >= 2) {
              const org = sourceParts[0];
              const repo = sourceParts[1];
              contentUrl = `https://github.com/${org}/${repo}`;
            }
          }

          return {
            name: item.name || item.title || 'Unknown',
            description:
              item.summary || item.description || `Installs: ${item.installs}`,
            url: contentUrl,
            installs: item.installs || 0,
          };
        }) || []
      );
    } catch (error) {
      logger.warn(
        {
          query,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to search skills.sh, returning empty results',
      );

      return [];
    }
  }
}
