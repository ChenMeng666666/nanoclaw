import crypto from 'crypto';
import { generateEmbedding } from '../../../embedding-providers/registry.js';
import {
  createEvolutionEntry,
  getEvolutionEntry,
  getDuplicateEvolutionEntry,
  getDatabase,
  addGeneToChain,
  logAudit,
  CreateGeneInput,
} from '../../../db-agents.js';
import {
  EvolutionEntry,
  MainExperienceInput,
  GEP_SCHEMA_VERSION,
  generateAssetId,
  DuplicateCheckResult,
} from '../../../types.js';
import { logger } from '../../../logger.js';
import { Signal } from '../../../signal-extractor.js';

export interface SubmitExperienceConfig {
  autoApproveThreshold: number;
  requireUserReview: boolean;
}

export interface SubmitExperienceDeps {
  getCategory: (
    signals: Signal[],
  ) => 'repair' | 'optimize' | 'innovate' | 'learn';
  extractSignals: (input: { content: string }) => Signal[];
  checkDuplicateSignal: (
    content: string,
    sourceAgentId: string,
  ) => Promise<DuplicateCheckResult>;
  autoReviewEntry: (entry: {
    abilityName: string;
    content: string;
    description: string;
    tags: string[];
  }) => Promise<{ confidence: number; issues: string[] }>;
  autoReviewPendingEntry: (entry: EvolutionEntry) => Promise<void>;
  assertCommandsSafe: (commands: string[]) => void;
}

export class SubmitExperienceUseCase {
  constructor(
    private readonly config: SubmitExperienceConfig,
    private readonly deps: SubmitExperienceDeps,
  ) {}

  async submitExperience(
    abilityName: string,
    content: string,
    sourceAgentId: string,
    description?: string,
    tags?: string[],
  ): Promise<number> {
    logger.info(
      { abilityName, sourceAgentId, contentLength: content.length },
      'Submitting experience to evolution (GEP)',
    );

    const contentHash = crypto
      .createHash('sha256')
      .update(content)
      .digest('hex');
    const duplicate = getDuplicateEvolutionEntry(abilityName, contentHash, 24);
    if (duplicate) {
      logger.info(
        { duplicateId: duplicate.id, abilityName },
        'Duplicate experience submission detected',
      );
      return duplicate.id;
    }

    const signals = this.deps.extractSignals({ content });
    const category = this.deps.getCategory(signals);
    const embedding = await generateEmbedding(content);
    const assetId = generateAssetId(content);

    const duplicateCheck = await this.deps.checkDuplicateSignal(
      content,
      sourceAgentId,
    );
    if (duplicateCheck.isDuplicate) {
      logger.warn(
        {
          abilityName,
          similarity: duplicateCheck.similarity,
          reason: duplicateCheck.reason,
        },
        'Signal duplicate detected, rejecting submission',
      );
      throw new Error(`Duplicate signal detected: ${duplicateCheck.reason}`);
    }

    const autoReview = await this.deps.autoReviewEntry({
      abilityName,
      content,
      description: description || '',
      tags: tags || [],
    });

    let status: 'pending' | 'approved' = 'pending';
    if (
      autoReview.confidence > this.config.autoApproveThreshold &&
      !this.config.requireUserReview
    ) {
      status = 'approved';
      logger.info(
        { abilityName, confidence: autoReview.confidence },
        'Experience auto-approved (GEP)',
      );
    }

    const id = createEvolutionEntry({
      abilityName,
      description,
      sourceAgentId,
      content,
      contentEmbedding: embedding,
      tags: tags || [],
      status,
      category,
      signalsMatch: signals.map((s) => s.type),
    });

    const db = getDatabase();
    db.prepare(
      `
      UPDATE evolution_log
      SET schema_version = ?, asset_id = ?, summary = ?,
          preconditions = ?, validation_commands = ?, ecosystem_status = ?
      WHERE id = ?
    `,
    ).run(
      GEP_SCHEMA_VERSION,
      assetId,
      description || abilityName,
      JSON.stringify([]),
      JSON.stringify([]),
      'stale',
      id,
    );

    logAudit({
      agentFolder: sourceAgentId,
      action: 'create',
      entityType: 'gene',
      entityId: String(id),
      details: {
        abilityName,
        status,
        category,
        signalCount: signals.length,
        assetId,
      },
    });

    if (status === 'pending') {
      logger.info(
        { id, abilityName },
        'Experience submitted, triggering immediate review (GEP)',
      );
      const fullEntry = getEvolutionEntry(id);
      if (fullEntry) {
        await this.deps.autoReviewPendingEntry(fullEntry);
      }
    } else {
      logger.info(
        { id, abilityName },
        'Experience auto-approved and added to evolution library (GEP)',
      );
    }

    return id;
  }

  async submitGene(
    input: Omit<CreateGeneInput, 'contentEmbedding'> & {
      summary?: string;
      preconditions?: string[];
      validationCommands?: string[];
      chainId?: string;
    },
  ): Promise<number> {
    logger.info(
      {
        abilityName: input.abilityName,
        category: input.category,
        sourceAgentId: input.sourceAgentId,
      },
      'Submitting Gene to evolution (GEP)',
    );

    const contentHash = crypto
      .createHash('sha256')
      .update(input.content)
      .digest('hex');
    const duplicate = getDuplicateEvolutionEntry(
      input.abilityName,
      contentHash,
      24,
    );
    if (duplicate) {
      logger.info(
        { duplicateId: duplicate.id, abilityName: input.abilityName },
        'Duplicate Gene submission detected',
      );
      return duplicate.id;
    }

    if (input.validationCommands) {
      this.deps.assertCommandsSafe(input.validationCommands);
    }

    const embedding = await generateEmbedding(input.content);
    const assetId = generateAssetId(input.content);

    const duplicateCheck = await this.deps.checkDuplicateSignal(
      input.content,
      input.sourceAgentId,
    );
    if (duplicateCheck.isDuplicate) {
      throw new Error(`Duplicate signal detected: ${duplicateCheck.reason}`);
    }

    const autoReview = await this.deps.autoReviewEntry({
      abilityName: input.abilityName,
      content: input.content,
      description: input.description || '',
      tags: input.tags || [],
    });

    let status: 'pending' | 'approved' = 'pending';
    if (
      autoReview.confidence > this.config.autoApproveThreshold &&
      !this.config.requireUserReview
    ) {
      status = 'approved';
    }

    const id = createEvolutionEntry({
      ...input,
      contentEmbedding: embedding,
      status,
    });

    const db = getDatabase();
    db.prepare(
      `
      UPDATE evolution_log
      SET schema_version = ?, asset_id = ?, summary = ?,
          preconditions = ?, validation_commands = ?, chain_id = ?, ecosystem_status = ?
      WHERE id = ?
    `,
    ).run(
      GEP_SCHEMA_VERSION,
      assetId,
      input.summary || input.abilityName,
      JSON.stringify(input.preconditions || []),
      JSON.stringify(input.validationCommands || []),
      input.chainId || null,
      'stale',
      id,
    );

    logAudit({
      agentFolder: input.sourceAgentId,
      action: 'create',
      entityType: 'gene',
      entityId: String(id),
      details: {
        abilityName: input.abilityName,
        status,
        category: input.category,
        signalCount: input.signalsMatch?.length || 0,
        assetId,
      },
    });

    if (input.chainId) {
      addGeneToChain(input.chainId, assetId);
    }

    if (status === 'pending') {
      logger.info(
        { id, abilityName: input.abilityName },
        'Gene submitted, triggering immediate review (GEP)',
      );
      const fullEntry = getEvolutionEntry(id);
      if (fullEntry) {
        await this.deps.autoReviewPendingEntry(fullEntry);
      }
    } else {
      logger.info(
        { id, abilityName: input.abilityName },
        'Gene auto-approved and added to evolution library (GEP)',
      );
    }

    return id;
  }

  async submitMainExperience(input: MainExperienceInput): Promise<number> {
    const componentTags = input.component
      ? [`component:${input.component}`]
      : [];
    const tags = Array.from(new Set([...(input.tags || []), ...componentTags]));
    const signals = this.deps.extractSignals({ content: input.content });
    const category = input.category || this.deps.getCategory(signals);
    return this.submitGene({
      abilityName: input.abilityName,
      description: input.description,
      sourceAgentId: 'main-process',
      content: input.content,
      tags,
      category,
      signalsMatch: signals.map((signal) => signal.type),
      summary: input.description || input.abilityName,
    });
  }
}
