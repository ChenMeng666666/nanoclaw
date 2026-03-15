import { execSync } from 'child_process';
import net from 'net';
import { logger } from '../../logger.js';
import { RUNTIME_API_CONFIG } from '../../config.js';

// 检查端口是否可用
async function checkPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          resolve(false);
        } else {
          resolve(false);
        }
      })
      .once('listening', () => {
        tester.close(() => resolve(true));
      })
      .listen(port);
  });
}

// 检查系统依赖
export async function checkSystemDependencies(): Promise<void> {
  logger.info('Checking system dependencies...');

  // 检查 Docker
  try {
    execSync('docker --version');
    logger.info('Docker available');
  } catch {
    logger.error('Docker not available');
    process.exit(1);
  }

  const candidatePorts = [
    RUNTIME_API_CONFIG.port,
    ...RUNTIME_API_CONFIG.fallbackPorts,
  ];
  const availability = await Promise.all(
    candidatePorts.map(checkPortAvailable),
  );
  if (!availability.some(Boolean)) {
    logger.error(
      { candidatePorts },
      'All runtime API ports are already in use',
    );
    process.exit(1);
  }
}
