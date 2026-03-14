import {
  validateBoolean,
  validateConfig,
  validateInteger,
} from './validators.js';

export const COLLABORATION_CONFIG = {
  interAgentCommunication: {
    enabled: validateConfig(
      (process.env.COLLABORATION_ENABLE_INTER_AGENT_COMMUNICATION || 'true') ===
        'true',
      validateBoolean,
      true,
      'COLLABORATION_ENABLE_INTER_AGENT_COMMUNICATION',
    ),
    messageTimeout: validateConfig(
      parseInt(process.env.COLLABORATION_MESSAGE_TIMEOUT || '30000', 10),
      (v) => validateInteger(v, 1000, 300000),
      30000,
      'COLLABORATION_MESSAGE_TIMEOUT',
    ),
    maxMessageSize: validateConfig(
      parseInt(process.env.COLLABORATION_MAX_MESSAGE_SIZE || '1048576', 10),
      (v) => validateInteger(v, 1024, 10485760),
      1048576,
      'COLLABORATION_MAX_MESSAGE_SIZE',
    ),
  },
  collaborationTasks: {
    enabled: validateConfig(
      (process.env.COLLABORATION_ENABLE_COLLABORATION_TASKS || 'true') ===
        'true',
      validateBoolean,
      true,
      'COLLABORATION_ENABLE_COLLABORATION_TASKS',
    ),
    maxTeamSize: validateConfig(
      parseInt(process.env.COLLABORATION_MAX_TEAM_SIZE || '10', 10),
      (v) => validateInteger(v, 2, 50),
      10,
      'COLLABORATION_MAX_TEAM_SIZE',
    ),
    taskTimeout: validateConfig(
      parseInt(process.env.COLLABORATION_TASK_TIMEOUT || '1800000', 10),
      (v) => validateInteger(v, 60000, 3600000),
      1800000,
      'COLLABORATION_TASK_TIMEOUT',
    ),
  },
  teamCollaboration: {
    enabled: validateConfig(
      (process.env.COLLABORATION_ENABLE_TEAM_COLLABORATION || 'true') ===
        'true',
      validateBoolean,
      true,
      'COLLABORATION_ENABLE_TEAM_COLLABORATION',
    ),
    defaultCollaborationMode: validateConfig(
      process.env.COLLABORATION_DEFAULT_MODE || 'peer-to-peer',
      (v) => ['hierarchical', 'peer-to-peer', 'swarm'].includes(v),
      'peer-to-peer' as any,
      'COLLABORATION_DEFAULT_MODE',
    ),
    trustLevel: validateConfig(
      parseInt(process.env.COLLABORATION_TRUST_LEVEL || '5', 10),
      (v) => validateInteger(v, 1, 10),
      5,
      'COLLABORATION_TRUST_LEVEL',
    ),
  },
};
