/**
 * GitHub API wrapper for trail content management
 */

export class GitHubAPI {
  constructor(token, owner, repo, branch = 'main') {
    this.token = token;
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.baseUrl = 'https://api.github.com';
  }

  /**
   * Make an authenticated request to the GitHub API
   */
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `Bearer ${this.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new GitHubError(response.status, error.message || response.statusText, error);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  /**
   * Validate the token by fetching user info
   */
  async validateToken() {
    try {
      const user = await this.request('/user');
      return {
        valid: true,
        user: {
          login: user.login,
          name: user.name,
          avatar: user.avatar_url
        }
      };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Check if user has write access to the repository
   */
  async checkRepoAccess() {
    try {
      const repo = await this.request(`/repos/${this.owner}/${this.repo}`);
      return {
        hasAccess: true,
        canPush: repo.permissions?.push || false,
        repoName: repo.full_name
      };
    } catch (error) {
      return {
        hasAccess: false,
        canPush: false,
        error: error.message
      };
    }
  }

  /**
   * Get contents of a file or directory
   */
  async getContents(path, ref = this.branch) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    return this.request(`/repos/${this.owner}/${this.repo}/contents/${encodedPath}?ref=${ref}`);
  }

  /**
   * Get file content as decoded text
   */
  async getFileContent(path) {
    const file = await this.getContents(path);
    if (Array.isArray(file)) {
      throw new GitHubError(400, 'Path is a directory, not a file');
    }
    return {
      content: this.decodeBase64Utf8(file.content),
      sha: file.sha,
      path: file.path
    };
  }

  /**
   * Decode base64 to UTF-8 string (atob only handles Latin-1)
   */
  decodeBase64Utf8(base64) {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  }

  /**
   * Get file content as JSON
   */
  async getJsonFile(path) {
    const { content, sha, path: filePath } = await this.getFileContent(path);
    return {
      data: JSON.parse(content),
      sha,
      path: filePath
    };
  }

  /**
   * Create or update a file
   */
  async putFile(path, content, message, sha = null) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');

    // Encode content as base64
    const encodedContent = typeof content === 'string'
      ? btoa(unescape(encodeURIComponent(content)))
      : content; // Already base64 encoded (for binary files)

    const body = {
      message,
      content: encodedContent,
      branch: this.branch
    };

    if (sha) {
      body.sha = sha;
    }

    return this.request(`/repos/${this.owner}/${this.repo}/contents/${encodedPath}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }

  /**
   * Update a JSON file
   */
  async putJsonFile(path, data, message, sha) {
    const content = JSON.stringify(data, null, 2);
    return this.putFile(path, content, message, sha);
  }

  /**
   * Delete a file
   */
  async deleteFile(path, message, sha) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');

    return this.request(`/repos/${this.owner}/${this.repo}/contents/${encodedPath}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message,
        sha,
        branch: this.branch
      })
    });
  }

  /**
   * List directory contents
   */
  async listDirectory(path) {
    const contents = await this.getContents(path);
    if (!Array.isArray(contents)) {
      throw new GitHubError(400, 'Path is a file, not a directory');
    }
    return contents;
  }

  /**
   * Check if a path exists
   */
  async exists(path) {
    try {
      await this.getContents(path);
      return true;
    } catch (error) {
      if (error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Upload a binary file (image) as base64
   */
  async uploadImage(path, base64Data, message, sha = null) {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');

    // Remove data URL prefix if present - content is already base64
    const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');

    const body = {
      message,
      content: base64Content, // Already base64, don't re-encode
      branch: this.branch
    };

    if (sha) {
      body.sha = sha;
    }

    return this.request(`/repos/${this.owner}/${this.repo}/contents/${encodedPath}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }

  /**
   * Get image as data URL
   */
  async getImageAsDataUrl(path, mimeType = 'image/jpeg') {
    const file = await this.getContents(path);
    if (Array.isArray(file)) {
      throw new GitHubError(400, 'Path is a directory, not a file');
    }
    return `data:${mimeType};base64,${file.content}`;
  }

  /**
   * Delete multiple files in a batch (creates one commit per file with GitHub API)
   * For true batch commits, would need to use Git Data API (trees/blobs)
   */
  async deleteFiles(files, messagePrefix = 'Delete') {
    const results = [];
    for (const { path, sha } of files) {
      const result = await this.deleteFile(path, `${messagePrefix}: ${path}`, sha);
      results.push(result);
    }
    return results;
  }

  // --- Git Data API methods for batch commits ---

  /**
   * Get the ref (SHA) for a branch
   */
  async getBranchRef() {
    const data = await this.request(`/repos/${this.owner}/${this.repo}/git/ref/heads/${this.branch}`);
    return data.object.sha;
  }

  /**
   * Get a commit object
   */
  async getCommit(sha) {
    return this.request(`/repos/${this.owner}/${this.repo}/git/commits/${sha}`);
  }

  /**
   * Create a blob in the repository
   */
  async createBlob(content, encoding = 'base64') {
    return this.request(`/repos/${this.owner}/${this.repo}/git/blobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, encoding })
    });
  }

  /**
   * Create a tree object
   */
  async createTree(baseTreeSha, treeItems) {
    return this.request(`/repos/${this.owner}/${this.repo}/git/trees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems
      })
    });
  }

  /**
   * Create a commit object
   */
  async createCommitObject(message, treeSha, parentSha) {
    return this.request(`/repos/${this.owner}/${this.repo}/git/commits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        tree: treeSha,
        parents: [parentSha]
      })
    });
  }

  /**
   * Update a branch ref to point to a new commit
   */
  async updateBranchRef(sha) {
    return this.request(`/repos/${this.owner}/${this.repo}/git/refs/heads/${this.branch}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha })
    });
  }

  /**
   * Perform multiple file operations in a single commit using the Git Data API.
   *
   * @param {Array<{action: 'add'|'delete', path: string, content?: string, encoding?: string}>} operations
   * @param {string} message - Commit message
   * @param {number} retries - Number of retries on conflict (stale ref)
   * @returns {object} The created commit object
   */
  async batchCommit(operations, message, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // 1. Get current branch HEAD
        const headSha = await this.getBranchRef();
        const headCommit = await this.getCommit(headSha);
        const baseTreeSha = headCommit.tree.sha;

        // 2. Create blobs for all 'add' operations in parallel
        const blobPromises = operations
          .filter(op => op.action === 'add')
          .map(async (op) => {
            const blob = await this.createBlob(op.content, op.encoding || 'base64');
            return { path: op.path, blobSha: blob.sha };
          });

        const blobResults = await Promise.all(blobPromises);
        const blobMap = new Map(blobResults.map(r => [r.path, r.blobSha]));

        // 3. Build tree items
        const treeItems = operations.map(op => {
          if (op.action === 'add') {
            return {
              path: op.path,
              mode: '100644',
              type: 'blob',
              sha: blobMap.get(op.path)
            };
          } else {
            // delete: set sha to null to remove from tree
            return {
              path: op.path,
              mode: '100644',
              type: 'blob',
              sha: null
            };
          }
        });

        // 4. Create tree, commit, and update ref
        const newTree = await this.createTree(baseTreeSha, treeItems);
        const newCommit = await this.createCommitObject(message, newTree.sha, headSha);
        await this.updateBranchRef(newCommit.sha);

        return newCommit;
      } catch (error) {
        // Retry on 422 conflict (stale ref) if we have retries left
        if (error.status === 422 && attempt < retries) {
          console.warn(`Batch commit conflict (attempt ${attempt}/${retries}), retrying...`);
          continue;
        }
        throw error;
      }
    }
  }
}

/**
 * Custom error class for GitHub API errors
 */
export class GitHubError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.details = details;
  }
}
