import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { SignalType, SignalPattern } from '../../signal-extractor/types.js';

// Get __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface JsonPattern {
  source: string;
  flags: string;
}

interface JsonSignalPattern {
  patterns: JsonPattern[];
  weight: number;
  actionable: boolean;
}

type JsonSignalConfig = Record<string, Record<string, JsonSignalPattern>>;

/**
 * Loader for externalized signal patterns configuration
 */
export class SignalConfigLoader {
  private static instance: SignalConfigLoader;
  private config: Record<SignalType, Record<string, SignalPattern>> | null =
    null;

  private constructor() {}

  public static getInstance(): SignalConfigLoader {
    if (!SignalConfigLoader.instance) {
      SignalConfigLoader.instance = new SignalConfigLoader();
    }
    return SignalConfigLoader.instance;
  }

  /**
   * Load and return signal patterns
   */
  public getPatterns(): Record<SignalType, Record<string, SignalPattern>> {
    if (!this.config) {
      this.loadConfig();
    }
    return this.config!;
  }

  private loadConfig() {
    // Try to resolve config path relative to project root
    // In dev: src/infrastructure/config/../../.. -> root
    // In prod: dist/infrastructure/config/../../.. -> root
    const projectRoot = path.resolve(__dirname, '../../../');
    const configPath = path.join(projectRoot, 'config', 'signal-patterns.json');

    if (!fs.existsSync(configPath)) {
      throw new Error(
        `Signal patterns config file not found at: ${configPath}`,
      );
    }

    try {
      const rawData = fs.readFileSync(configPath, 'utf-8');
      const jsonConfig = JSON.parse(rawData) as JsonSignalConfig;

      this.config = {} as Record<SignalType, Record<string, SignalPattern>>;

      for (const typeKey in jsonConfig) {
        // Cast to SignalType (assuming JSON is valid)
        const type = typeKey as SignalType;
        this.config[type] = {};

        for (const lang in jsonConfig[typeKey]) {
          const entry = jsonConfig[typeKey][lang];
          this.config[type][lang] = {
            weight: entry.weight,
            actionable: entry.actionable,
            // Reconstruct RegExp objects from source and flags
            patterns: entry.patterns.map((p) => new RegExp(p.source, p.flags)),
          };
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to load signal patterns config: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

/**
 * Helper to get patterns directly
 */
export const loadSignalPatterns = (): Record<
  SignalType,
  Record<string, SignalPattern>
> => {
  return SignalConfigLoader.getInstance().getPatterns();
};
