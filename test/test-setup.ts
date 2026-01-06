import { beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

let mockWorkspacePath: string;

// Generate a new workspace path for each test run
function generateWorkspacePath(): string {
  return path.join(
    os.tmpdir(),
    `prompt-bank-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  );
}

// Mock 'vscode' at the top level to ensure it's mocked before any imports
vi.mock('vscode', () => {
  // Mock TreeItem class
  class MockTreeItem {
    label: string;
    collapsibleState: number;
    tooltip?: string;
    description?: string;
    contextValue?: string;
    iconPath?: any;
    command?: any;

    constructor(label: string, collapsibleState?: number) {
      this.label = label;
      this.collapsibleState = collapsibleState ?? 0;
    }
  }

  return {
    TreeItem: MockTreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    ThemeIcon: class {
      constructor(public id: string) {}
    },
    window: {
      showInputBox: vi.fn(),
      showQuickPick: vi.fn(),
      showInformationMessage: vi.fn(),
      showErrorMessage: vi.fn(),
      showWarningMessage: vi.fn(),
      createWebviewPanel: vi.fn(() => ({
        webview: {
          html: '',
          onDidReceiveMessage: vi.fn(),
          postMessage: vi.fn(),
        },
        dispose: vi.fn(),
        onDidDispose: vi.fn(),
      })),
      activeTextEditor: undefined,
    },
    env: {
      clipboard: {
        readText: vi.fn(),
        writeText: vi.fn(),
      },
      uriScheme: 'vscode',
      openExternal: vi.fn().mockResolvedValue(true),
      appName: 'Code - Test',
      machineId: 'test-machine-id-12345',
    },
    globalState: {
      get: vi.fn((key: string) => undefined),
      update: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn(() => []),
      setKeysForSync: vi.fn(),
    },
    workspaceState: {
      get: vi.fn((key: string) => undefined),
      update: vi.fn().mockResolvedValue(undefined),
      keys: vi.fn(() => []),
    },
    secrets: {
      get: vi.fn((key: string) => Promise.resolve(undefined)),
      store: vi.fn((key: string, value: string) => Promise.resolve()),
      delete: vi.fn((key: string) => Promise.resolve()),
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
    },
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
      getConfiguration: vi.fn((section?: string) => {
        // Handle promptBank configuration for Supabase
        // These values must match SUPABASE_DEFAULTS in src/config/supabase.ts
        if (section === 'promptBank') {
          return {
            get: vi.fn((key: string, defaultValue?: any) => {
              if (key === 'supabaseUrl') {
                return defaultValue || 'https://ejolajleumgrgnmygxmz.supabase.co';
              }
              if (key === 'supabaseAnonKey') {
                return defaultValue || 'sb_publishable_4YWhPqX2HleOm9-vCKVSEA_daIYTGwZ';
              }
              if (key === 'publicShareBase') {
                return defaultValue || 'https://prestissimo.ai/share/';
              }
              return defaultValue;
            }),
          };
        }
        // Default behavior for other configurations
        return {
          get: vi.fn((key: string) => {
            if (key === 'prompt-bank.storagePath') {
              return undefined; // Simulate default behavior
            }
            return undefined;
          }),
        };
      }),
    },
    ViewColumn: {
      One: 1,
    },
    Uri: {
      file: vi.fn((path: string) => ({
        fsPath: path,
        scheme: 'file',
        authority: '',
        path: path,
        query: '',
        fragment: '',
        toString: () => `file://${path}`,
      })),
      joinPath: vi.fn((uri, ...paths) => ({
        fsPath: require('path').join(uri.fsPath, ...paths.join('/')),
      })),
      parse: vi.fn((value: string) => {
        const url = new URL(value);
        return {
          scheme: url.protocol.replace(':', ''),
          authority: url.host,
          path: url.pathname,
          query: url.search.substring(1),
          fragment: url.hash.substring(1),
          fsPath: url.pathname,
          toString: () => value,
        };
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
