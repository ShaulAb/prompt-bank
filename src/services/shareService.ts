import { Buffer } from 'buffer';
import { Prompt } from '../models/prompt';

const CREATE_URL = 'https://xlqtowactrzmslpkzliq.supabase.co/functions/v1/create-share';
const PUBLIC_VIEW_BASE = 'https://prestissimo.ai/share/';

export interface ShareResult {
  url: string;
  expiresAt: Date;
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