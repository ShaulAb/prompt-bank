import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Cache for WebView HTML content to avoid repeated file reads
 */
export class WebViewCache {
  private static htmlCache: string | undefined;
  private static categoriesCache: string[] = [];
  private static cacheTimestamp: number = 0;
  private static readonly CACHE_DURATION = 60000; // 1 minute cache

  /**
   * Get cached HTML content or read from file if not cached
   */
  public static getHtml(extensionUri: vscode.Uri): string {
    if (!this.htmlCache) {
      // Use optimized HTML with better loading performance
      const htmlPath = path.join(extensionUri.fsPath, 'media', 'promptEditorOptimized.html');
      this.htmlCache = fs.readFileSync(htmlPath, 'utf-8');
    }
    return this.htmlCache;
  }

  /**
   * Get cached categories with time-based invalidation
   */
  public static getCachedCategories(): string[] | null {
    const now = Date.now();
    if (now - this.cacheTimestamp > this.CACHE_DURATION) {
      return null; // Cache expired
    }
    return this.categoriesCache.length > 0 ? this.categoriesCache : null;
  }

  /**
   * Update categories cache
   */
  public static setCategoriesCache(categories: string[]): void {
    this.categoriesCache = categories;
    this.cacheTimestamp = Date.now();
  }

  /**
   * Clear all caches (useful when extension is deactivated)
   */
  public static clear(): void {
    this.htmlCache = undefined;
    this.categoriesCache = [];
    this.cacheTimestamp = 0;
  }
}
