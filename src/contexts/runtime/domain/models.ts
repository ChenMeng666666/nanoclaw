export type {
  ContainerInput,
  ContainerOutput,
  AvailableGroup,
} from '../../../domain/container/container-types.js';
export type { VolumeMount } from '../../../domain/container/mount-policy.js';

export interface RuntimeApiSecurityPolicy {
  allowNoAuth: boolean;
  apiKey?: string;
}
