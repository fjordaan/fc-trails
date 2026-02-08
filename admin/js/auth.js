/**
 * Authentication module for GitHub PAT storage and validation
 */

const STORAGE_KEY = 'trail-editor-pat';

export class Auth {
  constructor() {
    this.token = null;
    this.user = null;
  }

  /**
   * Get stored token from localStorage
   */
  getStoredToken() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      console.warn('localStorage not available:', e);
      return null;
    }
  }

  /**
   * Store token in localStorage
   */
  storeToken(token) {
    try {
      localStorage.setItem(STORAGE_KEY, token);
      this.token = token;
    } catch (e) {
      console.warn('Could not store token:', e);
    }
  }

  /**
   * Clear stored token
   */
  clearToken() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      this.token = null;
      this.user = null;
    } catch (e) {
      console.warn('Could not clear token:', e);
    }
  }

  /**
   * Check if user is authenticated (has valid stored token)
   */
  isAuthenticated() {
    return !!this.token;
  }

  /**
   * Initialize auth state from storage
   */
  async init(githubApi) {
    const storedToken = this.getStoredToken();

    if (!storedToken) {
      return { authenticated: false };
    }

    // Update API with stored token
    githubApi.token = storedToken;

    // Validate the token
    const validation = await githubApi.validateToken();

    if (!validation.valid) {
      this.clearToken();
      return { authenticated: false, error: validation.error };
    }

    // Check repo access
    const access = await githubApi.checkRepoAccess();

    if (!access.canPush) {
      this.clearToken();
      return {
        authenticated: false,
        error: access.hasAccess
          ? 'Token does not have write access to the repository'
          : 'Repository not found or token does not have access'
      };
    }

    this.token = storedToken;
    this.user = validation.user;

    return {
      authenticated: true,
      user: this.user
    };
  }

  /**
   * Authenticate with a new token
   */
  async authenticate(token, githubApi) {
    // Update API with new token
    githubApi.token = token;

    // Validate the token
    const validation = await githubApi.validateToken();

    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid token');
    }

    // Check repo access
    const access = await githubApi.checkRepoAccess();

    if (!access.hasAccess) {
      throw new Error('Repository not found or token does not have access');
    }

    if (!access.canPush) {
      throw new Error('Token does not have write access to the repository. Make sure it has the "repo" scope.');
    }

    // Store token and user info
    this.storeToken(token);
    this.user = validation.user;

    return {
      authenticated: true,
      user: this.user,
      repo: access.repoName
    };
  }

  /**
   * Logout - clear stored credentials
   */
  logout() {
    this.clearToken();
  }
}
