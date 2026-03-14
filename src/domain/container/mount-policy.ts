/**
 * Container Mount Policy Domain Definitions
 */

export interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
}
