import * as vscode from 'vscode';
import { registerCommands } from './commands';
import { promptService } from './services/promptService';

/**
 * Extension activation function
 * Called when the extension is first activated
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('Prompt Bank extension is activating...');

  try {
    // Initialize the prompt service
    await promptService.initialize();
    
    // Register all commands
    registerCommands(context);
    
    // Show activation message
    vscode.window.showInformationMessage('Prompt Bank is ready! 🚀');
    
    console.log('Prompt Bank extension activated successfully');
  } catch (error) {
    console.error('Failed to activate Prompt Bank extension:', error);
    vscode.window.showErrorMessage(`Failed to initialize Prompt Bank: ${error}`);
  }
}

/**
 * Extension deactivation function
 * Called when the extension is deactivated
 */
export function deactivate() {
  console.log('Prompt Bank extension deactivated');
} 