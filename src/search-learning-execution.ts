/**
 * 搜索学习执行器
 * 子代理并行执行搜索和学习，比较新旧方法
 */
import { memoryManager } from './memory-manager.js';
import { evolutionManager } from './evolution-manager.js';
import { ExternalSkillsSearcher } from './external-skills-search.js';

export class SearchLearningExecutor {
  private searcher = new ExternalSkillsSearcher();

  /**
   * 子代理并行执行搜索和学习，比较新旧方法
   */
  async searchAndCompareMethods(prompt: string, groupFolder: string): Promise<string> {
    // 使用 Promise.all 并行执行搜索任务
    const [memoryResults, evolutionResults, externalResults] = await Promise.all([
      this.searchMemory(groupFolder, prompt),
      this.searchEvolution(prompt),
      this.searchExternalResources(prompt)
    ]);

    // 归纳总结搜索结果
    const findings = this.summarizeFindings(memoryResults, evolutionResults, externalResults);

    // 评估是否有更好的方法
    const comparisonResult = await this.evaluateMethods(prompt, findings);

    // 返回增强的提示词
    if (comparisonResult.hasBetterMethod) {
      return this.buildEnhancedPrompt(prompt, comparisonResult.recommendation);
    }

    return prompt;
  }

  /**
   * 搜索记忆
   */
  private async searchMemory(groupFolder: string, query: string): Promise<any[]> {
    const memories = await memoryManager.searchMemories(groupFolder, query, 3);
    return memories;
  }

  /**
   * 搜索进化库
   */
  private async searchEvolution(query: string): Promise<any[]> {
    const entries = await evolutionManager.queryExperience(query, ['practical'], 3);
    return entries;
  }

  /**
   * 搜索外部资源（clawhub 和 skills.sh）
   */
  private async searchExternalResources(query: string): Promise<{ clawhub: any[]; skillsSh: any[] }> {
    const [clawhubResults, skillsShResults] = await Promise.all([
      this.searcher.searchClawhub(query),
      this.searcher.searchSkillsSh(query)
    ]);

    return { clawhub: clawhubResults, skillsSh: skillsShResults };
  }

  /**
   * 归纳总结搜索结果
   */
  private summarizeFindings(memoryResults: any[], evolutionResults: any[], externalResults: any): string {
    let summary = '';

    if (memoryResults.length > 0) {
      summary += '### 记忆中的相关方法：\n';
      memoryResults.forEach((m, i) => {
        summary += `${i + 1}. ${m.content.slice(0, 150)}\n`;
      });
    }

    if (evolutionResults.length > 0) {
      summary += '\n### 进化库中的方法：\n';
      evolutionResults.forEach((e, i) => {
        summary += `${i + 1}. ${e.abilityName}: ${e.description?.slice(0, 100)}\n`;
      });
    }

    if (externalResults.clawhub.length > 0 || externalResults.skillsSh.length > 0) {
      summary += '\n### 外部资源中的方法：\n';
      if (externalResults.clawhub.length > 0) {
        externalResults.clawhub.slice(0, 2).forEach((r: any, i: number) => {
          summary += `${i + 1}. ${r.title}: ${r.description.slice(0, 80)}\n`;
        });
      }
      if (externalResults.skillsSh.length > 0) {
        externalResults.skillsSh.slice(0, 2).forEach((r: any, i: number) => {
          summary += `${i + 1 + externalResults.clawhub.length}. ${r.name}: ${r.description.slice(0, 80)}\n`;
        });
      }
    }

    return summary;
  }

  /**
   * 评估方法（模拟子代理思维过程）
   */
  private async evaluateMethods(originalPrompt: string, findings: string): Promise<{
    hasBetterMethod: boolean;
    recommendation: string;
    reasoning: string;
  }> {
    // 简单的评估逻辑：基于是否有新方法且看起来更优
    const hasMemoryMethods = findings.includes('记忆中的相关方法');
    const hasEvolutionMethods = findings.includes('进化库中的方法');
    const hasExternalMethods = findings.includes('外部资源中的方法');

    if (!hasMemoryMethods && !hasEvolutionMethods && !hasExternalMethods) {
      return {
        hasBetterMethod: false,
        recommendation: '',
        reasoning: '没有找到相关的方法，建议使用原始方案'
      };
    }

    // 简单评估：如果有外部资源方法或多个方法，可能有更好的方法
    const hasMultipleMethods = (hasMemoryMethods ? 1 : 0) + (hasEvolutionMethods ? 1 : 0) + (hasExternalMethods ? 1 : 0) >= 2;
    const hasNewerMethods = hasExternalMethods || hasEvolutionMethods;

    if (hasNewerMethods || hasMultipleMethods) {
      return {
        hasBetterMethod: true,
        recommendation: findings,
        reasoning: '发现了新方法或多个方法，可能有更好的解决方案'
      };
    }

    return {
      hasBetterMethod: false,
      recommendation: '',
      reasoning: '只找到一种方法，使用原始方案'
    };
  }

  /**
   * 构建增强的提示词
   */
  private buildEnhancedPrompt(originalPrompt: string, recommendation: string): string {
    return `原始任务：${originalPrompt}

---

找到的相关方法：
${recommendation}

---

请比较以上方法，选择最合适的方案执行任务。如果新方法确实更好（省时、省事、省资源），请使用新方法；否则使用原方法。
`;
  }
}
