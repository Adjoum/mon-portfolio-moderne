// ═══════════════════════════════════════════════════════════
//  types/tools.ts — Shared types for the Tools & Workspace
// ═══════════════════════════════════════════════════════════

// ── Workspace / Folder ───────────────────────────────────────
export type FolderColor =
  | 'cyan' | 'violet' | 'pink' | 'emerald' | 'amber' | 'red' | 'blue' | 'orange';

export interface WorkspaceFolder {
  id: string;
  name: string;
  color: FolderColor;
  icon: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  pinnedTools: ToolId[];
  notes?: string;
  tags: string[];
}

export type ToolId =
  | 'novamind'
  | 'pomodoro'
  | 'snippets'
  | 'markdown'
  | 'color-picker'
  | 'json-viewer'
  | 'regex-tester'
  | 'diff-viewer'
  | 'base64'
  | 'lorem-ipsum';

export interface ToolMeta {
  id: ToolId;
  name: string;
  description: string;
  icon: string;
  category: ToolCategory;
  badge?: string;
  color: string;
  path: string;
}

export type ToolCategory =
  | 'Créativité'
  | 'Productivité'
  | 'Développement'
  | 'Utilitaires';

// ── Pomodoro ─────────────────────────────────────────────────
export type PomodoroPhase = 'work' | 'short-break' | 'long-break';

export interface PomodoroSession {
  id: string;
  label: string;
  date: string;
  duration: number; // minutes
  phase: PomodoroPhase;
  folderId?: string;
}

export interface PomodoroSettings {
  workDuration: number;       // minutes
  shortBreakDuration: number;
  longBreakDuration: number;
  sessionsBeforeLong: number;
  autoStart: boolean;
  soundEnabled: boolean;
  notificationsEnabled: boolean;
}

// ── Code Snippets ─────────────────────────────────────────────
export type SnippetLanguage =
  | 'javascript' | 'typescript' | 'python' | 'react'
  | 'html' | 'css' | 'sql' | 'bash' | 'c' | 'dart'
  | 'json' | 'php' | 'other';

export interface CodeSnippet {
  id: string;
  title: string;
  description?: string;
  code: string;
  language: SnippetLanguage;
  tags: string[];
  folderId?: string;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  usageCount: number;
}

// ── Markdown Notes ────────────────────────────────────────────
export interface MarkdownNote {
  id: string;
  title: string;
  content: string;
  folderId?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
}

// ── Mind Map (NovaMind) ───────────────────────────────────────
export interface MindMapNode {
  id: string;
  x: number;
  y: number;
  label: string;
  color: string;
  width: number;
  height: number;
  icon: string;
  notes?: string;
  tags: string[];
  priority: 'low' | 'normal' | 'high' | 'critical';
  collapsed: boolean;
  isRoot?: boolean;
}

export interface MindMapEdge {
  id: string;
  from: string;
  to: string;
  style?: 'curve' | 'straight';
  animated?: boolean;
}

export interface MindMapProject {
  id: string;
  title: string;
  nodes: Record<string, MindMapNode>;
  edges: MindMapEdge[];
  diagramMode: string;
  folderId?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Utility types ─────────────────────────────────────────────
export type SortOrder = 'asc' | 'desc';
export type ViewMode = 'grid' | 'list';
