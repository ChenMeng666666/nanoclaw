import { getDb } from './shared.js';

export function createValidationReport(report: {
  geneId: number;
  commands: string[];
  success: boolean;
  environment: { platform: string; arch: string; nodeVersion: string };
  testResults?: Record<string, unknown>;
  error?: string;
}): number {
  const result = getDb()
    .prepare(
      `
    INSERT INTO validation_reports (
      gene_id, timestamp, commands, success, environment, test_results, error
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
    )
    .run(
      report.geneId,
      new Date().toISOString(),
      JSON.stringify(report.commands),
      report.success ? 1 : 0,
      JSON.stringify(report.environment),
      report.testResults ? JSON.stringify(report.testResults) : null,
      report.error || null,
    );

  return result.lastInsertRowid as number;
}
