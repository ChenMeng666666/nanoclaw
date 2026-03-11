/**
 * 技能验证模块
 * 验证功能插件（skills）的来源和完整性
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from './logger.js';
import { SecurityEventType, logSecurityEvent } from './security-alerts.js';

/**
 * 技能验证结果
 */
export interface SkillVerificationResult {
  verified: boolean;
  signature?: string;
  signer?: string;
  timestamp?: string;
  issues?: string[];
  warnings?: string[];
}

/**
 * 技能签名
 */
export interface SkillSignature {
  id: string;
  signature: string;
  signer: string;
  timestamp: string;
  hash: string;
}

/**
 * 技能验证器
 */
class SkillVerifier {
  /**
   * 验证技能目录的完整性和来源
   */
  verifySkillDirectory(skillPath: string): SkillVerificationResult {
    const result: SkillVerificationResult = {
      verified: true,
      issues: [],
      warnings: [],
    };

    // 检查基本结构
    if (!fs.existsSync(skillPath)) {
      result.verified = false;
      result.issues!.push('Skill directory not found');
      return result;
    }

    // 检查必要的文件
    const requiredFiles = ['CLAUDE.md', 'skill.js', 'icon.svg'];
    for (const file of requiredFiles) {
      if (!fs.existsSync(path.join(skillPath, file))) {
        result.warnings!.push(`Missing optional file: ${file}`);
      }
    }

    // 检查 package.json
    const packagePath = path.join(skillPath, 'package.json');
    if (fs.existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
        if (!pkg.name || !pkg.version) {
          result.warnings!.push('Missing name or version in package.json');
        }
      } catch (err) {
        result.warnings!.push('Invalid package.json');
      }
    }

    // 检查签名
    const signatureFile = path.join(skillPath, 'signature.json');
    if (fs.existsSync(signatureFile)) {
      const verification = this.verifySignature(skillPath, signatureFile);
      result.verified = verification.verified;
      result.signature = verification.signature;
      result.signer = verification.signer;
      result.timestamp = verification.timestamp;

      if (!verification.verified) {
        result.issues!.push('Signature verification failed');
      }
    } else {
      result.warnings!.push('No signature file found');
    }

    // 检查是否有危险模式
    result.issues!.push(...this.scanForDangerousPatterns(skillPath));

    if (!result.verified) {
      logSecurityEvent(
        'skill_verification_failed',
        'error',
        'skill-verifier',
        `Skill verification failed for ${path.basename(skillPath)}`,
        {
          skillPath,
          issues: result.issues,
        },
      );
    } else if (result.warnings!.length > 0) {
      logSecurityEvent(
        'skill_verification_failed',
        'warning',
        'skill-verifier',
        `Skill verification passed with warnings for ${path.basename(skillPath)}`,
        {
          skillPath,
          warnings: result.warnings,
        },
      );
    } else {
      logSecurityEvent(
        'skill_verification_failed',
        'info',
        'skill-verifier',
        `Skill verification passed for ${path.basename(skillPath)}`,
        {
          skillPath,
        },
      );
    }

    return result;
  }

  /**
   * 验证技能签名
   */
  private verifySignature(skillPath: string, signatureFile: string): SkillVerificationResult {
    const result: SkillVerificationResult = {
      verified: false,
      issues: [],
    };

    try {
      const signature: SkillSignature = JSON.parse(fs.readFileSync(signatureFile, 'utf8'));

      // 计算技能目录的哈希
      const computedHash = this.calculateSkillHash(skillPath, signatureFile);

      // 验证哈希
      if (signature.hash !== computedHash) {
        result.issues!.push('Hash mismatch');
        return result;
      }

      // 这里可以添加公钥验证逻辑
      // 目前我们只检查哈希值
      result.verified = true;
      result.signature = signature.signature;
      result.signer = signature.signer;
      result.timestamp = signature.timestamp;
    } catch (err) {
      result.issues!.push('Invalid signature file');
    }

    return result;
  }

  /**
   * 计算技能目录的哈希值
   */
  private calculateSkillHash(skillPath: string, excludeFile: string): string {
    const hasher = crypto.createHash('sha256');
    const skillFiles: string[] = [];

    // 递归遍历技能目录
    const walkDir = (dir: string) => {
      const files = fs.readdirSync(dir, { withFileTypes: true });

      for (const file of files) {
        const fullPath = path.join(dir, file.name);

        if (fullPath === excludeFile) {
          continue;
        }

        if (file.isDirectory()) {
          walkDir(fullPath);
        } else {
          skillFiles.push(fullPath);
        }
      }
    };

    walkDir(skillPath);

    // 对文件排序以确保哈希计算的一致性
    skillFiles.sort();

    for (const filePath of skillFiles) {
      const content = fs.readFileSync(filePath);
      const relativePath = path.relative(skillPath, filePath);
      hasher.update(relativePath);
      hasher.update(content);
    }

    return hasher.digest('hex');
  }

  /**
   * 扫描技能文件中的危险模式
   */
  private scanForDangerousPatterns(skillPath: string): string[] {
    const issues: string[] = [];
    const dangerousPatterns = [
      /(?:eval|Function\()/g,
      /(?:child_process|fs|http|https|net|tls)/g,
      /(?:require\(['"]child_process['"]\)|import\s*['"]child_process['"])/g,
      /(?:exec|spawn|fork|execFile)/g,
    ];

    const skillFiles: string[] = [];
    const walkDir = (dir: string) => {
      const files = fs.readdirSync(dir, { withFileTypes: true });

      for (const file of files) {
        const fullPath = path.join(dir, file.name);

        if (file.isDirectory()) {
          walkDir(fullPath);
        } else if (fullPath.endsWith('.js') || fullPath.endsWith('.ts')) {
          skillFiles.push(fullPath);
        }
      }
    };

    walkDir(skillPath);

    for (const filePath of skillFiles) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const pattern of dangerousPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          issues.push(`Dangerous pattern detected in ${path.relative(skillPath, filePath)}`);
          break;
        }
      }
    }

    return issues;
  }

  /**
   * 列出所有已安装的技能
   */
  listInstalledSkills(skillsDir: string = './.claude/skills'): string[] {
    if (!fs.existsSync(skillsDir)) {
      return [];
    }

    return fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
  }

  /**
   * 验证所有已安装的技能
   */
  verifyAllInstalledSkills(): SkillVerificationResult[] {
    const skillsDir = path.join(process.cwd(), '.claude', 'skills');
    const skills = this.listInstalledSkills(skillsDir);
    const results: SkillVerificationResult[] = [];

    for (const skillName of skills) {
      const skillPath = path.join(skillsDir, skillName);
      const result = this.verifySkillDirectory(skillPath);
      results.push({
        ...result,
        // 添加技能名称到结果中
      });
      logger.debug({ skillName, verified: result.verified, issues: result.issues, warnings: result.warnings }, 'Skill verification result');
    }

    return results;
  }

  /**
   * 生成技能签名（仅限开发使用）
   */
  generateSkillSignature(skillPath: string, signer: string = 'NanoClaw'): SkillSignature {
    const signatureFile = path.join(skillPath, 'signature.json');
    const hash = this.calculateSkillHash(skillPath, signatureFile);

    const signature: SkillSignature = {
      id: crypto.randomBytes(16).toString('hex'),
      signature: `dummy_signature_${Date.now()}`,
      signer,
      timestamp: new Date().toISOString(),
      hash,
    };

    fs.writeFileSync(signatureFile, JSON.stringify(signature, null, 2));
    logger.debug({ skillPath, signatureId: signature.id }, 'Skill signature generated');

    return signature;
  }
}

// 导出单例实例
export const skillVerifier = new SkillVerifier();
