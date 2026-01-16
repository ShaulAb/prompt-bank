import { Buffer } from 'buffer';
import { Prompt } from '../models/prompt';
import { AuthService } from './authService';
import { getSupabaseConfig } from '../config/supabase';

/**
 * Get Supabase configuration from centralized config module.
 * Uses lazy initialization to ensure VS Code workspace is available.
 */
function getConfig() {
  const config = getSupabaseConfig();
  return {
    supabaseUrl: config.url,
    supabaseKey: config.publishableKey,
    publicShareBase: config.publicShareBase,
    createUrl: `${config.url}/functions/v1/create-share`,
    getUrlBase: `${config.url}/functions/v1/get-share`,
  };
}

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

    if (
      parts.length === 4 &&
      parts[0] === 'functions' &&
      parts[1] === 'v1' &&
      parts[2] === 'get-share'
    ) {
      return { id: parts[3] };
    }
  } catch {
    /* invalid URL */
  }
  return null;
}

export async function fetchShare(id: string): Promise<Prompt | Prompt[]> {
  const config = getConfig();
  const res = await fetch(`${config.getUrlBase}/${id}`, {
    headers: {
      apikey: config.supabaseKey,
    },
  });

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
  const parsed = JSON.parse(json);

  // Check if it's a collection (has prompts property) or single prompt
  if (parsed.prompts && Array.isArray(parsed.prompts)) {
    return parsed.prompts as Prompt[];
  } else {
    return parsed as Prompt;
  }
}

export async function createShare(
  prompt: Prompt,
  accessToken: string,
  authService: AuthService
): Promise<ShareResult> {
  const config = getConfig();

  // Encode the full prompt object as base64 (UTF-8)
  const payload = Buffer.from(JSON.stringify(prompt), 'utf8').toString('base64');

  // Use the proper JWT token from Google OAuth
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: config.supabaseKey,
    Authorization: `Bearer ${accessToken}`,
  };

  const res = await fetch(config.createUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ payload }),
  });

  if (!res.ok) {
    const text = await res.text();

    // Check for invalid JWT error (e.g., after key migration)
    if (res.status === 401 && text.toLowerCase().includes('invalid jwt')) {
      console.warn('[ShareService] Detected invalid JWT error. Clearing tokens...');
      await authService.clearInvalidTokens();
      throw new Error(
        'Your session has expired. Please try sharing again to sign in with a new session.'
      );
    }

    throw new Error(`Failed to create share: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { id?: string; expiresAt?: string };
  const { id, expiresAt } = data;
  if (!id || !expiresAt) {
    throw new Error('create-share response missing id or expiresAt');
  }

  return { url: `${config.publicShareBase}${id}`, expiresAt: new Date(expiresAt) };
}

export async function createShareMulti(
  prompts: Prompt[],
  accessToken: string,
  authService: AuthService
): Promise<ShareResult> {
  const config = getConfig();

  // Encode the array of prompts as base64 (UTF-8)
  const payload = Buffer.from(JSON.stringify({ prompts }), 'utf8').toString('base64');

  // Use the proper JWT token from Google OAuth
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: config.supabaseKey,
    Authorization: `Bearer ${accessToken}`,
  };

  const res = await fetch(config.createUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ payload }),
  });

  if (!res.ok) {
    const text = await res.text();

    // Check for invalid JWT error (e.g., after key migration)
    if (res.status === 401 && text.toLowerCase().includes('invalid jwt')) {
      console.warn('[ShareService] Detected invalid JWT error. Clearing tokens...');
      await authService.clearInvalidTokens();
      throw new Error(
        'Your session has expired. Please try sharing again to sign in with a new session.'
      );
    }

    throw new Error(`Failed to create share: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { id?: string; expiresAt?: string };
  const { id, expiresAt } = data;
  if (!id || !expiresAt) {
    throw new Error('create-share response missing id or expiresAt');
  }

  return { url: `${config.publicShareBase}${id}`, expiresAt: new Date(expiresAt) };
}
