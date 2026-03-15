import {
  CONTAINER_ALLOW_HOST_GATEWAY,
  CONTAINER_IMAGE,
  CONTAINER_NETWORK_MODE,
  TIMEZONE,
} from '../../config.js';
import { readonlyMountArgs } from '../../container-runtime.js';
import type { VolumeMount } from '../../domain/container/mount-policy.js';
import type { RegisteredGroup } from '../../types.js';

/**
 * Build the command line arguments for the container runtime.
 */
export function buildContainerArgs(
  mounts: VolumeMount[],
  containerName: string,
  group: RegisteredGroup,
): string[] {
  const args: string[] = ['run', '-i', '--rm', '--name', containerName];

  const networkMode =
    group.containerConfig?.networkMode || CONTAINER_NETWORK_MODE;
  args.push('--network', networkMode);

  const shouldAddHostGateway =
    networkMode !== 'none' &&
    process.platform === 'linux' &&
    (group.containerConfig?.allowHostGateway ?? CONTAINER_ALLOW_HOST_GATEWAY);
  if (shouldAddHostGateway) {
    args.push('--add-host=host.docker.internal:host-gateway');
  }

  // Pass host timezone so container's local time matches the user's
  args.push('-e', `TZ=${TIMEZONE}`);

  // Run as host user so bind-mounted files are accessible.
  // Skip when running as root (uid 0), as the container's node user (uid 1000),
  // or when getuid is unavailable (native Windows without WSL).
  const hostUid = process.getuid?.();
  const hostGid = process.getgid?.();
  if (hostUid != null && hostUid !== 0 && hostUid !== 1000) {
    args.push('--user', `${hostUid}:${hostGid}`);
    args.push('-e', 'HOME=/home/node');
  }

  for (const mount of mounts) {
    if (mount.readonly) {
      args.push(...readonlyMountArgs(mount.hostPath, mount.containerPath));
    } else {
      args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
    }
  }

  args.push(CONTAINER_IMAGE);

  return args;
}
