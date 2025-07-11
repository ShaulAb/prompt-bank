import { Buffer } from 'buffer';
import * as vscode from 'vscode';
import { Prompt } from '../models/prompt';

/**
 * Read backend URLs from Prompt Bank configuration with sensible fallbacks.
 */
const cfg = vscode.workspace.getConfiguration('promptBank');
const SUPABASE_URL = cfg.get<string>('supabaseUrl', 'https://xlqtowactrzmslpkzliq.supabase.co');
const PUBLIC_VIEW_BASE = cfg.get<string>('publicShareBase', 'https://prestissimo.ai/share/');

const CREATE_URL = `${SUPABASE_URL}/functions/v1/create-share`;

export interface ShareResult {
  url: string;
  expiresAt: Date;
}

/**
 * Basic share URL matcher supporting both full Supabase function URLs and pretty domain.
 * Returns the share ID or null if no match.
 */
export function parseShareUrl(raw: string): { id: string } | null {
  try {
    const url = new URL(raw.trim());

    // Path may be /share/<id> or /functions/v1/get-share/<id>
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length === 2 && parts[0] === 'share') {
      return { id: parts[1] };
    }

    if (parts.length === 4 && parts[0] === 'functions' && parts[1] === 'v1' && parts[2] === 'get-share') {
      return { id: parts[3] };
    }
  } catch {
    /* invalid URL */
  }
  return null;
}

export async function fetchShare(id: string): Promise<Prompt> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/get-share/${id}`);

  if (res.status === 404 || res.status === 410) {
    throw new Error('Share has expired or does not exist');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to retrieve share: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { payload?: string };
  if (!data.payload) {
    throw new Error('Share payload missing');
  }

  const json = Buffer.from(data.payload, 'base64').toString('utf8');
  return JSON.parse(json) as Prompt;
}

export async function createShare(prompt: Prompt, accessToken: string): Promise<ShareResult> {
  // Encode the full prompt object as base64 (UTF-8)
  const payload = Buffer.from(JSON.stringify(prompt), 'utf8').toString('base64');

  const res = await fetch(CREATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ payload }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase create-share failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { id?: string; expiresAt?: string };
  const { id, expiresAt } = data;
  if (!id || !expiresAt) {
    throw new Error('create-share response missing id or expiresAt');
  }

  return { url: `${PUBLIC_VIEW_BASE}${id}`, expiresAt: new Date(expiresAt) };
}

export async function createShareMulti(prompts: Prompt[], accessToken: string): Promise<ShareResult> {
  // Encode the array of prompts as base64 (UTF-8)
  const payload = Buffer.from(JSON.stringify({ prompts }), 'utf8').toString('base64');

  const res = await fetch(CREATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ payload }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase create-share failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { id?: string; expiresAt?: string };
  const { id, expiresAt } = data;
  if (!id || !expiresAt) {
    throw new Error('create-share response missing id or expiresAt');
  }

  return { url: `${PUBLIC_VIEW_BASE}${id}`, expiresAt: new Date(expiresAt) };
} 