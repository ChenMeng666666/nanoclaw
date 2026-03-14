import { SignalType, SignalPattern } from './types.js';

export const SIGNAL_PATTERNS: Record<SignalType, Record<string, SignalPattern>> = {
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
