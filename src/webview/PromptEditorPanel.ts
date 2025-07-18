import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PromptService } from '../services/promptService';
import { PromptTreeProvider } from '../views/promptTreeProvider';
import { Prompt } from '../models/prompt';

export class PromptEditorPanel {
  public static currentPanel: PromptEditorPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private readonly promptData: Prompt | undefined;
  private readonly promptService: PromptService;
  private readonly treeProvider: PromptTreeProvider;
  private disposables: vscode.Disposable[] = [];
  private categories: string[];

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    promptData: Prompt | undefined,
    promptService: PromptService,
    treeProvider: PromptTreeProvider,
    categories: string[]
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.promptData = promptData;
    this.promptService = promptService;
    this.treeProvider = treeProvider;
    this.categories = categories;

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
            const newCat = await vscode.window.showInputBox({
              prompt: 'Enter new category name',
              validateInput: (val) => (val.trim() ? null : 'Name required'),
            });
            if (newCat) {
              this.categories = [...this.categories, newCat.trim()];
              this.panel.webview.postMessage({
                type: 'categories',
                data: this.categories,
                selected: newCat.trim(),
              });
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
    // Load existing categories
    const prompts = await promptService.listPrompts();
    const categories = Array.from(new Set(prompts.map((p) => p.category))).sort();
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

  private getHtmlForWebview(): string {
    const htmlPath = path.join(this.extensionUri.fsPath, 'media', 'promptEditorLit.html');
    let html = fs.readFileSync(htmlPath, 'utf-8');
    const promptJson = this.promptData ? JSON.stringify(this.promptData) : 'null';
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
      if (!this.promptData) {
        vscode.window.showErrorMessage('No prompt data available to save.');
        return;
      }
      const trimmedDescription = data.description.trim();
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
