/**
 * Vertex AI Utilities
 *
 * Utilities for detecting and working with Google Cloud Vertex AI configuration.
 * When Vertex AI is enabled, authentication uses Google Cloud credentials instead of
 * Claude OAuth tokens.
 */

import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { app } from 'electron';

// Cache the Vertex AI enabled state to avoid repeated file reads
let cachedVertexAIEnabled: boolean | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5000; // Refresh cache every 5 seconds

/**
 * Get the path to the auto-claude backend .env file
 */
function getBackendEnvPath(): string | null {
  // Try to find the auto-claude backend directory
  const possiblePaths = [
    // Development: relative to app root
    path.join(process.cwd(), 'apps', 'backend', '.env'),
    // Production: in resources
    path.join(app.isPackaged ? process.resourcesPath : app.getAppPath(), 'auto-claude', '.env'),
    // Alternative: check CLAUDE_AUTO_BUILD_PATH env var
    process.env.CLAUDE_AUTO_BUILD_PATH ? path.join(process.env.CLAUDE_AUTO_BUILD_PATH, '.env') : null,
  ].filter(Boolean) as string[];

  for (const envPath of possiblePaths) {
    if (existsSync(envPath)) {
      return envPath;
    }
  }

  return null;
}

/**
 * Parse environment variables from a .env file
 */
function parseEnvFile(envPath: string): Record<string, string> {
  try {
    const content = readFileSync(envPath, 'utf-8');
    const vars: Record<string, string> = {};

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex > 0) {
        const key = trimmed.substring(0, eqIndex).trim();
        let value = trimmed.substring(eqIndex + 1).trim();

        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }

        vars[key] = value;
      }
    }

    return vars;
  } catch {
    return {};
  }
}

/**
 * Check if Vertex AI mode is enabled.
 *
 * Checks both environment variables and the backend .env file:
 * - USE_VERTEX_AI=true|1 (Auto-Claude)
 * - CLAUDE_CODE_USE_VERTEX=true|1 (Claude Code)
 *
 * When Vertex AI is enabled, authentication uses Google Cloud credentials
 * instead of Claude OAuth tokens, so OAuth token checks should be skipped.
 */
export function isVertexAIEnabled(): boolean {
  // Check cache
  const now = Date.now();
  if (cachedVertexAIEnabled !== null && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedVertexAIEnabled;
  }

  // First check process environment variables
  const processEnvVertex = process.env.USE_VERTEX_AI?.toLowerCase();
  const processEnvClaudeVertex = process.env.CLAUDE_CODE_USE_VERTEX?.toLowerCase();

  if (processEnvVertex === 'true' || processEnvVertex === '1' ||
      processEnvClaudeVertex === 'true' || processEnvClaudeVertex === '1') {
    cachedVertexAIEnabled = true;
    cacheTimestamp = now;
    return true;
  }

  // Then check the backend .env file
  const envPath = getBackendEnvPath();
  if (envPath) {
    const envVars = parseEnvFile(envPath);
    const envFileVertex = envVars.USE_VERTEX_AI?.toLowerCase();
    const envFileClaudeVertex = envVars.CLAUDE_CODE_USE_VERTEX?.toLowerCase();

    if (envFileVertex === 'true' || envFileVertex === '1' ||
        envFileClaudeVertex === 'true' || envFileClaudeVertex === '1') {
      cachedVertexAIEnabled = true;
      cacheTimestamp = now;
      console.log('[vertex-ai-utils] Vertex AI mode enabled via backend .env file');
      return true;
    }
  }

  cachedVertexAIEnabled = false;
  cacheTimestamp = now;
  return false;
}

/**
 * Get Vertex AI configuration from environment
 */
export function getVertexAIConfig(): { projectId?: string; location?: string } | null {
  if (!isVertexAIEnabled()) {
    return null;
  }

  // Check process env first, then .env file
  let projectId = process.env.VERTEX_PROJECT_ID || process.env.ANTHROPIC_VERTEX_PROJECT_ID;
  let location = process.env.VERTEX_LOCATION || process.env.CLOUD_ML_REGION;

  if (!projectId || !location) {
    const envPath = getBackendEnvPath();
    if (envPath) {
      const envVars = parseEnvFile(envPath);
      projectId = projectId || envVars.VERTEX_PROJECT_ID || envVars.ANTHROPIC_VERTEX_PROJECT_ID;
      location = location || envVars.VERTEX_LOCATION || envVars.CLOUD_ML_REGION || 'us-east5';
    }
  }

  return { projectId, location: location || 'us-east5' };
}

/**
 * Clear the cached Vertex AI state (useful for testing or when .env changes)
 */
export function clearVertexAICache(): void {
  cachedVertexAIEnabled = null;
  cacheTimestamp = 0;
}
