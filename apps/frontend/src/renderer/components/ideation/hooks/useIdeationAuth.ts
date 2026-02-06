import { useState, useEffect } from 'react';
import { useSettingsStore } from '../../../stores/settings-store';

/**
 * Hook to check if the ideation feature has valid authentication.
 * This combines three sources of authentication:
 * 1. Vertex AI mode (uses Google Cloud credentials)
 * 2. OAuth token from source .env (checked via checkSourceToken)
 * 3. Active API profile (custom Anthropic-compatible endpoint)
 *
 * @returns { hasToken, isLoading, error, checkAuth }
 * - hasToken: true if Vertex AI enabled OR source OAuth token exists OR active API profile is configured
 * - isLoading: true while checking authentication status
 * - error: any error that occurred during auth check
 * - checkAuth: function to manually re-check authentication status
 */
export function useIdeationAuth() {
  const [hasToken, setHasToken] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get active API profile info from settings store
  const activeProfileId = useSettingsStore((state) => state.activeProfileId);

  const resolveHasAPIProfile = async (profileId?: string | null): Promise<boolean> => {
    // Trust the store when it's already populated to avoid extra IPC calls; fallback to IPC only when empty.
    if (profileId && profileId !== '') {
      return true;
    }

    try {
      const profilesResult = await window.electronAPI.getAPIProfiles();
      return Boolean(
        profilesResult.success &&
        profilesResult.data?.activeProfileId &&
        profilesResult.data.activeProfileId !== ''
      );
    } catch {
      return false;
    }
  };

  useEffect(() => {
    const performCheck = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Check for Vertex AI mode first (uses Google Cloud credentials)
        const vertexResult = await window.electronAPI.getVertexAIStatus();
        if (vertexResult.success && vertexResult.data?.enabled) {
          setHasToken(true);
          setIsLoading(false);
          return;
        }

        // Check for OAuth token from source .env
        const sourceTokenResult = await window.electronAPI.checkSourceToken();
        const hasSourceOAuthToken = sourceTokenResult.success && sourceTokenResult.data?.hasToken;

        const hasAPIProfile = await resolveHasAPIProfile(activeProfileId);

        // Auth is valid if either source token or API profile exists
        setHasToken(Boolean(hasSourceOAuthToken || hasAPIProfile));
      } catch (err) {
        setHasToken(false);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    performCheck();
  }, [activeProfileId]);

  // Expose checkAuth for manual re-checks
  const checkAuth = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check for Vertex AI mode first (uses Google Cloud credentials)
      const vertexResult = await window.electronAPI.getVertexAIStatus();
      if (vertexResult.success && vertexResult.data?.enabled) {
        setHasToken(true);
        setIsLoading(false);
        return;
      }

      const sourceTokenResult = await window.electronAPI.checkSourceToken();
      const hasSourceOAuthToken = sourceTokenResult.success && sourceTokenResult.data?.hasToken;

      const hasAPIProfile = await resolveHasAPIProfile(activeProfileId);

      setHasToken(Boolean(hasSourceOAuthToken || hasAPIProfile));
    } catch (err) {
      setHasToken(false);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  return { hasToken, isLoading, error, checkAuth };
}
