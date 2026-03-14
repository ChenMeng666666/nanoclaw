import fs from 'fs';
import path from 'path';
import { logger } from '../../logger.js';
import { RegisteredGroup } from '../../types.js';

export class LearningSystemInitializer {
  public static initialize(
    jid: string,
    group: RegisteredGroup,
    groupDir: string,
  ): void {
    const learningSystemDir = path.join(groupDir, '.learning-system');
    const skillConfigDir = path.join(
      process.cwd(),
      'container/skills/agent-learning/config',
    );
    const skillScriptDir = path.join(
      process.cwd(),
      'container/skills/agent-learning/scripts',
    );

    if (fs.existsSync(skillConfigDir) && !fs.existsSync(learningSystemDir)) {
      try {
        // Create directory structure
        fs.mkdirSync(path.join(learningSystemDir, 'config'), {
          recursive: true,
        });
        fs.mkdirSync(path.join(learningSystemDir, 'scripts'), {
          recursive: true,
        });
        fs.mkdirSync(path.join(learningSystemDir, 'cron'), { recursive: true });
        fs.mkdirSync(path.join(learningSystemDir, 'status'), {
          recursive: true,
        });
        fs.mkdirSync(path.join(learningSystemDir, 'plans'), {
          recursive: true,
        });
        fs.mkdirSync(path.join(learningSystemDir, 'reflections'), {
          recursive: true,
        });

        // Copy config files
        if (fs.existsSync(skillConfigDir)) {
          const configFiles = fs.readdirSync(skillConfigDir);
          configFiles.forEach((file) => {
            const src = path.join(skillConfigDir, file);
            const dest = path.join(learningSystemDir, 'config', file);
            if (fs.statSync(src).isFile()) {
              fs.copyFileSync(src, dest);
            }
          });
        }

        // Copy script files
        if (fs.existsSync(skillScriptDir)) {
          const scriptFiles = fs.readdirSync(skillScriptDir);
          scriptFiles.forEach((file) => {
            const src = path.join(skillScriptDir, file);
            const dest = path.join(learningSystemDir, 'scripts', file);
            if (fs.statSync(src).isFile()) {
              fs.copyFileSync(src, dest);
              fs.chmodSync(dest, '755');
            }
          });

          // Copy init.sh to root
          const initScriptSrc = path.join(skillScriptDir, 'init.sh');
          const initScriptDest = path.join(learningSystemDir, 'init.sh');
          if (fs.existsSync(initScriptSrc)) {
            fs.copyFileSync(initScriptSrc, initScriptDest);
            fs.chmodSync(initScriptDest, '755');
          }
        }

        logger.info(
          { jid, name: group.name, folder: group.folder },
          'Learning system template initialized for new group',
        );
      } catch (err) {
        logger.warn(
          {
            jid,
            name: group.name,
            err: err instanceof Error ? err.message : String(err),
          },
          'Failed to initialize learning system template, will use skill auto-init',
        );
      }
    }
  }
}
