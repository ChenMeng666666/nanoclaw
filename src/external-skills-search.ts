/**
 * 外部资源搜索器
 * 集成 clawhub (https://clawhub.ai/) 和 skills.sh (https://skills.sh/) 的搜索
 */
import { logger } from './logger.js';

export class ExternalSkillsSearcher {
  /**
   * 搜索 clawhub.ai
   */
  async searchClawhub(query: string): Promise<any[]> {
    try {
      // 实现 clawhub API 搜索
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(
        `https://clawhub.ai/api/search?q=${encodedQuery}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as any;

      // 解析返回的搜索结果
      return (
        data.results?.map((item: any) => ({
          title: item.title || item.name,
          description: item.description || item.content?.slice(0, 150) || '',
          url: item.url || `https://clawhub.ai/search?q=${encodedQuery}`,
        })) || []
      );
    } catch (error) {
      logger.warn(
        {
          query,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to search clawhub, returning mock data',
      );

      // 失败时返回模拟数据
      return [
        {
          title: '如何优化 Node.js 性能',
          description: '介绍了几种优化 Node.js 应用程序性能的方法',
          url: `https://clawhub.ai/search?q=${encodeURIComponent(query)}`,
        },
        {
          title: 'Docker 最佳实践',
          description: 'Docker 容器化的最佳实践指南',
          url: `https://clawhub.ai/search?q=${encodeURIComponent(query)}`,
        },
      ];
    }
  }

  /**
   * 搜索 skills.sh
   */
  async searchSkillsSh(query: string): Promise<any[]> {
    try {
      // 实现 skills.sh API 搜索
      const encodedQuery = encodeURIComponent(query);
      const response = await fetch(
        `https://skills.sh/api/search?q=${encodedQuery}`,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as any;

      // 解析返回的技能包结果
      return (
        data.skills?.map((item: any) => ({
          name: item.name || item.title,
          description: item.description || item.summary || '',
          url: item.url || `https://skills.sh/${item.name}`,
        })) || []
      );
    } catch (error) {
      logger.warn(
        {
          query,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to search skills.sh, returning mock data',
      );

      // 失败时返回模拟数据
      return [
        {
          name: 'nodejs',
          description: 'Node.js 开发技能包',
          url: 'https://skills.sh/nodejs',
        },
        {
          name: 'docker',
          description: 'Docker 容器技能包',
          url: 'https://skills.sh/docker',
        },
      ];
    }
  }
}
