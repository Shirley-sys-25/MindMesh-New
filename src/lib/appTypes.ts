import type { LucideIcon } from 'lucide-react';

export interface Agent {
  id: string;
  name: string;
  role: string;
  icon: LucideIcon;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  tone?: 'error';
}

export interface SessionLog {
  id: string;
  timestamp: string;
  message: string;
  tone: 'info' | 'success' | 'warn';
}

export interface BackendSnapshot {
  health: 'ok' | 'down' | 'unknown';
  ready: 'ready' | 'degraded' | 'down' | 'unknown';
  mode: string;
  databaseStatus: string;
  reason: string;
  updatedAt: number | null;
}

export interface WorkspaceNotice {
  tone: 'info' | 'success' | 'warn';
  text: string;
}

export interface MetricsSnapshot {
  httpRequestsTotal: number | null;
  orchestratorCallsTotal: number | null;
  providerErrorsTotal: number | null;
  authFailuresTotal: number | null;
  error: string | null;
  updatedAt: number | null;
  status: 'ready' | 'unknown';
}

export interface AttachmentPreview {
  id: string;
  name: string;
  type: string;
  size: number;
  preview: string;
}
