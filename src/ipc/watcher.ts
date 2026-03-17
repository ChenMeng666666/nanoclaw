import fs from 'fs';
import path from 'path';

import { DATA_DIR, IPC_POLL_INTERVAL } from '../config.js';
import { logger } from '../logger.js';
import { safeJsonParse } from '../security.js';
import { canSendMessage } from './auth.js';
import { processTaskIpc } from './task-router.js';
import type { IpcDeps, TaskIpcPayload } from './types.js';

let ipcWatcherRunning = false;

export function startIpcWatcher(deps: IpcDeps): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((folder) => {
        const stat = fs.statSync(path.join(ipcBaseDir, folder));
        return stat.isDirectory() && folder !== 'errors';
      });
    } catch (err) {
      logger.error({ err }, 'Error reading IPC base directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    const registeredGroups = deps.registeredGroups();
    const folderIsMain = new Map<string, boolean>();
    for (const group of Object.values(registeredGroups)) {
      if (group.isMain) {
        folderIsMain.set(group.folder, true);
      }
    }

    for (const sourceGroup of groupFolders) {
      const isMain = folderIsMain.get(sourceGroup) === true;
      const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');
      await processMessageFiles(
        messagesDir,
        ipcBaseDir,
        sourceGroup,
        isMain,
        deps,
        registeredGroups,
      );
      await processTaskFiles(tasksDir, ipcBaseDir, sourceGroup, isMain, deps);
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles();
  logger.info('IPC watcher started (per-group namespaces)');
}

async function processMessageFiles(
  messagesDir: string,
  ipcBaseDir: string,
  sourceGroup: string,
  isMain: boolean,
  deps: IpcDeps,
  registeredGroups: ReturnType<IpcDeps['registeredGroups']>,
): Promise<void> {
  try {
    if (!fs.existsSync(messagesDir)) {
      return;
    }
    const messageFiles = fs
      .readdirSync(messagesDir)
      .filter((file) => file.endsWith('.json'));
    for (const file of messageFiles) {
      const filePath = path.join(messagesDir, file);
      try {
        const data = safeJsonParse(fs.readFileSync(filePath, 'utf-8')) as {
          type?: string;
          chatJid?: string;
          text?: string;
        };
        if (data.type === 'message' && data.chatJid && data.text) {
          if (
            canSendMessage(registeredGroups, sourceGroup, isMain, data.chatJid)
          ) {
            await deps.sendMessage(data.chatJid, data.text);
            logger.info(
              { chatJid: data.chatJid, sourceGroup },
              'IPC message sent',
            );
          } else {
            logger.warn(
              { chatJid: data.chatJid, sourceGroup },
              'Unauthorized IPC message attempt blocked',
            );
          }
        }
        fs.unlinkSync(filePath);
      } catch (err) {
        logger.error(
          { file, sourceGroup, err },
          'Error processing IPC message',
        );
        moveToErrorDir(ipcBaseDir, sourceGroup, file, filePath);
      }
    }
  } catch (err) {
    logger.error({ err, sourceGroup }, 'Error reading IPC messages directory');
  }
}

async function processTaskFiles(
  tasksDir: string,
  ipcBaseDir: string,
  sourceGroup: string,
  isMain: boolean,
  deps: IpcDeps,
): Promise<void> {
  try {
    if (!fs.existsSync(tasksDir)) {
      return;
    }
    const taskFiles = fs
      .readdirSync(tasksDir)
      .filter((file) => file.endsWith('.json'));
    for (const file of taskFiles) {
      const filePath = path.join(tasksDir, file);
      try {
        const data = safeJsonParse(
          fs.readFileSync(filePath, 'utf-8'),
        ) as TaskIpcPayload;
        await processTaskIpc(data, sourceGroup, isMain, deps);
        fs.unlinkSync(filePath);
      } catch (err) {
        logger.error({ file, sourceGroup, err }, 'Error processing IPC task');
        moveToErrorDir(ipcBaseDir, sourceGroup, file, filePath);
      }
    }
  } catch (err) {
    logger.error({ err, sourceGroup }, 'Error reading IPC tasks directory');
  }
}

function moveToErrorDir(
  ipcBaseDir: string,
  sourceGroup: string,
  file: string,
  filePath: string,
): void {
  const errorDir = path.join(ipcBaseDir, 'errors');
  fs.mkdirSync(errorDir, { recursive: true });
  fs.renameSync(filePath, path.join(errorDir, `${sourceGroup}-${file}`));
}
