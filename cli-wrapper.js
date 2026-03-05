import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const DEFAULT_BINARY_PATHS = [
  'obsidian',
  '/Applications/Obsidian.app/Contents/MacOS/obsidian',
  '/usr/local/bin/obsidian',
];

export class ObsidianCLI {
  constructor(options = {}) {
    this.binaryPath = options.binaryPath || process.env.OBSIDIAN_CLI_PATH || null;
    this.vaultName = options.vaultName || process.env.OBSIDIAN_VAULT_NAME || null;
    this.defaultTimeout = options.timeout || 10_000;
    this._available = null;
    this._resolvedBinary = null;
  }

  /**
   * Resolve the obsidian binary path by checking configured path,
   * then known default locations.
   */
  async resolveBinary() {
    if (this._resolvedBinary) return this._resolvedBinary;

    const candidates = this.binaryPath
      ? [this.binaryPath, ...DEFAULT_BINARY_PATHS]
      : DEFAULT_BINARY_PATHS;

    for (const bin of candidates) {
      try {
        await execFileAsync(bin, ['version'], { timeout: 5_000 });
        this._resolvedBinary = bin;
        return bin;
      } catch {
        // Try next candidate
      }
    }

    return null;
  }

  /**
   * Check if the Obsidian CLI is available. Result is cached.
   */
  async isAvailable() {
    if (this._available !== null) return this._available;

    const binary = await this.resolveBinary();
    this._available = binary !== null;

    if (this._available) {
      console.error(`[obsidian-mcp] CLI detected at: ${this._resolvedBinary}`);
    } else {
      console.error('[obsidian-mcp] CLI not available. Using direct fs access.');
    }

    return this._available;
  }

  /**
   * Throw if CLI is not available.
   */
  async ensureAvailable() {
    if (!(await this.isAvailable())) {
      throw new Error(
        'Obsidian CLI is not available. Ensure Obsidian v1.12+ is installed and running, ' +
        'and the CLI is enabled in Settings > General > Command line interface.'
      );
    }
  }

  /**
   * Clear the cached availability check (e.g. after a connection failure).
   */
  resetAvailability() {
    this._available = null;
    this._resolvedBinary = null;
  }

  /**
   * Execute an Obsidian CLI command.
   * @param {string[]} args - Command arguments (e.g. ['read', 'path=foo.md'])
   * @param {object} options - { timeout }
   * @returns {string} stdout
   */
  async exec(args, options = {}) {
    await this.ensureAvailable();

    const fullArgs = this.vaultName
      ? [`vault=${this.vaultName}`, ...args]
      : args;

    try {
      const { stdout } = await execFileAsync(
        this._resolvedBinary,
        fullArgs,
        {
          timeout: options.timeout || this.defaultTimeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB
        }
      );
      return stdout;
    } catch (error) {
      // If the error suggests Obsidian is not running, reset availability
      if (error.code === 'ECONNREFUSED' || error.killed || error.code === 'ENOENT') {
        this.resetAvailability();
      }
      throw new Error(`Obsidian CLI error: ${error.message}`);
    }
  }

  /**
   * Execute a CLI command and parse JSON output.
   * @param {string[]} args - Command arguments (format=json will be appended)
   * @param {object} options - { timeout }
   * @returns {any} parsed JSON
   */
  async execJSON(args, options = {}) {
    const output = await this.exec([...args, 'format=json'], options);
    try {
      return JSON.parse(output.trim());
    } catch {
      throw new Error(`Failed to parse CLI JSON output: ${output.substring(0, 200)}`);
    }
  }

  // ===== Convenience methods =====

  async version() {
    return (await this.exec(['version'])).trim();
  }

  async dailyPath() {
    return (await this.exec(['daily:path'])).trim();
  }

  async dailyRead() {
    return await this.exec(['daily:read']);
  }

  async dailyAppend(content) {
    return await this.exec(['daily:append', `content=${content}`]);
  }

  async readFile(filePath) {
    return await this.exec(['read', `path=${filePath}`]);
  }

  async createFile(filePath, content, { overwrite = false } = {}) {
    const args = ['create', `path=${filePath}`, `content=${content}`];
    if (overwrite) args.push('overwrite');
    return await this.exec(args, { timeout: 15_000 });
  }

  async appendFile(filePath, content) {
    return await this.exec(['append', `path=${filePath}`, `content=${content}`]);
  }

  async listFiles(folder, ext = 'md') {
    const args = ['files'];
    if (folder) args.push(`folder=${folder}`);
    if (ext) args.push(`ext=${ext}`);
    return await this.execJSON(args);
  }

  async searchContext(query, { path, limit, caseSensitive } = {}) {
    const args = ['search:context', `query=${query}`];
    if (path) args.push(`path=${path}`);
    if (limit) args.push(`limit=${limit}`);
    if (caseSensitive) args.push('case');
    return await this.execJSON(args, { timeout: 30_000 });
  }

  async search(query, { path, limit } = {}) {
    const args = ['search', `query=${query}`];
    if (path) args.push(`path=${path}`);
    if (limit) args.push(`limit=${limit}`);
    return await this.execJSON(args, { timeout: 30_000 });
  }

  async tasksFromFile(filePath, { todo, done } = {}) {
    const args = ['tasks', `path=${filePath}`];
    if (todo) args.push('todo');
    if (done) args.push('done');
    return await this.execJSON(args);
  }

  async tasksDaily({ todo, done } = {}) {
    const args = ['tasks', 'daily'];
    if (todo) args.push('todo');
    if (done) args.push('done');
    return await this.execJSON(args);
  }

  async tasksAll({ todo, done, verbose } = {}) {
    const args = ['tasks'];
    if (todo) args.push('todo');
    if (done) args.push('done');
    if (verbose) args.push('verbose');
    return await this.execJSON(args, { timeout: 30_000 });
  }

  async fileInfo(filePath) {
    return await this.exec(['file', `path=${filePath}`]);
  }

  async tagsCounts() {
    return await this.execJSON(['tags', 'counts']);
  }
}
