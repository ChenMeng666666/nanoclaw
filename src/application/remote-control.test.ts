import {
  startRemoteControl,
  stopRemoteControl,
  restoreRemoteControl,
  getActiveSession,
  _resetForTesting,
  _getStateFilePath,
} from './remote-control.js';
import { spawn } from 'child_process';
import fs from 'fs';
import {
  vi,
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

describe('Remote Control', () => {
  const spawnMock = vi.mocked(spawn);
  const STATE_FILE = _getStateFilePath();
  let stdoutFileContent = '';

  let readFileSyncSpy: MockInstance;
  let writeFileSyncSpy: MockInstance;
  let unlinkSyncSpy: MockInstance;
  let openSyncSpy: MockInstance;
  let closeSyncSpy: MockInstance;
  let mkdirSyncSpy: MockInstance;
  let killSpy: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetForTesting();
    stdoutFileContent = '';

    // Setup spies
    readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockImplementation(((
      path: string,
    ) => {
      if (typeof path === 'string' && path.endsWith('.stdout'))
        return stdoutFileContent;
      throw new Error('ENOENT');
    }) as any);

    writeFileSyncSpy = vi
      .spyOn(fs, 'writeFileSync')
      .mockImplementation(() => {});
    unlinkSyncSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    openSyncSpy = vi.spyOn(fs, 'openSync').mockReturnValue(123);
    closeSyncSpy = vi.spyOn(fs, 'closeSync').mockImplementation(() => {});
    mkdirSyncSpy = vi
      .spyOn(fs, 'mkdirSync')
      .mockImplementation(() => undefined as any);
    killSpy = vi.spyOn(process, 'kill').mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createMockProcess(pid: number = 12345) {
    return {
      pid,
      unref: vi.fn(),
      kill: vi.fn(),
    };
  }

  describe('startRemoteControl', () => {
    it('starts claude remote-control and captures URL', async () => {
      const proc = createMockProcess();
      spawnMock.mockReturnValue(proc as any);
      stdoutFileContent = 'https://claude.ai/code?bridge=env_test\n';

      const result = await startRemoteControl('user1', 'tg:123', '/project');

      expect(result).toEqual({
        ok: true,
        url: 'https://claude.ai/code?bridge=env_test',
      });

      expect(spawnMock).toHaveBeenCalledWith(
        'claude',
        ['remote-control', '--name', 'NanoClaw Remote'],
        expect.objectContaining({
          cwd: '/project',
          detached: true,
        }),
      );

      const active = getActiveSession();
      expect(active).toEqual({
        pid: 12345,
        url: 'https://claude.ai/code?bridge=env_test',
        startedBy: 'user1',
        startedInChat: 'tg:123',
        startedAt: expect.any(String),
      });
    });

    it('ignores stdio in child process', async () => {
      const proc = createMockProcess();
      spawnMock.mockReturnValue(proc as any);
      stdoutFileContent = 'https://claude.ai/code?bridge=env_test\n';

      await startRemoteControl('user1', 'tg:123', '/project');

      const spawnCall = spawnMock.mock.calls[0];
      const options = spawnCall[2] as any;
      expect(options.stdio[0]).toBe('ignore');
      expect(typeof options.stdio[1]).toBe('number');
      expect(typeof options.stdio[2]).toBe('number');
    });

    it('closes file descriptors in parent after spawn', async () => {
      const proc = createMockProcess();
      spawnMock.mockReturnValue(proc as any);
      stdoutFileContent = 'https://claude.ai/code?bridge=env_test\n';

      await startRemoteControl('user1', 'tg:123', '/project');

      expect(openSyncSpy).toHaveBeenCalledTimes(2);
      expect(closeSyncSpy).toHaveBeenCalledTimes(2);
    });

    it('saves state to disk after capturing URL', async () => {
      const proc = createMockProcess(99999);
      spawnMock.mockReturnValue(proc as any);
      stdoutFileContent = 'https://claude.ai/code?bridge=env_save\n';

      await startRemoteControl('user1', 'tg:123', '/project');

      expect(writeFileSyncSpy).toHaveBeenCalledWith(
        STATE_FILE,
        expect.stringContaining('"pid":99999'),
      );
    });

    it('returns existing URL if session is already active', async () => {
      const proc = createMockProcess();
      spawnMock.mockReturnValue(proc as any);
      stdoutFileContent = 'https://claude.ai/code?bridge=env_existing\n';

      await startRemoteControl('user1', 'tg:123', '/project');

      const result = await startRemoteControl('user2', 'tg:456', '/project');
      expect(result).toEqual({
        ok: true,
        url: 'https://claude.ai/code?bridge=env_existing',
      });
      expect(spawnMock).toHaveBeenCalledTimes(1);
    });

    it('starts new session if existing process is dead', async () => {
      const proc1 = createMockProcess(11111);
      const proc2 = createMockProcess(22222);
      spawnMock
        .mockReturnValueOnce(proc1 as any)
        .mockReturnValueOnce(proc2 as any);

      stdoutFileContent = 'https://claude.ai/code?bridge=env_first\n';
      await startRemoteControl('user1', 'tg:123', '/project');

      // Kill old process logic
      killSpy.mockImplementation(((pid: number, sig: any) => {
        if (pid === 11111 && (sig === 0 || sig === undefined)) {
          throw new Error('ESRCH');
        }
        return true;
      }) as any);

      stdoutFileContent = 'https://claude.ai/code?bridge=env_second\n';
      const result = await startRemoteControl('user1', 'tg:123', '/project');

      expect(result).toEqual({
        ok: true,
        url: 'https://claude.ai/code?bridge=env_second',
      });
      expect(spawnMock).toHaveBeenCalledTimes(2);
    });

    it('returns error if process exits before URL', async () => {
      const proc = createMockProcess(33333);
      spawnMock.mockReturnValue(proc as any);
      stdoutFileContent = '';

      killSpy.mockImplementation((() => {
        throw new Error('ESRCH');
      }) as any);

      const result = await startRemoteControl('user1', 'tg:123', '/project');
      expect(result).toEqual({
        ok: false,
        error: 'Process exited before producing URL',
      });
    });

    it('times out if URL never appears', async () => {
      vi.useFakeTimers();
      const proc = createMockProcess(44444);
      spawnMock.mockReturnValue(proc as any);
      stdoutFileContent = 'no url here';

      const promise = startRemoteControl('user1', 'tg:123', '/project');

      for (let i = 0; i < 160; i++) {
        await vi.advanceTimersByTimeAsync(200);
      }

      const result = await promise;
      expect(result).toEqual({
        ok: false,
        error: 'Timed out waiting for Remote Control URL',
      });

      vi.useRealTimers();
    });

    it('returns error if spawn throws', async () => {
      spawnMock.mockImplementation(() => {
        throw new Error('ENOENT');
      });

      const result = await startRemoteControl('user1', 'tg:123', '/project');
      expect(result).toEqual({
        ok: false,
        error: 'Failed to start: ENOENT',
      });
    });
  });

  describe('stopRemoteControl', () => {
    it('kills the process and clears state', async () => {
      const proc = createMockProcess(55555);
      spawnMock.mockReturnValue(proc as any);
      stdoutFileContent = 'https://claude.ai/code?bridge=env_stop\n';

      await startRemoteControl('user1', 'tg:123', '/project');

      const result = stopRemoteControl();
      expect(result).toEqual({ ok: true });
      expect(killSpy).toHaveBeenCalledWith(55555, 'SIGTERM');
      expect(unlinkSyncSpy).toHaveBeenCalledWith(STATE_FILE);
      expect(getActiveSession()).toBeNull();
    });

    it('returns error when no session is active', () => {
      const result = stopRemoteControl();
      expect(result).toEqual({
        ok: false,
        error: 'No active Remote Control session',
      });
    });
  });

  describe('restoreRemoteControl', () => {
    it('restores session if state file exists and process is alive', () => {
      const session = {
        pid: 77777,
        url: 'https://claude.ai/code?bridge=env_restored',
        startedBy: 'user1',
        startedInChat: 'tg:123',
        startedAt: '2026-01-01T00:00:00.000Z',
      };
      readFileSyncSpy.mockImplementation(((p: string) => {
        if (p.endsWith('remote-control.json')) return JSON.stringify(session);
        return '';
      }) as any);

      restoreRemoteControl();

      const active = getActiveSession();
      expect(active).not.toBeNull();
      expect(active!.pid).toBe(77777);
      expect(active!.url).toBe('https://claude.ai/code?bridge=env_restored');
    });

    it('clears state if process is dead', () => {
      const session = {
        pid: 88888,
        url: 'https://claude.ai/code?bridge=env_dead',
        startedBy: 'user1',
        startedInChat: 'tg:123',
        startedAt: '2026-01-01T00:00:00.000Z',
      };
      readFileSyncSpy.mockImplementation(((p: string) => {
        if (p.endsWith('remote-control.json')) return JSON.stringify(session);
        return '';
      }) as any);
      killSpy.mockImplementation((() => {
        throw new Error('ESRCH');
      }) as any);

      restoreRemoteControl();

      expect(getActiveSession()).toBeNull();
      expect(unlinkSyncSpy).toHaveBeenCalled();
    });

    it('does nothing if no state file exists', () => {
      restoreRemoteControl();
      expect(getActiveSession()).toBeNull();
    });

    it('clears state on corrupted JSON', () => {
      readFileSyncSpy.mockImplementation(((p: string) => {
        if (p.endsWith('remote-control.json')) return 'not json{{{';
        return '';
      }) as any);

      restoreRemoteControl();

      expect(getActiveSession()).toBeNull();
      expect(unlinkSyncSpy).toHaveBeenCalled();
    });

    it('stopRemoteControl works after restoreRemoteControl', () => {
      const session = {
        pid: 77777,
        url: 'https://claude.ai/code?bridge=env_restored',
        startedBy: 'user1',
        startedInChat: 'tg:123',
        startedAt: '2026-01-01T00:00:00.000Z',
      };
      readFileSyncSpy.mockImplementation(((p: string) => {
        if (p.endsWith('remote-control.json')) return JSON.stringify(session);
        return '';
      }) as any);

      restoreRemoteControl();
      expect(getActiveSession()).not.toBeNull();

      const result = stopRemoteControl();
      expect(result).toEqual({ ok: true });
      expect(killSpy).toHaveBeenCalledWith(77777, 'SIGTERM');
      expect(unlinkSyncSpy).toHaveBeenCalled();
      expect(getActiveSession()).toBeNull();
    });

    it('startRemoteControl returns restored URL without spawning', () => {
      const session = {
        pid: 77777,
        url: 'https://claude.ai/code?bridge=env_restored',
        startedBy: 'user1',
        startedInChat: 'tg:123',
        startedAt: '2026-01-01T00:00:00.000Z',
      };
      readFileSyncSpy.mockImplementation(((p: string) => {
        if (p.endsWith('remote-control.json')) return JSON.stringify(session);
        return '';
      }) as any);

      restoreRemoteControl();

      return startRemoteControl('user2', 'tg:456', '/project').then(
        (result) => {
          expect(result).toEqual({
            ok: true,
            url: 'https://claude.ai/code?bridge=env_restored',
          });
          expect(spawnMock).not.toHaveBeenCalled();
        },
      );
    });
  });
});
