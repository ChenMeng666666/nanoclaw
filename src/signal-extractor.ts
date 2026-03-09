/**
 * 信号提取模块
 *
 * 参考 evolver 的 signals.js，从反思内容/对话内容中提取信号
 * 用于触发学习、进化、饱和检测等行为
 */
import { EvolutionEntry, MainComponent } from './types.js';
import { logger } from './logger.js';

// ===== 信号类型定义 =====

/**
 * 信号类型枚举
 *
 * 分类：
 * - 学习相关：触发主动学习
 * - 反思相关：触发问题修复
 * - 状态相关：触发模式切换
 * - 创新相关：触发新功能开发
 */
export type SignalType =
  // 学习相关
  | 'capability_gap' // 能力缺口：发现自己某方面能力不足
  | 'learning_opportunity' // 学习机会：发现可以学习的新技能/方法
  | 'knowledge_missing' // 知识缺失：缺少必要的知识来完成任务
  // 反思相关
  | 'recurring_error' // 重复错误：同一个错误出现多次
  | 'performance_issue' // 性能问题：处理效率或质量问题
  | 'user_feedback' // 用户反馈：用户给出明确反馈
  | 'negative_feedback' // 负面反馈：用户表达不满
  | 'positive_feedback' // 正面反馈：用户表达满意
  // 状态相关
  | 'stable_plateau' // 稳定高原：连续多次表现稳定
  | 'learning_stagnation' // 学习停滞：一段时间没有进步
  | 'saturation' // 饱和：达到能力极限
  // 创新相关
  | 'feature_request' // 功能请求：用户或自己提出新功能需求
  | 'improvement_suggestion' // 改进建议：发现可以改进的地方
  | 'innovation_idea'; // 创新想法：突然的灵感或新想法

/**
 * 信号结构
 */
export interface Signal {
  type: SignalType;
  confidence: number; // 信号强度 0-1
  snippet?: string; // 触发信号的文本片段
  metadata?: Record<string, unknown>;
}

/**
 * 信号提取选项
 */
export interface SignalExtractionOptions {
  content: string; // 反思内容/对话内容
  memorySnippet?: string; // 记忆摘要
  recentEvents?: EvolutionEntry[]; // 最近进化事件
  language?: 'en' | 'zh-CN' | 'zh-TW' | 'ja'; // 语言
}

// ===== 信号模式定义 =====

/**
 * 多语言信号模式
 *
 * 每个模式包含：
 * - patterns: 匹配正则表达式数组
 * - weight: 基础权重
 * - actionable: 是否可执行（影响优先级）
 */
interface SignalPattern {
  patterns: RegExp[];
  weight: number;
  actionable: boolean;
}

const SIGNAL_PATTERNS: Record<SignalType, Record<string, SignalPattern>> = {
  // 学习相关
  capability_gap: {
    en: {
      patterns: [
        /I (don't|cannot|can't|am unable to) (understand|do|handle|figure out|solve)/i,
        /I (lack|need|should learn|have to learn)/i,
        /I'm (not good at|weak at|struggling with)/i,
        /I need (to learn|more (knowledge|skills|practice))/i,
        /my (ability|skill|knowledge) (is|are) (limited|insufficient|lacking)/i,
      ],
      weight: 0.8,
      actionable: true,
    },
    'zh-CN': {
      patterns: [
        /我(不|无法|不能)(懂|会|理解|处理|解决)/,
        /我(缺乏|需要学习|应该学习|得学习)/,
        /我(不擅长|不太会|在.*方面比较弱)/,
        /我需要(学习|更多.*知识|更多.*技能|练习)/,
        /我的(能力|技能|知识)(有限|不足|欠缺)/,
        /我发现自己.*不足/,
        /这方面我还需要/,
      ],
      weight: 0.8,
      actionable: true,
    },
    'zh-TW': {
      patterns: [
        /我(不|無法|不能)(懂|會|理解|處理|解決)/,
        /我(缺乏|需要學習|應該學習|得學習)/,
        /我(不擅長|不太會|在.*方面比較弱)/,
        /我需要(學習|更多.*知識|更多.*技能|練習)/,
        /我的(能力|技能|知識)(有限|不足|欠缺)/,
      ],
      weight: 0.8,
      actionable: true,
    },
    ja: {
      patterns: [
        /(わから|できな|理解できな|解決できな)/,
        /学ぶ必要がある/,
        /苦手/,
        /能力が(不足|足り)/,
      ],
      weight: 0.8,
      actionable: true,
    },
  },

  learning_opportunity: {
    en: {
      patterns: [
        /I (could|should|want to) learn/i,
        /it would be (helpful|useful|good) to learn/i,
        /I (found|discovered|saw) (a|an) (new|interesting) (method|technique|approach)/i,
        /I can improve by/i,
        /this (gives me|provides) (a|an) (opportunity|chance) to learn/i,
      ],
      weight: 0.7,
      actionable: true,
    },
    'zh-CN': {
      patterns: [
        /我可以学习/,
        /学(一学|习)会很(有帮助|有用|好)/,
        /我发现(了|一个)(新|有趣的)(方法|技巧|思路)/,
        /这让我有机会学习/,
        /我可以.*提升/,
        /值得学习/,
      ],
      weight: 0.7,
      actionable: true,
    },
    'zh-TW': {
      patterns: [
        /我可以學習/,
        /學(一學|習)會很(有幫助|有用|好)/,
        /我發現(了|一個)(新|有趣的)(方法|技巧|思路)/,
        /這讓我有機會學習/,
      ],
      weight: 0.7,
      actionable: true,
    },
    ja: {
      patterns: [
        /学ぶ(べき|できる|チャンス)/,
        /学習の機会/,
        /新しい(方法|技術|アプローチ)/,
      ],
      weight: 0.7,
      actionable: true,
    },
  },

  knowledge_missing: {
    en: {
      patterns: [
        /I (don't|do not) know (how to|about|the|what)/i,
        /I'm (not sure|uncertain|confused) (about|how)/i,
        /I have no (idea|clue|knowledge)/i,
        /I need (more )?information (about|on)/i,
        /I'm missing (information|context|knowledge)/i,
      ],
      weight: 0.75,
      actionable: true,
    },
    'zh-CN': {
      patterns: [
        /我(不知道|不清楚|不了解)/,
        /我(不确定|不太确定|有点困惑)/,
        /我没有(头绪|概念|这方面的知识)/,
        /我需要更多(信息|资料|背景)/,
        /我缺少(信息|上下文|知识)/,
      ],
      weight: 0.75,
      actionable: true,
    },
    'zh-TW': {
      patterns: [
        /我(不知道|不清楚|不了解)/,
        /我(不確定|不太確定|有點困惑)/,
        /我沒有(頭緒|概念|這方面的知識)/,
        /我需要更多(信息|資料|背景)/,
      ],
      weight: 0.75,
      actionable: true,
    },
    ja: {
      patterns: [
        /知らない/,
        /わからない/,
        /情報が(足りない|ない)/,
        /知識が不足/,
      ],
      weight: 0.75,
      actionable: true,
    },
  },

  // 反思相关
  recurring_error: {
    en: {
      patterns: [
        /I (keep|kept|always) (making|getting|encountering) (the same|this) (mistake|error)/i,
        /again( and again)? I (made|got|encountered)/i,
        /this is the (second|third|\d+th) time/i,
        /repeatedly (failed|made mistake|got error)/i,
      ],
      weight: 0.9,
      actionable: true,
    },
    'zh-CN': {
      patterns: [
        /我(总是|一直|又)犯(同样的|这个)(错误|毛病)/,
        /又(一次|再)出现了/,
        /这是(第二|第三|第.*).{0,3}次了/,
        /反复(出错|失败)/,
        /同样的问题又出现了/,
      ],
      weight: 0.9,
      actionable: true,
    },
    'zh-TW': {
      patterns: [
        /我(總是|一直|又)犯(同樣的|這個)(錯誤|毛病)/,
        /又(一次|再)出現了/,
        /這是(第二|第三|第.*).{0,3}次了/,
        /反覆(出錯|失敗)/,
      ],
      weight: 0.9,
      actionable: true,
    },
    ja: {
      patterns: [/また(同じ|間違|エラー)/, /何度も/, /繰り返し/],
      weight: 0.9,
      actionable: true,
    },
  },

  performance_issue: {
    en: {
      patterns: [
        /too (slow|fast|long|short)/i,
        /not (fast|efficient|good) enough/i,
        /performance (issue|problem|degraded)/i,
        /taking too (much )?time/i,
        /response (time|quality) is/i,
        /efficiency (is|could be)/i,
      ],
      weight: 0.7,
      actionable: true,
    },
    'zh-CN': {
      patterns: [
        /太(慢|快|长|短)了/,
        /(不够|不太)(快|高效|好)/,
        /性能(问题|下降|瓶颈)/,
        /花费太(多.*时间|长时间)/,
        /响应(时间|质量)/,
        /效率(低|不够|可以提升)/,
      ],
      weight: 0.7,
      actionable: true,
    },
    'zh-TW': {
      patterns: [
        /太(慢|快|長|短)了/,
        /(不夠|不太)(快|高效|好)/,
        /性能(問題|下降|瓶頸)/,
        /花費太(多.*時間|長時間)/,
      ],
      weight: 0.7,
      actionable: true,
    },
    ja: {
      patterns: [
        /(遅すぎ|速すぎ|長すぎ|短すぎ)/,
        /パフォーマンス(問題|低下)/,
        /効率が(悪い|低い)/,
      ],
      weight: 0.7,
      actionable: true,
    },
  },

  user_feedback: {
    en: {
      patterns: [
        /user (said|told|asked|mentioned|complained|praised)/i,
        /the user (wants|needs|prefers|likes|dislikes)/i,
        /according to the user/i,
        /user feedback:/i,
      ],
      weight: 0.85,
      actionable: true,
    },
    'zh-CN': {
      patterns: [
        /用户(说|告诉|问|提到|抱怨|表扬|夸)/,
        /用户(想要|需要|喜欢|不喜欢|偏好)/,
        /根据用户/,
        /用户反馈/,
      ],
      weight: 0.85,
      actionable: true,
    },
    'zh-TW': {
      patterns: [
        /用戶(說|告訴|問|提到|抱怨|表揚|誇)/,
        /用戶(想要|需要|喜歡|不喜歡|偏好)/,
        /根據用戶/,
        /用戶反饋/,
      ],
      weight: 0.85,
      actionable: true,
    },
    ja: {
      patterns: [
        /ユーザーが(言っ|言わ|聞い|文句|褒め)/,
        /ユーザーの(要望|好み|フィードバック)/,
      ],
      weight: 0.85,
      actionable: true,
    },
  },

  negative_feedback: {
    en: {
      patterns: [
        /user (is|was|seems) (unhappy|dissatisfied|frustrated|angry|annoyed)/i,
        /user (complained|criticized|didn't like)/i,
        /user (said|told me) (it's|that's) (bad|wrong|incorrect|not good|terrible)/i,
        /user gave (negative|bad) feedback/i,
        /not what (the )?user (wanted|expected|needed)/i,
      ],
      weight: 0.9,
      actionable: true,
    },
    'zh-CN': {
      patterns: [
        /用户(不开心|不满意|沮丧|生气|烦躁|恼火)/,
        /用户(抱怨|批评|不喜欢)/,
        /用户说.*(不对|不好|错误|糟糕)/,
        /用户给了(负面|差)评/,
        /不是用户(想要|期望|需要)的/,
      ],
      weight: 0.9,
      actionable: true,
    },
    'zh-TW': {
      patterns: [
        /用戶(不開心|不滿意|沮喪|生氣|煩躁|惱火)/,
        /用戶(抱怨|批評|不喜歡)/,
        /用戶說.*(不對|不好|錯誤|糟糕)/,
      ],
      weight: 0.9,
      actionable: true,
    },
    ja: {
      patterns: [
        /ユーザーが(不満|怒っ|イライラ)/,
        /ユーザーから(文句|批判|苦情)/,
        /期待(していなかっ|と違っ)/,
      ],
      weight: 0.9,
      actionable: true,
    },
  },

  positive_feedback: {
    en: {
      patterns: [
        /user (is|was|seems) (happy|satisfied|pleased|delighted)/i,
        /user (praised|complimented|liked|appreciated)/i,
        /user (said|told me) (it's|that's) (good|great|excellent|perfect|amazing)/i,
        /user gave (positive|good) feedback/i,
        /exactly what (the )?user (wanted|expected|needed)/i,
      ],
      weight: 0.6,
      actionable: false,
    },
    'zh-CN': {
      patterns: [
        /用户(开心|满意|高兴|惊喜)/,
        /用户(表扬|夸奖|喜欢|认可|赞赏)/,
        /用户说.*(好|棒|优秀|完美)/,
        /用户给了(正面|好)评/,
        /正是用户(想要|期望|需要)的/,
      ],
      weight: 0.6,
      actionable: false,
    },
    'zh-TW': {
      patterns: [
        /用戶(開心|滿意|高興|驚喜)/,
        /用戶(表揚|誇獎|喜歡|認可|讚賞)/,
        /用戶說.*(好|棒|優秀|完美)/,
      ],
      weight: 0.6,
      actionable: false,
    },
    ja: {
      patterns: [
        /ユーザーが(嬉し|満足|喜ん)/,
        /ユーザーから(褒め|好評|感謝)/,
        /期待通り/,
      ],
      weight: 0.6,
      actionable: false,
    },
  },

  // 状态相关
  stable_plateau: {
    en: {
      patterns: [
        /I've been (stable|consistent|steady) (for|over|the last)/i,
        /no (significant|major) (changes|improvements|issues) (recently|lately)/i,
        /everything (is|has been) (working|going|running) (well|smoothly|fine)/i,
        /I (feel|think) I've (reached|achieved) a (stable|good) (level|state)/i,
      ],
      weight: 0.5,
      actionable: false,
    },
    'zh-CN': {
      patterns: [
        /我已经(稳定|持续|平稳)(了|一段时间)/,
        /(最近|近期)没有(明显|重大)的(变化|改进|问题)/,
        /一切都(很|运行得)(好|顺利|正常)/,
        /我觉得我已经(达到|进入)(稳定|不错)的(水平|状态)/,
      ],
      weight: 0.5,
      actionable: false,
    },
    'zh-TW': {
      patterns: [
        /我已經(穩定|持續|平穩)(了|一段時間)/,
        /(最近|近期)沒有(明顯|重大)的(變化|改進|問題)/,
        /一切都(很|運行得)(好|順利|正常)/,
      ],
      weight: 0.5,
      actionable: false,
    },
    ja: {
      patterns: [
        /安定し(ている|て)/,
        /(大きな|重大な)(変化|問題)が(ない|なし)/,
        /順調に(動い|い)/,
      ],
      weight: 0.5,
      actionable: false,
    },
  },

  learning_stagnation: {
    en: {
      patterns: [
        /I (haven't|have not) (learned|improved|grown|progressed) (much|significantly)? (lately|recently|for a while)/i,
        /my (learning|progress|growth) has (slowed|stopped|stagnated)/i,
        /I feel (stuck|stagnant|in a rut)/i,
        /no (new|major) (insights|learnings|discoveries)/i,
      ],
      weight: 0.65,
      actionable: true,
    },
    'zh-CN': {
      patterns: [
        /我(最近|这段时间|好久)没有(学到|提升|进步|成长)/,
        /我的(学习|进步|成长)(停滞|慢下来|停了)/,
        /我觉得(卡住了|停滞不前|陷入瓶颈)/,
        /没有(新的|重大的)(洞见|学习|发现)/,
        /感觉学不动了/,
      ],
      weight: 0.65,
      actionable: true,
    },
    'zh-TW': {
      patterns: [
        /我(最近|這段時間|好久)沒有(學到|提升|進步|成長)/,
        /我的(學習|進步|成長)(停滯|慢下來|停了)/,
        /我覺得(卡住了|停滯不前|陷入瓶頸)/,
      ],
      weight: 0.65,
      actionable: true,
    },
    ja: {
      patterns: [
        /学びが(ない|止まっ|遅くなっ)/,
        /成長が(停滞|止ま)/,
        /行き詰ま(って|り)/,
      ],
      weight: 0.65,
      actionable: true,
    },
  },

  saturation: {
    en: {
      patterns: [
        /I've (reached|hit|arrived at) my (limit|peak|maximum)/i,
        /I can't (improve|learn|do) (any )?more/i,
        /I've (done|tried) everything I (can|know)/i,
        /no more (room|space|potential) for (improvement|growth)/i,
      ],
      weight: 0.8,
      actionable: false,
    },
    'zh-CN': {
      patterns: [
        /我已经(达到|到了)(极限|顶峰|上限)/,
        /我无法再(提升|学习|做)了/,
        /我已经(尽力|尝试了所有)/,
        /没有(更多|更大)(提升|成长)空间了/,
      ],
      weight: 0.8,
      actionable: false,
    },
    'zh-TW': {
      patterns: [
        /我已經(達到|到了)(極限|頂峰|上限)/,
        /我無法再(提升|學習|做)了/,
        /我已經(盡力|嘗試了所有)/,
      ],
      weight: 0.8,
      actionable: false,
    },
    ja: {
      patterns: [
        /限界に(達し|到達)/,
        /これ以上(できな|無理)/,
        /成長の余地が(ない|なし)/,
      ],
      weight: 0.8,
      actionable: false,
    },
  },

  // 创新相关
  feature_request: {
    en: {
      patterns: [
        /I (need|want|should have) (a|an|the ability to|the capability to)/i,
        /it would be (nice|great|helpful) if I could/i,
        /I wish I could/i,
        /feature (request|suggestion):/i,
        /new (feature|capability|ability):/i,
      ],
      weight: 0.75,
      actionable: true,
    },
    'zh-CN': {
      patterns: [
        /我(需要|想要|应该有)(能力|功能)/,
        /如果我能.*就(好了|太棒了|很有帮助)/,
        /我希望我能/,
        /功能请求:/,
        /新功能:/,
      ],
      weight: 0.75,
      actionable: true,
    },
    'zh-TW': {
      patterns: [
        /我(需要|想要|應該有)(能力|功能)/,
        /如果我能.*就(好了|太棒了|很有幫助)/,
        /我希望我能/,
        /功能請求:/,
      ],
      weight: 0.75,
      actionable: true,
    },
    ja: {
      patterns: [
        /新機能/,
        /機能リクエスト/,
        /できればいいのに/,
        /機能が(欲し|必要)/,
      ],
      weight: 0.75,
      actionable: true,
    },
  },

  improvement_suggestion: {
    en: {
      patterns: [
        /I could (improve|do better|optimize)/i,
        /it would be better if/i,
        /I should (try|attempt|consider)/i,
        /improvement:(\s|$)/i,
        /suggestion:(\s|$)/i,
      ],
      weight: 0.7,
      actionable: true,
    },
    'zh-CN': {
      patterns: [
        /我可以(改进|做得更好|优化)/,
        /如果.*会更好/,
        /我应该(尝试|考虑)/,
        /改进:/,
        /建议:/,
      ],
      weight: 0.7,
      actionable: true,
    },
    'zh-TW': {
      patterns: [
        /我可以(改進|做得更好|優化)/,
        /如果.*會更好/,
        /我應該(嘗試|考慮)/,
        /改進:/,
        /建議:/,
      ],
      weight: 0.7,
      actionable: true,
    },
    ja: {
      patterns: [/改善(でき|できそう|提案)/, /もっといい方法/, /提案:/],
      weight: 0.7,
      actionable: true,
    },
  },

  innovation_idea: {
    en: {
      patterns: [
        /I (have|got|came up with) (a|an) (idea|insight|inspiration)/i,
        /what if I/i,
        /suddenly I (realized|thought|understood)/i,
        /innovative (approach|idea|solution):/i,
        /new idea:/i,
      ],
      weight: 0.6,
      actionable: true,
    },
    'zh-CN': {
      patterns: [
        /我(有|想到了)(一个|个)(想法|灵感|洞见)/,
        /如果我/,
        /突然我(意识到|想到|明白了)/,
        /创新(方法|想法|解决方案):/,
        /新想法:/,
      ],
      weight: 0.6,
      actionable: true,
    },
    'zh-TW': {
      patterns: [
        /我(有|想到了)(一個|個)(想法|靈感|洞見)/,
        /如果我/,
        /突然我(意識到|想到|明白了)/,
        /創新(方法|想法|解決方案):/,
      ],
      weight: 0.6,
      actionable: true,
    },
    ja: {
      patterns: [
        /アイデアが(浮かん|思いつ)/,
        /ひらめき/,
        /新しい(アイデア|発想)/,
      ],
      weight: 0.6,
      actionable: true,
    },
  },
};

// ===== 辅助函数 =====

/**
 * 检测文本语言
 */
function detectLanguage(text: string): 'en' | 'zh-CN' | 'zh-TW' | 'ja' {
  // 简单启发式检测
  const jaChars = text.match(/[\u3040-\u309F\u30A0-\u30FF]/g);
  if (jaChars && jaChars.length > 10) return 'ja';

  const zhTwChars = text.match(/[繁體臺灣]/g);
  if (zhTwChars && zhTwChars.length > 0) return 'zh-TW';

  const zhChars = text.match(/[\u4E00-\u9FFF]/g);
  if (zhChars && zhChars.length > 10) return 'zh-CN';

  return 'en';
}

/**
 * 提取匹配的文本片段
 */
function extractSnippet(
  text: string,
  match: RegExpMatchArray,
  contextLength: number = 50,
): string {
  const start = Math.max(0, (match.index || 0) - contextLength);
  const end = Math.min(
    text.length,
    (match.index || 0) + match[0].length + contextLength,
  );
  return text.slice(start, end).trim();
}

/**
 * 去重信号
 */
function deduplicateSignals(signals: Signal[]): Signal[] {
  const seen = new Set<string>();
  const result: Signal[] = [];

  for (const signal of signals) {
    const key = signal.type;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(signal);
    } else {
      // 如果已存在，取置信度更高的
      const existing = result.find((s) => s.type === signal.type);
      if (existing && signal.confidence > existing.confidence) {
        existing.confidence = signal.confidence;
        if (signal.snippet) existing.snippet = signal.snippet;
      }
    }
  }

  return result;
}

/**
 * 计算信号置信度调整
 */
function adjustConfidence(
  baseWeight: number,
  matchCount: number,
  contextBoost: number = 0,
): number {
  // 多次匹配增加置信度，但有上限
  const matchBoost = Math.min(matchCount * 0.1, 0.2);
  const confidence = Math.min(baseWeight + matchBoost + contextBoost, 1.0);
  return Math.round(confidence * 100) / 100;
}

// ===== 主函数 =====

/**
 * 从内容中提取信号
 *
 * @param options 提取选项
 * @returns 提取的信号数组，按优先级排序（actionable 优先）
 */
export function extractSignals(options: SignalExtractionOptions): Signal[] {
  try {
    const { content, memorySnippet, recentEvents } = options;
    const language = options.language || detectLanguage(content);

    const signals: Signal[] = [];

    // 遍历所有信号类型
    for (const [signalType, langPatterns] of Object.entries(SIGNAL_PATTERNS)) {
      const patterns = langPatterns[language] || langPatterns['en'];

      for (const pattern of patterns.patterns) {
        const matches = content.matchAll(pattern);

        for (const match of matches) {
          signals.push({
            type: signalType as SignalType,
            confidence: adjustConfidence(patterns.weight, 1),
            snippet: extractSnippet(content, match),
            metadata: {
              language,
              actionable: patterns.actionable,
            },
          });
        }
      }
    }

    // 上下文增强：检查记忆摘要
    if (memorySnippet) {
      // 如果记忆中提到相关主题，增强相关信号
      const memorySignals = extractSignals({
        content: memorySnippet,
        language,
      });

      for (const ms of memorySignals) {
        const existing = signals.find((s) => s.type === ms.type);
        if (existing) {
          existing.confidence = adjustConfidence(existing.confidence, 1, 0.1);
        }
      }
    }

    // 上下文增强：检查最近事件
    if (recentEvents && recentEvents.length > 0) {
      // 如果最近有相关进化事件，增强学习相关信号
      const hasRecentLearning = recentEvents.some(
        (e) => e.tags?.includes('learning') || e.tags?.includes('skill'),
      );

      if (hasRecentLearning) {
        for (const s of signals) {
          if (
            s.type === 'learning_opportunity' ||
            s.type === 'capability_gap'
          ) {
            s.confidence = adjustConfidence(s.confidence, 1, 0.15);
          }
        }
      }
    }

    // 去重
    const deduplicated = deduplicateSignals(signals);

    // 排序：actionable 优先，然后按置信度降序
    deduplicated.sort((a, b) => {
      const aActionable = a.metadata?.actionable ?? false;
      const bActionable = b.metadata?.actionable ?? false;

      if (aActionable !== bActionable) {
        return aActionable ? -1 : 1;
      }

      return b.confidence - a.confidence;
    });

    return deduplicated;
  } catch (error) {
    logger.warn({ error }, 'Signal extraction failed, returning empty array');
    return [];
  }
}

/**
 * 获取信号的可执行性
 */
export function isActionableSignal(signalType: SignalType): boolean {
  // 预定义的可执行信号
  const actionableSignals: SignalType[] = [
    'capability_gap',
    'learning_opportunity',
    'knowledge_missing',
    'recurring_error',
    'performance_issue',
    'user_feedback',
    'negative_feedback',
    'learning_stagnation',
    'feature_request',
    'improvement_suggestion',
    'innovation_idea',
  ];

  return actionableSignals.includes(signalType);
}

/**
 * 获取信号建议的行动类别
 */
export function getSignalActionCategory(
  signalType: SignalType,
): 'learn' | 'repair' | 'optimize' | 'innovate' | 'none' {
  const categoryMap: Record<
    SignalType,
    'learn' | 'repair' | 'optimize' | 'innovate' | 'none'
  > = {
    // 学习相关 -> learn
    capability_gap: 'learn',
    learning_opportunity: 'learn',
    knowledge_missing: 'learn',

    // 反思相关 -> repair
    recurring_error: 'repair',
    performance_issue: 'optimize',
    user_feedback: 'repair',
    negative_feedback: 'repair',
    positive_feedback: 'none',

    // 状态相关
    stable_plateau: 'none',
    learning_stagnation: 'learn',
    saturation: 'innovate',

    // 创新相关
    feature_request: 'innovate',
    improvement_suggestion: 'optimize',
    innovation_idea: 'innovate',
  };

  return categoryMap[signalType] || 'none';
}

/**
 * 根据信号选择推荐的 Gene 类别
 */
export function getRecommendedGeneCategory(
  signals: Signal[],
): 'repair' | 'optimize' | 'innovate' | 'learn' {
  if (signals.length === 0) return 'learn';

  // 统计各类行动的数量和权重
  const categoryScores: Record<string, number> = {
    learn: 0,
    repair: 0,
    optimize: 0,
    innovate: 0,
  };

  for (const signal of signals) {
    const category = getSignalActionCategory(signal.type);
    if (category !== 'none') {
      categoryScores[category] += signal.confidence;
    }
  }

  // 返回得分最高的类别
  let maxCategory: 'repair' | 'optimize' | 'innovate' | 'learn' = 'learn';
  let maxScore = 0;

  for (const [category, score] of Object.entries(categoryScores)) {
    if (score > maxScore) {
      maxScore = score;
      maxCategory = category as 'repair' | 'optimize' | 'innovate' | 'learn';
    }
  }

  return maxCategory;
}

/**
 * 主项目组件信号提取
 */
export function extractMainSignals(options: {
  content: string;
  component?: MainComponent;
  memorySnippet?: string;
  recentEvents?: EvolutionEntry[];
}): Signal[] {
  try {
    const { content, component, memorySnippet, recentEvents } = options;
    const language = detectLanguage(content);

    const signals: Signal[] = [];

    // 先使用通用信号提取
    const generalSignals = extractSignals(options);
    signals.push(...generalSignals);

    // 组件特定信号增强
    if (component) {
      const componentSignals = extractComponentSpecificSignals(
        content,
        component,
        language,
      );
      signals.push(...componentSignals);
    }

    // 去重和排序
    const deduplicated = deduplicateSignals(signals);

    deduplicated.sort((a, b) => {
      const aActionable = a.metadata?.actionable ?? false;
      const bActionable = b.metadata?.actionable ?? false;

      if (aActionable !== bActionable) {
        return aActionable ? -1 : 1;
      }

      return b.confidence - a.confidence;
    });

    return deduplicated;
  } catch (error) {
    logger.warn(
      { error },
      'Main project signal extraction failed, returning empty array',
    );
    return [];
  }
}

/**
 * 提取组件特定信号
 */
function extractComponentSpecificSignals(
  content: string,
  component: MainComponent,
  language: string,
): Signal[] {
  const signals: Signal[] = [];

  // 组件特定的信号模式
  const componentPatterns: Record<
    MainComponent,
    Array<{
      type: SignalType;
      patterns: RegExp[];
      weight: number;
      actionable: boolean;
    }>
  > = {
    [MainComponent.CHANNELS]: [
      {
        type: 'performance_issue',
        patterns: [
          /channel.*(connect|connection|disconnect|timeout)/i,
          /(send|receive).*message.*(fail|error|timeout)/i,
        ],
        weight: 0.85,
        actionable: true,
      },
    ],
    [MainComponent.CONTAINER]: [
      {
        type: 'recurring_error',
        patterns: [
          /container.*(start|spawn|run|exit).*(fail|error|crash)/i,
          /container.*(timeout|hang|unresponsive)/i,
        ],
        weight: 0.9,
        actionable: true,
      },
    ],
    [MainComponent.ROUTER]: [
      {
        type: 'performance_issue',
        patterns: [
          /(route|routing).*(fail|error|timeout)/i,
          /message.*route.*(fail|error)/i,
        ],
        weight: 0.8,
        actionable: true,
      },
    ],
    [MainComponent.DATABASE]: [
      {
        type: 'recurring_error',
        patterns: [
          /(db|database|sql).*(error|fail|timeout)/i,
          /(query|transaction).*(fail|error)/i,
        ],
        weight: 0.95,
        actionable: true,
      },
    ],
    [MainComponent.QUEUE]: [
      {
        type: 'performance_issue',
        patterns: [
          /queue.*(overflow|timeout|block)/i,
          /message.*queue.*(delay|timeout)/i,
        ],
        weight: 0.8,
        actionable: true,
      },
    ],
  };

  const patterns = componentPatterns[component] || [];

  for (const patternInfo of patterns) {
    for (const pattern of patternInfo.patterns) {
      const matches = content.matchAll(pattern);

      for (const match of matches) {
        signals.push({
          type: patternInfo.type,
          confidence: patternInfo.weight,
          snippet: extractSnippet(content, match),
          metadata: {
            language,
            actionable: patternInfo.actionable,
            component,
          },
        });
      }
    }
  }

  return signals;
}
