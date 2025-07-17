import { beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

let mockWorkspacePath: string;

// Mock 'vscode' at the top level to ensure it's mocked before any imports
vi.mock('vscode', () => {
  // Dynamically generate a mock workspace path for each test file
  mockWorkspacePath = path.join(os.tmpdir(), `prompt-bank-test-${Date.now()}`);
  return {
    workspace: {
      workspaceFolders: [
        {
          uri: {
            fsPath: mockWorkspacePath,
          },
        },
      ],
      getConfiguration: vi.fn().mockReturnValue({
        get: vi.fn((key) => {
          if (key === 'prompt-bank.storagePath') {
            return undefined; // Simulate default behavior
          }
          return undefined;
        }),
      }),
    },
  };
});

beforeEach(async () => {
  // Delete folder if it exists from previous run
  await fs.rm(mockWorkspacePath, { recursive: true, force: true }).catch(() => {});
});

afterEach(async () => {
  // Cleanup temp folder
  await fs.rm(mockWorkspacePath, { recursive: true, force: true }).catch(() => {});
  vi.resetModules(); // Reset mocked modules between tests
});

export { mockWorkspacePath };
