/**
 * 主项目组件标识符
 */
export enum MainComponent {
  CHANNELS = 'channels',
  CONTAINER = 'container',
  ROUTER = 'router',
  DATABASE = 'database',
  QUEUE = 'queue',
}

/**
 * 主项目经验输入
 */
export interface MainExperienceInput {
  abilityName: string;
  content: string;
  description?: string;
  tags?: string[];
  category?: 'repair' | 'optimize' | 'innovate' | 'learn';
  component?: MainComponent;
}

/**
 * 主项目进化配置
 */
export interface MainEvolutionConfig {
  enabled: boolean;
  autoApply: boolean;
  componentWhitelist: MainComponent[];
  signalThreshold: number;
}
