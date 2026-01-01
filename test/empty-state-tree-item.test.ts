import { describe, it, expect, beforeEach } from 'vitest';
import { EmptyStateTreeItem } from '../src/views/promptTreeItem';
import * as vscode from 'vscode';

describe('EmptyStateTreeItem', () => {
  let emptyStateItem: EmptyStateTreeItem;

  beforeEach(() => {
    emptyStateItem = new EmptyStateTreeItem();
  });

  describe('Display Properties', () => {
    it('should have action-oriented label text', () => {
      expect(emptyStateItem.label).toBe('Click here to create your first prompt!');
    });

    it('should have helpful tooltip', () => {
      expect(emptyStateItem.tooltip).toBe('Click to create a new prompt');
    });

    it('should use add icon to indicate action', () => {
      const icon = emptyStateItem.iconPath as vscode.ThemeIcon;
      expect(icon.id).toBe('add');
    });

    it('should not be collapsible', () => {
      expect(emptyStateItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
    });

    it('should have empty context value', () => {
      expect(emptyStateItem.contextValue).toBe('empty');
    });
  });

  describe('Click Behavior', () => {
    it('should have command property set', () => {
      expect(emptyStateItem.command).toBeDefined();
    });

    it('should execute promptBank.newPrompt command when clicked', () => {
      expect(emptyStateItem.command?.command).toBe('promptBank.newPrompt');
    });

    it('should have descriptive command title', () => {
      expect(emptyStateItem.command?.title).toBe('Create New Prompt');
    });
  });
});
