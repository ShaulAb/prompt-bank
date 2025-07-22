import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PromptService } from '../src/services/promptService';
import { FileStorageProvider } from '../src/storage/fileStorage';
import { createPrompt } from '../src/models/prompt';
import { mockWorkspacePath } from './test-setup';
import { promises as fs } from 'fs';
import * as path from 'path';
import { createShare, fetchShare, parseShareUrl } from '../src/services/shareService';

// Mock the fetch function for testing
global.fetch = vi.fn();

describe('PromptService - Share Individual Prompt', () => {
  let promptService: PromptService;
  let storageProvider: FileStorageProvider;

  beforeEach(async () => {
    // Initialize FileStorageProvider with the mocked workspace path
    storageProvider = new FileStorageProvider({ storagePath: path.join(mockWorkspacePath, '.vscode', 'prompt-bank') });
    promptService = new PromptService(storageProvider);
    await promptService.initialize();
    
    // Reset fetch mock
    vi.mocked(fetch).mockReset();
  });

  afterEach(async () => {
    // Clean up the storage directory after each test
    await fs.rm(path.join(mockWorkspacePath, '.vscode', 'prompt-bank'), { recursive: true, force: true }).catch(() => {});
  });

  it('should create a share link for a single prompt', async () => {
    // Mock successful share creation
    const mockShareResponse = {
      id: 'test-share-id',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockShareResponse,
      text: async () => JSON.stringify(mockShareResponse)
    } as Response);

    const prompt = createPrompt('Test Prompt', 'Test content for sharing', 'General');
    prompt.description = 'A test prompt for sharing';
    await storageProvider.save(prompt);

    const result = await createShare(prompt, 'mock-access-token');
    
    expect(result.url).toContain('test-share-id');
    expect(result.expiresAt).toBeInstanceOf(Date);
    // Only check the fetch options, ignore the URL
    const fetchCall = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(fetchCall).toBeDefined();
    const fetchOptions = fetchCall!;
    expect(fetchOptions).toMatchObject({
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer mock-access-token'
      }
    });
    // Decode the base64 payload and check the prompt title
    expect(typeof fetchOptions.body).toBe('string');
    const bodyObj = JSON.parse(fetchOptions.body as string);
    const decoded = Buffer.from(bodyObj.payload, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    expect(parsed.title).toBe('Test Prompt');
  });

  it('should parse share URLs correctly', () => {
    const prettyUrl = 'https://prestissimo.ai/share/abc123';
    const functionUrl = 'https://xlqtowactrzmslpkzliq.supabase.co/functions/v1/get-share/abc123';
    
    expect(parseShareUrl(prettyUrl)).toEqual({ id: 'abc123' });
    expect(parseShareUrl(functionUrl)).toEqual({ id: 'abc123' });
    expect(parseShareUrl('invalid-url')).toBeNull();
  });

  it('should fetch and parse a shared prompt correctly', async () => {
    const originalPrompt = createPrompt('Shared Prompt', 'Shared content', 'Architecture');
    originalPrompt.description = 'A shared architecture prompt';
    
    // Mock the fetch response for getting a shared prompt
    const mockPayload = Buffer.from(JSON.stringify(originalPrompt), 'utf8').toString('base64');
    const mockResponse = { payload: mockPayload };
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
      text: async () => JSON.stringify(mockResponse)
    } as Response);

    const fetchedPrompt = await fetchShare('test-id');
    
    // fetchShare returns Prompt | Prompt[], but for single prompts it should be Prompt
    expect(Array.isArray(fetchedPrompt)).toBe(false);
    const singlePrompt = fetchedPrompt as any;
    // Compare individual properties to avoid date serialization issues
    expect(singlePrompt.title).toBe(originalPrompt.title);
    expect(singlePrompt.content).toBe(originalPrompt.content);
    expect(singlePrompt.category).toBe(originalPrompt.category);
    expect(singlePrompt.description).toBe(originalPrompt.description);
    expect(singlePrompt.title).toBe('Shared Prompt');
    expect(singlePrompt.category).toBe('Architecture');
    expect(singlePrompt.description).toBe('A shared architecture prompt');
  });

  it('should handle share fetch errors gracefully', async () => {
    // Mock a 404 response
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not found'
    } as Response);

    await expect(fetchShare('non-existent-id')).rejects.toThrow('Share has expired or does not exist');
  });

  it('should handle malformed share responses', async () => {
    // Mock response without payload
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
      text: async () => '{}'
    } as Response);

    await expect(fetchShare('malformed-id')).rejects.toThrow('Share payload missing');
  });

  it('should import a shared prompt correctly', async () => {
    const originalPrompt = createPrompt('Imported Prompt', 'Imported content', 'Architecture');
    originalPrompt.description = 'An imported architecture prompt';
    
    // Mock the fetch response
    const mockPayload = Buffer.from(JSON.stringify(originalPrompt), 'utf8').toString('base64');
    const mockResponse = { payload: mockPayload };
    
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
      text: async () => JSON.stringify(mockResponse)
    } as Response);

    const importedPrompt = await promptService.importPrompt(originalPrompt);
    
    expect(importedPrompt.title).toBe('Imported Prompt');
    expect(importedPrompt.category).toBe('Architecture');
    expect(importedPrompt.description).toBe('An imported architecture prompt');
    expect(importedPrompt.metadata.usageCount).toBe(0); // Reset for imported prompts
    expect(importedPrompt.id).not.toBe(originalPrompt.id); // Should have new ID
  });

  it('should handle duplicate prompt imports with suffix', async () => {
    // Create an existing prompt
    const existingPrompt = createPrompt('Test Prompt', 'Original content', 'General');
    await storageProvider.save(existingPrompt);
    
    // Try to import the same prompt
    const importedPrompt = await promptService.importPrompt(existingPrompt);
    
    expect(importedPrompt.title).toBe('Test Prompt (imported)');
    expect(importedPrompt.content).toBe('Original content');
    expect(importedPrompt.category).toBe('General');
  });
}); 