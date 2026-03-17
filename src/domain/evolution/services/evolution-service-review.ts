export function buildReReviewReason(
  avgRating: number,
  feedbackCount: number,
): string {
  const reasons: string[] = [];
  if (avgRating < 3) {
    reasons.push(`Low average rating: ${avgRating.toFixed(2)}`);
  }
  if (feedbackCount >= 10) {
    reasons.push(`High feedback count: ${feedbackCount}`);
  }
  return reasons.join('; ');
}

export function evaluateAutoReviewEntry(entry: {
  abilityName: string;
  content: string;
  description: string;
  tags: string[];
}): { confidence: number; issues: string[] } {
  const issues: string[] = [];
  let confidence = 0.8;

  if (entry.content.length < 50) {
    issues.push('Content too short');
    confidence -= 0.2;
  }
  if (!entry.abilityName || entry.abilityName.length < 2) {
    issues.push('Invalid ability name');
    confidence -= 0.15;
  }

  const hasCode =
    entry.content.includes('```') ||
    entry.content.includes('function') ||
    entry.content.includes('class') ||
    entry.content.includes('const ') ||
    entry.content.includes('export');
  if (hasCode) {
    confidence += 0.1;
  }

  const experienceKeywords = [
    '经验',
    '方法',
    '技巧',
    '模式',
    '最佳实践',
    'learned',
    'discovered',
    'found',
    'technique',
    'pattern',
    'how to',
    'solution',
  ];
  const lowerContent = entry.content.toLowerCase();
  const hasExperience = experienceKeywords.some((keyword) =>
    lowerContent.includes(keyword.toLowerCase()),
  );
  if (hasExperience) {
    confidence += 0.05;
  }
  if (entry.tags.length > 0) {
    confidence += 0.05;
  }
  if (entry.description && entry.description.length > 20) {
    confidence += 0.05;
  }

  return {
    confidence: Math.min(Math.max(confidence, 0), 1),
    issues,
  };
}
