import { beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

let mockWorkspacePath: string;

// Generate a new workspace path for each test run
function generateWorkspacePath(): string {
  return path.join(os.tmpdir(), `prompt-bank-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
}

// Mock 'vscode' at the top level to ensure it's mocked before any imports
vi.mock('vscode', () => {
  return {
    workspace: {
      get workspaceFolders() {
        // Use the current workspace path or generate a new one
        if (!mockWorkspacePath) {
          mockWorkspacePath = generateWorkspacePath();
        }
        return [
          {
            uri: {
              fsPath: mockWorkspacePath,
            },
          },
        ];
      },
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
  // Generate a fresh workspace path for each test
  mockWorkspacePath = generateWorkspacePath();
  
  // Clear any module cache to ensure fresh instances
  vi.resetModules();
});

afterEach(async () => {
  // Cleanup temp folder if it exists
  if (mockWorkspacePath) {
    await fs.rm(mockWorkspacePath, { recursive: true, force: true }).catch(() => {});
  }
  
  // Reset all mocked modules between tests
  vi.resetModules();
});

export { mockWorkspacePath };
