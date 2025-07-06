# Phase 2 Testing Checklist: Prompt Bank VS Code Extension

## 1. Tree View Display
- ✅ Sidebar shows "Prompt Bank" section in VS Code
- ✅ Categories display with prompt counts (e.g., "General (3)")
- ✅ Prompts show under correct categories
- ✅ Expand/collapse works for categories
- ✅ Icons and tooltips are present for categories and prompts

## 2. Search Functionality
- ✅ Command palette search ("Prompt Bank: Search Prompts") filters prompts in real-time
- ✅ Search works across title, description, content, and category
- ✅ Search results are sorted by usage count, then title
- ✅ Selecting a search result inserts the prompt at the cursor

## 3. Context Menus & Actions
- ✅ Right-click on a prompt shows context menu: Edit, Copy Content, Delete
- ✅ Edit prompt opens input dialogs for title, description, and content (now via webview editor)
- ✅ Delete prompt asks for confirmation and removes it from the tree
- ✅ Copy content copies the prompt to clipboard
- ✅ Right-click on a category shows context menu: Rename
- ✅ Rename category updates all prompts in that category and refreshes the tree
- ✅ No explicit "Delete Category" action (categories disappear when empty)
- ✅ No "Duplicate" or "Move to Category" actions (deferred)

## 4. Category Management
- ✅ Create new categories when saving/editing prompts
- ✅ Rename existing categories via context menu
- ✅ Categories disappear from the tree when all prompts are deleted (implicit delete)
- ✅ Category statistics (prompt count) display in the tree

## 5. Integration Testing
- ✅ Tree updates automatically when prompts are saved, edited, or deleted
- ✅ Clicking a prompt in the tree inserts its content at the cursor
- ✅ All Phase 1 commands (save, insert, list, delete) still work
- [ ] Performance is good with many prompts (test with 50+ prompts)

## 6. Visual & Usability Polish
- ✅ Icons and tooltips are visually consistent
- ✅ No errors in the VS Code developer console during normal use
- ✅ All commands are discoverable via the command palette

---
