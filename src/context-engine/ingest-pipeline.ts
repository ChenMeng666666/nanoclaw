import crypto from 'crypto';
import type { NewMessage, Memory } from '../types.js';
import type { Context } from './types.js';

/**
 * 智能分块策略
 * 保护代码块、引用内容和长文本片段的完整性
 */
export function splitIntoMemoryChunks(
  content: string,
): Array<{ content: string; type: 'user' | 'code' | 'document' }> {
  const chunks: Array<{
    content: string;
    type: 'user' | 'code' | 'document';
  }> = [];

  // 1. 提取代码块（```代码块```）
  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks: Array<{ content: string; start: number; end: number }> = [];
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    codeBlocks.push({
      content: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // 2. 处理非代码块部分
  let lastEnd = 0;
  for (const codeBlock of codeBlocks) {
    // 处理代码块前的文本
    if (codeBlock.start > lastEnd) {
      const textBefore = content.slice(lastEnd, codeBlock.start).trim();
      if (textBefore) {
        // 按句子或段落分割普通文本
        const textChunks = splitTextIntoChunks(textBefore);
        for (const chunk of textChunks) {
          chunks.push({ content: chunk, type: 'user' });
        }
      }
    }
    // 添加代码块
    chunks.push({ content: codeBlock.content, type: 'code' });
    lastEnd = codeBlock.end;
  }

  // 3. 处理最后一个代码块后的文本
  if (lastEnd < content.length) {
    const textAfter = content.slice(lastEnd).trim();
    if (textAfter) {
      const textChunks = splitTextIntoChunks(textAfter);
      for (const chunk of textChunks) {
        chunks.push({ content: chunk, type: 'user' });
      }
    }
  }

  // 4. 如果没有代码块，直接处理整个文本
  if (chunks.length === 0) {
    const textChunks = splitTextIntoChunks(content);
    for (const chunk of textChunks) {
      chunks.push({ content: chunk, type: 'user' });
    }
  }

  return chunks;
}

/**
 * 文本分块（非代码块）
 * 按句子、段落或长度分割，确保语义完整性
 */
function splitTextIntoChunks(text: string): string[] {
  const chunks: string[] = [];
  const maxChunkSize = 300; // 最大块大小（字符）
  const sentences = text.split(/(?<=[。！？.!?])\s*/);

  let currentChunk = '';
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length <= maxChunkSize) {
      currentChunk += (currentChunk ? ' ' : '') + trimmed;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // 如果句子过长，强制分割
      if (trimmed.length > maxChunkSize) {
        const parts = splitLongSentence(trimmed, maxChunkSize);
        chunks.push(...parts);
      } else {
        currentChunk = trimmed;
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

/**
 * 分割过长的句子
 */
function splitLongSentence(text: string, maxSize: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxSize;
    if (end >= text.length) {
      chunks.push(text.slice(start));
      break;
    }

    // 寻找合适的分割点
    const splitPoints = [
      text.lastIndexOf('，', end),
      text.lastIndexOf('。', end),
      text.lastIndexOf('！', end),
      text.lastIndexOf('？', end),
      text.lastIndexOf('.', end),
      text.lastIndexOf('!', end),
      text.lastIndexOf('?', end),
      text.lastIndexOf(' ', end),
    ].filter((pos) => pos > start);

    if (splitPoints.length > 0) {
      end = Math.max(...splitPoints) + 1;
    } else {
      end = start + maxSize;
    }

    chunks.push(text.slice(start, end).trim());
    start = end;
  }

  return chunks;
}

/**
 * 基于内容类型计算重要性
 */
export function calculateImportance(content: string, type: string): number {
  let baseImportance = 0.6; // 默认 L2 记忆重要性

  // 代码块通常更重要
  if (type === 'code') {
    baseImportance = 0.85;
  }

  // 包含链接、引用或特定关键词的内容更重要
  const importantPatterns = [
    /https?:\/\/[^\s]+/g, // 链接
    /@[^\s]+/g, // 提及
    /#[\w]+/g, // 标签
    /(?:重要|关键|核心|注意|警告|紧急)/g, // 重要性关键词
  ];

  for (const pattern of importantPatterns) {
    if (pattern.test(content)) {
      baseImportance += 0.1;
      break;
    }
  }

  // 内容长度因子
  const lengthFactor = Math.min(content.length / 1000, 1) * 0.1;
  return Math.min(baseImportance + lengthFactor, 1.0);
}

/**
 * 计算时间戳权重（用于排序）
 * 越新的消息权重越高
 */
export function calculateTimestampWeight(
  messageTimestamp?: string | Date,
): number {
  const now = Date.now();
  const hourInMs = 60 * 60 * 1000;
  const dayInMs = 24 * hourInMs;

  let messageTime: number;
  try {
    if (messageTimestamp) {
      messageTime =
        typeof messageTimestamp === 'string'
          ? new Date(messageTimestamp).getTime()
          : messageTimestamp.getTime();
    } else {
      // 如果没有提供消息时间戳，使用当前时间
      messageTime = now;
    }
  } catch (err) {
    // logger not available here, assume current time
    messageTime = now;
  }

  // 权重随时间衰减：最近1小时 = 1.0，最近24小时 = 0.8，1周 = 0.5，更早 = 0.3
  const timePassed = now - messageTime;
  if (timePassed < hourInMs) {
    return 1.0;
  } else if (timePassed < dayInMs) {
    return 0.8;
  } else if (timePassed < 7 * dayInMs) {
    return 0.5;
  } else {
    return 0.3;
  }
}

/**
 * 从内容中提取标签
 */
export function extractTags(content: string): string[] {
  const tags: string[] = [];

  // 提取 #标签
  const hashtagRegex = /#([\w\u4e00-\u9fff]+)/g;
  let match;
  while ((match = hashtagRegex.exec(content)) !== null) {
    tags.push(match[1]);
  }

  // 提取 @提及
  const mentionRegex = /@([^\s]+)/g;
  while ((match = mentionRegex.exec(content)) !== null) {
    tags.push(match[1]);
  }

  // 基于内容类型添加标签
  if (content.includes('```')) {
    tags.push('code');
  }
  if (/https?:\/\/[^\s]+/.test(content)) {
    tags.push('link');
  }

  return [...new Set(tags)]; // 去重
}

export function generateMemoryId(): string {
  return crypto.randomBytes(16).toString('hex');
}
