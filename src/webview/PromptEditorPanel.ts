import * as vscode from 'vscode';
import { PromptService } from '../services/promptService';
import { PromptTreeProvider } from '../views/promptTreeProvider';
import { Prompt, createPrompt } from '../models/prompt';
import { WebViewCache } from './WebViewCache';

export class PromptEditorPanel {
  public static currentPanel: PromptEditorPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly promptData: Prompt | undefined;
  private readonly initialContent: string | undefined;
  private readonly promptService: PromptService;
  private readonly treeProvider: PromptTreeProvider;
  private disposables: vscode.Disposable[] = [];
  private categories: string[];
  private readonly initialCategory: string | undefined;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    promptData: Prompt | undefined,
    promptService: PromptService,
    treeProvider: PromptTreeProvider,
    categories: string[],
    initialContent?: string,
    initialCategory?: string
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.promptData = promptData;
    this.promptService = promptService;
    this.treeProvider = treeProvider;
    this.categories = categories;
    this.initialContent = initialContent;
    this.initialCategory = initialCategory;

    // Set the webview's HTML content
    this.panel.webview.html = this.getHtmlForWebview();

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.type) {
          case 'save':
            await this.handleSave(message.data);
            break;
          case 'cancel':
            this.panel.dispose();
            break;
          case 'newCategory': {
            // Handle inline category creation from WebView
            if (message.data && typeof message.data === 'string') {
              const newCat = message.data.trim();
              if (newCat && !this.categories.includes(newCat)) {
                this.categories = [...this.categories, newCat];
                // Update cache with new category
                const allCategories = [...this.categories].sort();
                WebViewCache.setCategoriesCache(allCategories);

                this.panel.webview.postMessage({
                  type: 'categories',
                  data: allCategories,
                  selected: newCat,
                });
              }
            }
            break;
          }
        }
      },
      undefined,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  public static async show(
    context: vscode.ExtensionContext,
    promptData: Prompt | undefined,
    promptService: PromptService,
    treeProvider: PromptTreeProvider
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    // Try to use cached categories first, otherwise load from service
    let categories = WebViewCache.getCachedCategories();
    if (!categories) {
      const prompts = await promptService.listPrompts();
      categories = Array.from(new Set(prompts.map((p) => p.category))).sort();
      // Ensure we always have at least one category
      if (categories.length === 0) {
        categories = ['General'];
      }
      WebViewCache.setCategoriesCache(categories);
    }
    const panel = vscode.window.createWebviewPanel(
      'promptEditor',
      promptData ? 'Edit Prompt' : 'New Prompt',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      }
    );
    PromptEditorPanel.currentPanel = new PromptEditorPanel(
      panel,
      context.extensionUri,
      promptData,
      promptService,
      treeProvider,
      categories
    );
  }

  public static async showForNewPrompt(
    context: vscode.ExtensionContext,
    initialContent: string,
    promptService: PromptService,
    treeProvider: PromptTreeProvider,
    initialCategory?: string
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;
    // Try to use cached categories first, otherwise load from service
    let categories = WebViewCache.getCachedCategories();
    if (!categories) {
      const prompts = await promptService.listPrompts();
      categories = Array.from(new Set(prompts.map((p) => p.category))).sort();
      // Ensure we always have at least one category
      if (categories.length === 0) {
        categories = ['General'];
      }
      WebViewCache.setCategoriesCache(categories);
    }
    const panel = vscode.window.createWebviewPanel(
      'promptEditor',
      'New Prompt',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      }
    );
    PromptEditorPanel.currentPanel = new PromptEditorPanel(
      panel,
      context.extensionUri,
      undefined, // No existing prompt data
      promptService,
      treeProvider,
      categories,
      initialContent,
      initialCategory
    );
  }

  private getHtmlForWebview(): string {
    // Use cached HTML to avoid file I/O
    let html = WebViewCache.getHtml(this.extensionUri);

    // If we have initial content but no promptData, create a temporary prompt object for the UI
    let promptJson = 'null';
    if (this.promptData) {
      promptJson = JSON.stringify(this.promptData);
    } else if (this.initialContent || this.initialCategory) {
      // Create a temporary prompt object with the initial content/category
      const tempPrompt = {
        content: this.initialContent || '',
        title: '',
        description: '',
        category: this.initialCategory || 'General',
      };
      promptJson = JSON.stringify(tempPrompt);
    }

    html = html.replace('/*__PROMPT_DATA_INJECTION__*/ null', promptJson);
    html = html.replace('/*__PROMPT_CATEGORIES__*/ null', JSON.stringify(this.categories));
    return html;
  }

  private async handleSave(data: {
    title: string;
    description: string;
    content: string;
    category: string;
  }) {
    try {
      const trimmedDescription = data.description.trim();

      if (this.promptData) {
        // Edit existing prompt
        const updatedPrompt: Prompt = {
          ...this.promptData,
          title: data.title.trim(),
          content: data.content,
          category: data.category.trim(),
          metadata: {
            ...this.promptData.metadata,
            modified: new Date(),
          },
          ...(trimmedDescription !== '' ? { description: trimmedDescription } : {}),
        };
        await this.promptService.editPromptById(updatedPrompt);
        this.treeProvider.refresh();
        vscode.window.showInformationMessage(`Updated prompt: "${updatedPrompt.title}"`);
      } else {
        // Create new prompt
        const newPrompt = createPrompt(
          data.title.trim(),
          data.content,
          data.category.trim(),
          trimmedDescription || undefined
        );

        // Save the new prompt
        await this.promptService.savePromptDirectly(newPrompt);
        this.treeProvider.refresh();
        vscode.window.showInformationMessage(`Saved prompt: "${newPrompt.title}"`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save prompt: ${error}`);
    } finally {
      this.panel.dispose();
    }
  }

  public dispose() {
    PromptEditorPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const d = this.disposables.pop();
      if (d) d.dispose();
    }
  }
}
