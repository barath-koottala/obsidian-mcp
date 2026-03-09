#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import { ObsidianCLI } from './cli-wrapper.js';

class ObsidianMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'obsidian-vault-server',
        version: '0.4.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.cli = new ObsidianCLI();

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'read_note',
            description: 'Read the contents of a specific note file. You can pass just a date like "2026-02-24" and it will auto-resolve to the correct file anywhere in the vault using Obsidian\'s name-based lookup.',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: {
                  type: 'string',
                  description: 'Path to the note file relative to vault root, OR a date in YYYY-MM-DD format to auto-resolve the daily note',
                },
              },
              required: ['file_path'],
            },
          },
          {
            name: 'write_note',
            description: 'Write or append content to a note file',
            inputSchema: {
              type: 'object',
              properties: {
                file_path: {
                  type: 'string',
                  description: 'Path to the note file relative to vault root',
                },
                content: {
                  type: 'string',
                  description: 'The content to write to the note',
                },
                create_folders: {
                  type: 'boolean',
                  description: 'Whether to create parent folders if they don\'t exist',
                  default: true,
                },
                append_mode: {
                  type: 'boolean',
                  description: 'If true, append content to existing file. If false, overwrite file.',
                  default: true,
                },
              },
              required: ['file_path', 'content'],
            },
          },
          {
            name: 'search_notes',
            description: 'Search for notes containing specific text. Searches the entire vault by default.',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Text to search for in note contents',
                },
                folder_path: {
                  type: 'string',
                  description: 'Optional: Limit search to specific folder',
                },
              },
              required: ['query'],
            },
          },
          {
            name: 'list_notes',
            description: 'List all notes or notes in a specific folder. Searches the entire vault by default.',
            inputSchema: {
              type: 'object',
              properties: {
                folder_path: {
                  type: 'string',
                  description: 'Optional: Path to folder to list (defaults to root)',
                },
                recursive: {
                  type: 'boolean',
                  description: 'Whether to list notes recursively',
                  default: true,
                },
              },
            },
          },
          {
            name: 'get_recent_notes',
            description: 'Get notes modified within a specified time period. Searches the entire vault by default.',
            inputSchema: {
              type: 'object',
              properties: {
                days: {
                  type: 'number',
                  description: 'Number of days back to look for recent notes',
                  default: 7,
                },
                folder_path: {
                  type: 'string',
                  description: 'Optional: Limit to specific folder',
                },
              },
            },
          },
          {
            name: 'analyze_trends',
            description: 'Analyze trends and patterns in notes over time',
            inputSchema: {
              type: 'object',
              properties: {
                days: {
                  type: 'number',
                  description: 'Number of days to analyze',
                  default: 14,
                },
                keyword: {
                  type: 'string',
                  description: 'Optional: Focus analysis on specific keyword',
                },
              },
            },
          },
          {
            name: 'extract_tasks',
            description: 'Extract all tasks from daily notes in a date range, categorized by completion status. Defaults to the current week.',
            inputSchema: {
              type: 'object',
              properties: {
                start_date: {
                  type: 'string',
                  description: 'Start date in ISO format (YYYY-MM-DD). Defaults to Monday of current week.',
                },
                end_date: {
                  type: 'string',
                  description: 'End date in ISO format (YYYY-MM-DD). Defaults to Sunday of current week.',
                },
                include_timestamps: {
                  type: 'boolean',
                  description: 'Whether to include completion timestamps (e.g., \u2705 2025-09-25)',
                  default: true,
                },
              },
            },
          },
          {
            name: 'generate_task_summary',
            description: 'Generate a task summary document for a date range. Defaults to the current week.',
            inputSchema: {
              type: 'object',
              properties: {
                start_date: {
                  type: 'string',
                  description: 'Start date in ISO format (YYYY-MM-DD). Defaults to Monday of current week.',
                },
                end_date: {
                  type: 'string',
                  description: 'End date in ISO format (YYYY-MM-DD). Defaults to Sunday of current week.',
                },
                filename: {
                  type: 'string',
                  description: 'Name of the output file',
                  default: 'Task-Summary.md',
                },
                group_by_date: {
                  type: 'boolean',
                  description: 'Whether to group tasks by date',
                  default: false,
                },
                show_source: {
                  type: 'boolean',
                  description: 'Whether to show source file for each task',
                  default: false,
                },
              },
            },
          },
          {
            name: 'aggregate_tasks_by_period',
            description: 'Aggregate tasks from daily notes within a specified time period',
            inputSchema: {
              type: 'object',
              properties: {
                period: {
                  type: 'string',
                  enum: ['current_week', 'last_week', 'current_month', 'last_month', 'current_year', 'last_year', 'custom'],
                  description: 'Time period to aggregate tasks from',
                },
                custom_start_date: {
                  type: 'string',
                  description: 'Required if period is "custom". ISO date format (YYYY-MM-DD)',
                },
                custom_end_date: {
                  type: 'string',
                  description: 'Required if period is "custom". ISO date format (YYYY-MM-DD)',
                },
                filter: {
                  type: 'string',
                  enum: ['all', 'completed', 'incomplete'],
                  default: 'all',
                  description: 'Filter tasks by completion status',
                },
                group_by: {
                  type: 'string',
                  enum: ['date', 'none'],
                  default: 'date',
                  description: 'How to group tasks in the output',
                },
              },
              required: ['period'],
            },
          },
          {
            name: 'create_period_rollover_summary',
            description: 'Create a task rollover summary from a past period and write it to the current month folder',
            inputSchema: {
              type: 'object',
              properties: {
                source_period: {
                  type: 'string',
                  enum: ['last_week', 'last_month', 'last_year'],
                  description: 'Time period to pull tasks from',
                },
                include_completed: {
                  type: 'boolean',
                  default: true,
                  description: 'Whether to include completed tasks in the summary',
                },
                filename: {
                  type: 'string',
                  default: 'Task-Rollover.md',
                  description: 'Name of the file to create in current month folder',
                },
              },
              required: ['source_period'],
            },
          },
          {
            name: 'get_my_actionable_items',
            description: 'Get actionable items (tasks) from Obsidian notes for a specified timeframe. Returns tasks that can be combined with Linear tickets. Use "today" for current date, "this_week" for current week.',
            inputSchema: {
              type: 'object',
              properties: {
                timeframe: {
                  type: 'string',
                  enum: ['today', 'this_week', 'custom'],
                  description: 'Timeframe to fetch tasks from',
                  default: 'today'
                },
                custom_date: {
                  type: 'string',
                  description: 'Required if timeframe is "custom". ISO date format (YYYY-MM-DD)'
                },
                filter: {
                  type: 'string',
                  enum: ['all', 'incomplete', 'completed'],
                  default: 'incomplete',
                  description: 'Filter tasks by completion status'
                },
                include_metadata: {
                  type: 'boolean',
                  default: true,
                  description: 'Include source file and date metadata'
                }
              },
              required: ['timeframe']
            }
          },
          {
            name: 'write_todos_to_today',
            description: 'Write or update generated content within the existing TODO section in today\'s daily note. This tool inserts actionable items (Obsidian tasks and Linear tickets) into the TODO section using markers, safely updating without affecting manually added tasks.',
            inputSchema: {
              type: 'object',
              properties: {
                obsidian_tasks: {
                  type: 'array',
                  description: 'List of tasks from Obsidian notes',
                  items: {
                    type: 'object',
                    properties: {
                      text: { type: 'string', description: 'Task text' },
                      file: { type: 'string', description: 'Source file path' }
                    }
                  },
                  default: []
                },
                linear_tickets: {
                  type: 'array',
                  description: 'List of Linear tickets assigned to user',
                  items: {
                    type: 'object',
                    properties: {
                      identifier: { type: 'string', description: 'Ticket ID (e.g., ENG-1440)' },
                      title: { type: 'string', description: 'Ticket title' },
                      state: { type: 'string', description: 'Ticket state' },
                      url: { type: 'string', description: 'Linear URL' },
                      priority: { type: 'number', description: 'Priority 0-4' }
                    }
                  },
                  default: []
                },
                strategy: {
                  type: 'string',
                  enum: ['replace', 'append'],
                  default: 'replace',
                  description: 'Whether to replace the generated section or append to it'
                }
              }
            }
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'read_note':
            return await this.readNote(args.file_path);

          case 'write_note':
            return await this.writeNote(args.file_path, args.content, args.create_folders, args.append_mode);

          case 'search_notes':
            return await this.searchNotes(args.query, args.folder_path);

          case 'list_notes':
            return await this.listNotes(args.folder_path, args.recursive);

          case 'get_recent_notes':
            return await this.getRecentNotes(args.days || 7, args.folder_path);

          case 'analyze_trends':
            return await this.analyzeTrends(args.days || 14, args.keyword);

          case 'extract_tasks':
            return await this.extractTasks(args);

          case 'generate_task_summary':
            return await this.generateTaskSummary(args);

          case 'aggregate_tasks_by_period':
            return await this.aggregateTasksByPeriod(args);

          case 'create_period_rollover_summary':
            return await this.createPeriodRolloverSummary(args);

          case 'get_my_actionable_items':
            return await this.getMyActionableItems(args);

          case 'write_todos_to_today':
            return await this.writeTodosToToday(args);

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(ErrorCode.InternalError, `Error executing ${name}: ${error.message}`);
      }
    });
  }

  // ===== Tool Implementations =====

  async readNote(filePath) {
    const dateMatch = filePath.match(/^(\d{4}-\d{2}-\d{2})(?:\.md)?$/);

    if (dateMatch) {
      // For today's date, use daily:read directly (fast path)
      const today = this.formatDateStr(new Date());
      if (dateMatch[1] === today) {
        try {
          const content = await this.cli.dailyRead();
          const dailyPath = await this.cli.dailyPath();
          return {
            content: [{ type: 'text', text: `# ${path.basename(dailyPath)}\n\nPath: ${dailyPath}\n\n${content}` }],
          };
        } catch {
          throw new Error(`No daily note found for today (${today}).`);
        }
      }

      // For other dates, use CLI's native name-based resolution (searches entire vault)
      const filename = `${dateMatch[1]}`;
      try {
        const content = await this.cli.readFileByName(filename);
        return { content: [{ type: 'text', text: content }] };
      } catch {
        throw new Error(`No daily note found for date: ${dateMatch[1]}. Searched vault for "${filename}".`);
      }
    }

    // Non-date path — CLI read adds headers automatically
    const content = await this.cli.readFile(filePath);
    return { content: [{ type: 'text', text: content }] };
  }

  async writeNote(filePath, content, createFolders = true, appendMode = true) {
    if (appendMode) {
      await this.cli.appendFile(filePath, content);
    } else {
      await this.cli.createFile(filePath, content, { overwrite: true });
    }

    // Read back to get stats
    const fileContent = await this.cli.readFile(filePath);
    return {
      content: [{
        type: 'text',
        text: `Successfully ${appendMode ? 'appended to' : 'wrote'} ${filePath}\nSize: ${Buffer.byteLength(fileContent, 'utf-8')} bytes`,
      }],
    };
  }

  async searchNotes(query, folderPath = '') {
    try {
      const args = ['search:context', `query=${query}`];
      if (folderPath) args.push(`path=${folderPath}`);
      const output = await this.cli.exec(args, { timeout: 30_000 });

      if (!output.trim()) {
        return {
          content: [{ type: 'text', text: `No notes found containing "${query}".` }],
        };
      }

      // Parse grep-style output: path:line: text
      const results = {};
      for (const line of output.trim().split('\n')) {
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          const [, file, lineNum, text] = match;
          if (!results[file]) results[file] = [];
          if (results[file].length < 5) {
            results[file].push({ line: parseInt(lineNum), text: text.trim() });
          }
        }
      }

      const fileCount = Object.keys(results).length;
      let responseText = `Found ${fileCount} note(s) containing "${query}":\n\n`;
      for (const [file, matches] of Object.entries(results)) {
        responseText += `## ${file}\n`;
        for (const m of matches) {
          responseText += `  Line ${m.line}: ${m.text}\n`;
        }
        responseText += '\n';
      }
      return { content: [{ type: 'text', text: responseText }] };
    } catch {
      return {
        content: [{ type: 'text', text: `No notes found containing "${query}".` }],
      };
    }
  }

  async listNotes(folderPath = '', recursive = true) {
    const label = folderPath || 'vault';
    try {
      const args = ['files', 'ext=md'];
      if (folderPath) args.push(`folder=${folderPath}`);
      const output = await this.cli.exec(args);
      const files = output.trim().split('\n').filter(Boolean);

      if (files.length === 0) {
        return {
          content: [{ type: 'text', text: `No notes found in ${label}.` }],
        };
      }

      let responseText = `Found ${files.length} note(s) in ${label}:\n\n`;
      for (const file of files) {
        responseText += `- ${file}\n`;
      }
      return { content: [{ type: 'text', text: responseText }] };
    } catch {
      return {
        content: [{ type: 'text', text: `No notes found in ${label}.` }],
      };
    }
  }

  async getRecentNotes(days, folderPath = '') {
    try {
      const args = ['files', 'ext=md'];
      if (folderPath) args.push(`folder=${folderPath}`);
      const output = await this.cli.exec(args);
      const files = output.trim().split('\n').filter(Boolean);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      // Parallel: get file info to check mtime (10 concurrent)
      const fileInfos = await this.cli.parallel(files, async (filePath) => {
        const info = await this.cli.exec(['file', `path=${filePath}`]);
        const modifiedMatch = info.match(/modified\s+(\d+)/);
        if (!modifiedMatch) return null;
        const mtime = new Date(parseInt(modifiedMatch[1]));
        if (mtime <= cutoffDate) return null;
        return { relativePath: filePath, lastModified: mtime.toISOString().split('T')[0], mtime };
      });

      const recentFiles = fileInfos.filter(Boolean);
      recentFiles.sort((a, b) => b.mtime - a.mtime);

      if (recentFiles.length === 0) {
        return {
          content: [{ type: 'text', text: `No notes modified in the last ${days} day(s).` }],
        };
      }

      let responseText = `Found ${recentFiles.length} note(s) modified in the last ${days} day(s):\n\n`;
      for (const file of recentFiles) {
        responseText += `- ${file.relativePath} (modified: ${file.lastModified})\n`;
      }
      return { content: [{ type: 'text', text: responseText }] };
    } catch (error) {
      throw new Error(`Failed to get recent notes: ${error.message}`);
    }
  }

  async analyzeTrends(days, keyword) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const trends = {
      totalNotes: 0,
      dailyActivity: {},
      topTopics: {},
      keywordMentions: 0,
    };

    // List all markdown files across the vault
    const output = await this.cli.exec(['files', 'ext=md']);
    const files = output.trim().split('\n').filter(Boolean);

    // Parallel: get file info to filter by mtime
    const fileInfos = await this.cli.parallel(files, async (filePath) => {
      const info = await this.cli.exec(['file', `path=${filePath}`]);
      const modifiedMatch = info.match(/modified\s+(\d+)/);
      if (!modifiedMatch) return null;
      const mtime = new Date(parseInt(modifiedMatch[1]));
      if (mtime <= cutoffDate) return null;
      return { filePath, mtime };
    });

    const recentFiles = fileInfos.filter(Boolean);

    // Parallel: read content of recent files only
    const contents = await this.cli.parallel(recentFiles, async ({ filePath }) => {
      return await this.cli.readFile(filePath);
    });

    for (let i = 0; i < recentFiles.length; i++) {
      const { mtime } = recentFiles[i];
      const content = contents[i];
      if (!content) continue;

      trends.totalNotes++;

      const date = mtime.toISOString().split('T')[0];
      trends.dailyActivity[date] = (trends.dailyActivity[date] || 0) + 1;

      if (keyword && content.toLowerCase().includes(keyword.toLowerCase())) {
        trends.keywordMentions++;
      }

      const topics = content.match(/#\w+|#{1,6}\s+([^\n]+)/g);
      if (topics) {
        topics.forEach((topic) => {
          const cleanTopic = topic.replace(/^#+\s*/, '').toLowerCase();
          if (cleanTopic.length > 2) {
            trends.topTopics[cleanTopic] = (trends.topTopics[cleanTopic] || 0) + 1;
          }
        });
      }
    }

    const dailyActivityArray = Object.entries(trends.dailyActivity)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const topTopics = Object.entries(trends.topTopics)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([topic, count]) => `${topic}: ${count} mentions`);

    let analysisText = `Trend Analysis (Last ${days} days):\n\n`;
    analysisText += `**Overview:**\n`;
    analysisText += `- Total notes analyzed: ${trends.totalNotes}\n`;

    if (keyword) {
      analysisText += `- "${keyword}" mentions: ${trends.keywordMentions}\n`;
    }

    analysisText += `\n**Daily Activity:**\n`;
    analysisText += dailyActivityArray
      .map(({ date, count }) => `- ${date}: ${count} notes`)
      .join('\n');

    analysisText += `\n\n**Top Topics:**\n${topTopics.join('\n')}`;

    return {
      content: [{ type: 'text', text: analysisText }],
    };
  }

  // ===== Task/Aggregation Implementations =====

  cliTaskToInternal(cliTask) {
    const completed = cliTask.status === 'x' || cliTask.status === 'X';
    const rawLine = cliTask.text;
    const taskMatch = rawLine.match(/^-\s+\[[ xX]\]\s+(.+)$/);
    const text = taskMatch ? taskMatch[1] : rawLine;
    const timestampMatch = text.match(/\u2705\s+(\d{4}-\d{2}-\d{2})/);
    const timestamp = timestampMatch ? timestampMatch[1] : null;
    const sourceFile = cliTask.file.split('/').pop();

    return { completed, text, rawLine, sourceFile, timestamp };
  }

  async extractTasksFromFile(filePath) {
    try {
      const cliTasks = await this.cli.tasksFromFile(filePath);
      return cliTasks
        .filter(t => t.text.trim() !== '- [ ]') // Skip empty checkbox placeholders
        .map(t => this.cliTaskToInternal(t));
    } catch {
      return [];
    }
  }

  /**
   * Extract tasks from multiple files in parallel.
   * @param {string[]} filePaths - Paths to extract tasks from
   * @returns {Promise<Array<{completed, text, rawLine, sourceFile, timestamp}>>} Flat array of all tasks
   */
  async extractTasksFromFiles(filePaths) {
    const results = await this.cli.parallel(
      filePaths,
      async (filePath) => this.extractTasksFromFile(filePath),
    );
    return results.filter(Boolean).flat();
  }

  async findDailyNotesInRange(startDate, endDate) {
    // Search entire vault for date-named files (not restricted to a single folder)
    const allFiles = await this.cli.findFilesByPattern(/^\d{4}-\d{2}-\d{2}\.md$/);

    const results = [];
    for (const filePath of allFiles) {
      const filename = filePath.split('/').pop();
      const dateStr = filename.replace('.md', '');
      const noteDate = new Date(dateStr + 'T12:00:00');
      if (noteDate >= startDate && noteDate <= endDate) {
        results.push({
          date: noteDate,
          dateStr,
          fullPath: filePath,
          relativePath: filePath,
        });
      }
    }

    results.sort((a, b) => a.date - b.date);
    return results;
  }

  async extractTasks(args) {
    try {
      const { startDate, endDate } = this.parseDateRangeArgs(args);
      const dailyNotes = await this.findDailyNotesInRange(startDate, endDate);

      if (dailyNotes.length === 0) {
        return {
          content: [{ type: 'text', text: `No daily notes found for ${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}.` }],
        };
      }

      const allTasks = await this.extractTasksFromFiles(dailyNotes.map(n => n.fullPath));
      const completedTasks = allTasks.filter(t => t.completed);
      const incompleteTasks = allTasks.filter(t => !t.completed);

      if (completedTasks.length === 0 && incompleteTasks.length === 0) {
        return {
          content: [{ type: 'text', text: `No tasks found for ${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}.` }],
        };
      }

      let responseText = `# Tasks from ${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}\n\n`;
      responseText += `**Total Tasks:** ${completedTasks.length + incompleteTasks.length}\n`;
      responseText += `**Notes Found:** ${dailyNotes.length}\n\n`;

      if (incompleteTasks.length > 0) {
        responseText += `## Incomplete Tasks (${incompleteTasks.length})\n\n`;
        const groupedIncomplete = this.groupTasksBySource(incompleteTasks);
        for (const filename of Object.keys(groupedIncomplete).sort()) {
          responseText += `### ${filename.replace('.md', '')}\n\n`;
          for (const task of groupedIncomplete[filename]) {
            responseText += `${task.rawLine}\n`;
          }
          responseText += '\n';
        }
      }

      if (completedTasks.length > 0) {
        responseText += `## Completed Tasks (${completedTasks.length})\n\n`;
        const groupedCompleted = this.groupTasksBySource(completedTasks);
        for (const filename of Object.keys(groupedCompleted).sort()) {
          responseText += `### ${filename.replace('.md', '')}\n\n`;
          for (const task of groupedCompleted[filename]) {
            responseText += `${task.rawLine}\n`;
          }
          responseText += '\n';
        }
      }

      return { content: [{ type: 'text', text: responseText }] };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to extract tasks: ${error.message}`);
    }
  }

  async generateTaskSummary(args) {
    try {
      const { startDate, endDate } = this.parseDateRangeArgs(args);
      const filename = args.filename || 'Task-Summary.md';
      const options = {
        groupByDate: args.group_by_date || false,
        showSource: args.show_source || false,
      };

      const dailyNotes = await this.findDailyNotesInRange(startDate, endDate);
      if (dailyNotes.length === 0) {
        return {
          content: [{ type: 'text', text: `No daily notes found for ${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}. Cannot generate summary.` }],
        };
      }

      const allTasks = await this.extractTasksFromFiles(dailyNotes.map(n => n.fullPath));
      const completedTasks = allTasks.filter(t => t.completed);
      const incompleteTasks = allTasks.filter(t => !t.completed);

      const markdown = this.generateTaskSummaryMarkdown(completedTasks, incompleteTasks, options);
      const today = new Date();
      const year = today.getFullYear().toString();
      const monthName = this.getMonthName(today);
      const outputPath = `Farther/${year}/${monthName}/${filename}`;

      await this.cli.createFile(outputPath, markdown, { overwrite: true });

      return {
        content: [{
          type: 'text',
          text: `Task summary generated successfully!\n\n**File:** ${outputPath}\n**Period:** ${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}\n**Total Tasks:** ${completedTasks.length + incompleteTasks.length}\n**Completed:** ${completedTasks.length}\n**Incomplete:** ${incompleteTasks.length}`,
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to generate task summary: ${error.message}`);
    }
  }

  async aggregateTasksByPeriod(args) {
    try {
      const {
        period = 'current_week',
        custom_start_date,
        custom_end_date,
        filter = 'all',
        group_by = 'date',
      } = args;

      const validPeriods = ['current_week', 'last_week', 'current_month', 'last_month', 'current_year', 'last_year', 'custom'];
      const validFilters = ['all', 'completed', 'incomplete'];

      if (!validPeriods.includes(period)) {
        throw new McpError(ErrorCode.InvalidRequest, `Invalid period. Must be one of: ${validPeriods.join(', ')}`);
      }
      if (!validFilters.includes(filter)) {
        throw new McpError(ErrorCode.InvalidRequest, `Invalid filter. Must be one of: ${validFilters.join(', ')}`);
      }

      const { startDate, endDate } = this.calculatePeriodDateRange(period, custom_start_date, custom_end_date);
      const dailyNotes = await this.findDailyNotesInRange(startDate, endDate);

      if (dailyNotes.length === 0) {
        return {
          content: [{ type: 'text', text: `No daily notes found for ${period.replace(/_/g, ' ')}.` }],
        };
      }

      let allTasks = await this.extractTasksFromFiles(dailyNotes.map(n => n.fullPath));

      // Apply filter
      if (filter === 'completed') {
        allTasks = allTasks.filter(t => t.completed);
      } else if (filter === 'incomplete') {
        allTasks = allTasks.filter(t => !t.completed);
      }

      if (allTasks.length === 0) {
        return {
          content: [{ type: 'text', text: `No ${filter !== 'all' ? filter + ' ' : ''}tasks found for ${period.replace(/_/g, ' ')}.` }],
        };
      }

      const periodName = period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      let responseText = `# Task Aggregation: ${periodName}\n\n`;
      responseText += `**Period:** ${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}\n`;
      responseText += `**Filter:** ${filter}\n`;
      responseText += `**Total Tasks:** ${allTasks.length}\n`;
      responseText += `**Notes Scanned:** ${dailyNotes.length}\n\n`;

      if (group_by === 'date') {
        const grouped = this.groupTasksBySource(allTasks);
        for (const filename of Object.keys(grouped).sort()) {
          responseText += `## ${filename.replace('.md', '')}\n\n`;
          for (const task of grouped[filename]) {
            responseText += `${task.rawLine}\n`;
          }
          responseText += '\n';
        }
      } else {
        for (const task of allTasks) {
          responseText += `${task.rawLine}\n`;
        }
      }

      return { content: [{ type: 'text', text: responseText }] };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to aggregate tasks: ${error.message}`);
    }
  }

  async createPeriodRolloverSummary(args) {
    try {
      const {
        source_period = 'last_week',
        include_completed = true,
        filename = 'Task-Rollover.md',
      } = args;

      const validPeriods = ['last_week', 'last_month', 'last_year'];
      if (!validPeriods.includes(source_period)) {
        throw new McpError(ErrorCode.InvalidRequest, `Invalid source_period. Must be one of: ${validPeriods.join(', ')}`);
      }

      const { startDate, endDate } = this.calculatePeriodDateRange(source_period);
      const dailyNotes = await this.findDailyNotesInRange(startDate, endDate);

      if (dailyNotes.length === 0) {
        return {
          content: [{ type: 'text', text: `No daily notes found for ${source_period.replace(/_/g, ' ')}.` }],
        };
      }

      const allTasks = await this.extractTasksFromFiles(dailyNotes.map(n => n.fullPath));
      const completedTasks = allTasks.filter(t => t.completed);
      const incompleteTasks = allTasks.filter(t => !t.completed);

      const periodName = source_period.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      let rolloverMarkdown = `# Task Rollover: ${periodName}\n\n`;
      rolloverMarkdown += `**Source Period:** ${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}\n`;
      rolloverMarkdown += `**Generated:** ${new Date().toISOString().split('T')[0]}\n\n`;

      if (incompleteTasks.length > 0) {
        rolloverMarkdown += `## Incomplete Tasks (${incompleteTasks.length})\n\n`;
        const grouped = this.groupTasksBySource(incompleteTasks);
        for (const file of Object.keys(grouped).sort()) {
          rolloverMarkdown += `### ${file.replace('.md', '')}\n\n`;
          for (const task of grouped[file]) {
            rolloverMarkdown += `${task.rawLine}\n`;
          }
          rolloverMarkdown += '\n';
        }
      }

      if (include_completed && completedTasks.length > 0) {
        rolloverMarkdown += `## Completed Tasks (${completedTasks.length})\n\n`;
        const grouped = this.groupTasksBySource(completedTasks);
        for (const file of Object.keys(grouped).sort()) {
          rolloverMarkdown += `### ${file.replace('.md', '')}\n\n`;
          for (const task of grouped[file]) {
            rolloverMarkdown += `${task.rawLine}\n`;
          }
          rolloverMarkdown += '\n';
        }
      }

      const today = new Date();
      const year = today.getFullYear().toString();
      const monthName = this.getMonthName(today);
      const outputPath = `Farther/${year}/${monthName}/${filename}`;

      await this.cli.createFile(outputPath, rolloverMarkdown, { overwrite: true });

      return {
        content: [{
          type: 'text',
          text: `Rollover summary created!\n\n**File:** ${outputPath}\n**Source:** ${periodName}\n**Incomplete Tasks:** ${incompleteTasks.length}\n**Completed Tasks:** ${completedTasks.length}`,
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to create rollover summary: ${error.message}`);
    }
  }

  async getMyActionableItems(args) {
    try {
      const { timeframe = 'today', custom_date, filter = 'incomplete', include_metadata = true } = args;

      if (timeframe === 'today') {
        // Use CLI's tasks daily shortcut
        try {
          const opts = {};
          if (filter === 'incomplete') opts.todo = true;
          if (filter === 'completed') opts.done = true;
          const cliTasks = await this.cli.tasksDaily(opts);
          const tasks = cliTasks
            .filter(t => t.text.trim() !== '- [ ]')
            .map(t => this.cliTaskToInternal(t));

          if (tasks.length === 0) {
            return {
              content: [{ type: 'text', text: 'No actionable items for today.' }],
            };
          }

          let responseText = `# Actionable Items: Today\n\n`;
          responseText += `**Tasks:** ${tasks.length}\n\n`;
          for (const task of tasks) {
            responseText += `${task.rawLine}\n`;
          }
          return { content: [{ type: 'text', text: responseText }] };
        } catch {
          return {
            content: [{ type: 'text', text: 'No daily note found for today. No actionable items.' }],
          };
        }
      }

      // For 'this_week' or 'custom', use date range approach
      let startDate, endDate;
      if (timeframe === 'this_week') {
        startDate = this.getStartOfWeek(new Date());
        endDate = this.getEndOfWeek(new Date());
      } else if (timeframe === 'custom' && custom_date) {
        const date = new Date(custom_date + 'T12:00:00');
        startDate = new Date(date); startDate.setHours(0, 0, 0, 0);
        endDate = new Date(date); endDate.setHours(23, 59, 59, 999);
      } else {
        throw new McpError(ErrorCode.InvalidRequest, 'Invalid timeframe or missing custom_date.');
      }

      const dailyNotes = await this.findDailyNotesInRange(startDate, endDate);
      if (dailyNotes.length === 0) {
        return {
          content: [{ type: 'text', text: `No daily notes found for ${timeframe.replace(/_/g, ' ')}.` }],
        };
      }

      let allTasks = await this.extractTasksFromFiles(dailyNotes.map(n => n.fullPath));

      if (filter === 'incomplete') allTasks = allTasks.filter(t => !t.completed);
      else if (filter === 'completed') allTasks = allTasks.filter(t => t.completed);

      if (allTasks.length === 0) {
        return {
          content: [{ type: 'text', text: `No ${filter !== 'all' ? filter + ' ' : ''}actionable items for ${timeframe.replace(/_/g, ' ')}.` }],
        };
      }

      let responseText = `# Actionable Items: ${timeframe.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}\n\n`;
      responseText += `**Period:** ${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}\n`;
      responseText += `**Tasks:** ${allTasks.length}\n\n`;

      const grouped = this.groupTasksBySource(allTasks);
      for (const filename of Object.keys(grouped).sort()) {
        responseText += `## ${filename.replace('.md', '')}\n\n`;
        for (const task of grouped[filename]) {
          responseText += `${task.rawLine}\n`;
        }
        responseText += '\n';
      }

      return { content: [{ type: 'text', text: responseText }] };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to get actionable items: ${error.message}`);
    }
  }

  async writeTodosToToday(args) {
    try {
      const {
        obsidian_tasks = [],
        linear_tickets = [],
        strategy = 'replace',
      } = args;

      // Use CLI to get today's note path and content
      const dailyPath = await this.cli.dailyPath();
      let content;
      try {
        content = await this.cli.dailyRead();
      } catch {
        // Daily note doesn't exist — create it
        await this.cli.exec(['daily']);
        content = await this.cli.dailyRead();
      }

      // Generate and insert TODO content
      const todoContent = this.generateTodoContent(obsidian_tasks, linear_tickets);
      const updatedContent = this.updateNoteWithTodoContent(content, todoContent, strategy);

      // Write back using CLI create with overwrite
      await this.cli.createFile(dailyPath, updatedContent, { overwrite: true });

      const taskCount = obsidian_tasks.length + linear_tickets.length;
      return {
        content: [{
          type: 'text',
          text: `Updated TODO section in today's note (${dailyPath}).\n\n**Obsidian Tasks:** ${obsidian_tasks.length}\n**Linear Tickets:** ${linear_tickets.length}\n**Total Items:** ${taskCount}`,
        }],
      };
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(ErrorCode.InternalError, `Failed to write todos: ${error.message}`);
    }
  }

  // ===== Date Calculation Helpers =====

  getStartOfWeek(date) {
    const result = new Date(date);
    const day = result.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    result.setDate(result.getDate() + diff);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  getEndOfWeek(date) {
    const result = new Date(date);
    const day = result.getDay();
    const diff = day === 0 ? 0 : 7 - day;
    result.setDate(result.getDate() + diff);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  getStartOfMonth(date) {
    const result = new Date(date);
    result.setDate(1);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  getEndOfMonth(date) {
    const result = new Date(date);
    result.setMonth(result.getMonth() + 1);
    result.setDate(0);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  getStartOfYear(date) {
    const result = new Date(date);
    result.setMonth(0);
    result.setDate(1);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  getEndOfYear(date) {
    const result = new Date(date);
    result.setMonth(11);
    result.setDate(31);
    result.setHours(23, 59, 59, 999);
    return result;
  }

  getMonthName(date) {
    return date.toLocaleString('en-US', { month: 'long' });
  }

  formatDateStr(date) {
    return date.toISOString().split('T')[0];
  }

  calculatePeriodDateRange(period, customStartDate = null, customEndDate = null, referenceDate = new Date()) {
    let startDate, endDate;

    switch (period) {
      case 'current_week':
        startDate = this.getStartOfWeek(referenceDate);
        endDate = this.getEndOfWeek(referenceDate);
        break;

      case 'last_week': {
        const lastWeekDate = new Date(referenceDate);
        lastWeekDate.setDate(lastWeekDate.getDate() - 7);
        startDate = this.getStartOfWeek(lastWeekDate);
        endDate = this.getEndOfWeek(lastWeekDate);
        break;
      }

      case 'current_month':
        startDate = this.getStartOfMonth(referenceDate);
        endDate = this.getEndOfMonth(referenceDate);
        break;

      case 'last_month': {
        const lastMonthDate = new Date(referenceDate);
        lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
        startDate = this.getStartOfMonth(lastMonthDate);
        endDate = this.getEndOfMonth(lastMonthDate);
        break;
      }

      case 'current_year':
        startDate = this.getStartOfYear(referenceDate);
        endDate = this.getEndOfYear(referenceDate);
        break;

      case 'last_year': {
        const lastYearDate = new Date(referenceDate);
        lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);
        startDate = this.getStartOfYear(lastYearDate);
        endDate = this.getEndOfYear(lastYearDate);
        break;
      }

      case 'custom':
        if (!customStartDate || !customEndDate) {
          throw new Error('custom_start_date and custom_end_date are required for custom period');
        }
        startDate = new Date(customStartDate);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(customEndDate);
        endDate.setHours(23, 59, 59, 999);

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          throw new Error('Invalid date format. Please use ISO format (YYYY-MM-DD)');
        }

        if (startDate > endDate) {
          throw new Error('custom_start_date must be before or equal to custom_end_date');
        }
        break;

      default:
        throw new Error(`Invalid period: ${period}`);
    }

    return { startDate, endDate };
  }

  // ===== Shared Helpers =====

  groupTasksBySource(tasks) {
    const grouped = {};
    for (const task of tasks) {
      const filename = task.sourceFile;
      if (!grouped[filename]) {
        grouped[filename] = [];
      }
      grouped[filename].push(task);
    }
    return grouped;
  }

  generateTaskSummaryMarkdown(completedTasks, incompleteTasks, options = {}) {
    const { groupByDate = false, showSource = false } = options;

    let markdown = '# Task Summary\n\n';
    markdown += `**Generated:** ${new Date().toISOString()}\n\n`;
    markdown += '## Overview\n\n';
    markdown += `- **Total Tasks:** ${completedTasks.length + incompleteTasks.length}\n`;
    markdown += `- **Completed:** ${completedTasks.length}\n`;
    markdown += `- **Incomplete:** ${incompleteTasks.length}\n\n`;

    if (incompleteTasks.length > 0) {
      markdown += `## Todo (${incompleteTasks.length})\n\n`;

      if (groupByDate) {
        const grouped = this.groupTasksBySource(incompleteTasks);
        const sortedFiles = Object.keys(grouped).sort();

        for (const filename of sortedFiles) {
          markdown += `### ${filename.replace('.md', '')}\n\n`;
          for (const task of grouped[filename]) {
            markdown += `${task.rawLine}\n`;
          }
          markdown += '\n';
        }
      } else {
        for (const task of incompleteTasks) {
          if (showSource) {
            markdown += `${task.rawLine} _(${task.sourceFile})_\n`;
          } else {
            markdown += `${task.rawLine}\n`;
          }
        }
        markdown += '\n';
      }
    }

    if (completedTasks.length > 0) {
      markdown += `## Completed (${completedTasks.length})\n\n`;

      if (groupByDate) {
        const grouped = this.groupTasksBySource(completedTasks);
        const sortedFiles = Object.keys(grouped).sort();

        for (const filename of sortedFiles) {
          markdown += `### ${filename.replace('.md', '')}\n\n`;
          for (const task of grouped[filename]) {
            markdown += `${task.rawLine}\n`;
          }
          markdown += '\n';
        }
      } else {
        for (const task of completedTasks) {
          if (showSource) {
            markdown += `${task.rawLine} _(${task.sourceFile})_\n`;
          } else {
            markdown += `${task.rawLine}\n`;
          }
        }
        markdown += '\n';
      }
    }

    return markdown;
  }

  parseDateRangeArgs(args) {
    let startDate, endDate;
    const today = new Date();

    if (args.start_date) {
      startDate = new Date(args.start_date);
      startDate.setHours(0, 0, 0, 0);
      if (isNaN(startDate.getTime())) {
        throw new McpError(ErrorCode.InvalidRequest, 'Invalid start_date format. Use YYYY-MM-DD.');
      }
    } else {
      startDate = this.getStartOfWeek(today);
    }

    if (args.end_date) {
      endDate = new Date(args.end_date);
      endDate.setHours(23, 59, 59, 999);
      if (isNaN(endDate.getTime())) {
        throw new McpError(ErrorCode.InvalidRequest, 'Invalid end_date format. Use YYYY-MM-DD.');
      }
    } else {
      endDate = this.getEndOfWeek(today);
    }

    if (startDate > endDate) {
      throw new McpError(ErrorCode.InvalidRequest, 'start_date must be before or equal to end_date.');
    }

    return { startDate, endDate };
  }

  // ===== TODO Section Helpers =====

  findTodoSection(content) {
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '## TODO') {
        let endIdx = lines.length;
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].startsWith('## ')) {
            endIdx = j;
            break;
          }
        }

        return {
          startLine: i,
          endLine: endIdx,
          content: lines.slice(i, endIdx).join('\n')
        };
      }
    }

    return null;
  }

  findGeneratedMarkers(content) {
    const startMarker = '<!-- START TODO GENERATED -->';
    const endMarker = '<!-- END TODO GENERATED -->';

    const startIdx = content.indexOf(startMarker);
    if (startIdx === -1) return null;

    const endIdx = content.indexOf(endMarker, startIdx);
    if (endIdx === -1) return null;

    return {
      start: startIdx,
      end: endIdx + endMarker.length
    };
  }

  getPriorityEmoji(priority) {
    const emojiMap = {
      0: '\uD83D\uDD34 ',
      1: '\uD83D\uDFE0 ',
      2: '\uD83D\uDFE1 ',
      3: '\uD83D\uDD35 ',
      4: '\u26AA '
    };
    return emojiMap[priority] || '';
  }

  generateTodoContent(obsidianTasks = [], linearTickets = []) {
    const now = new Date();
    const timestamp = now.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });

    const lines = [
      '<!-- START TODO GENERATED -->',
      '',
      `_Last updated: ${timestamp} by Claude_`,
      ''
    ];

    if (obsidianTasks && obsidianTasks.length > 0) {
      lines.push(`### Obsidian Tasks (${obsidianTasks.length})`);
      lines.push('');
      for (const task of obsidianTasks) {
        const noteName = path.basename(task.file || '', '.md');
        const taskText = task.text || '';
        if (noteName) {
          lines.push(`- [ ] ${taskText} [[${noteName}]]`);
        } else {
          lines.push(`- [ ] ${taskText}`);
        }
      }
      lines.push('');
    }

    if (linearTickets && linearTickets.length > 0) {
      lines.push(`### Linear Tickets (${linearTickets.length})`);
      lines.push('');
      for (const ticket of linearTickets) {
        const emoji = this.getPriorityEmoji(ticket.priority);
        const identifier = ticket.identifier || '';
        const title = ticket.title || '';
        const state = ticket.state || '';
        const url = ticket.url || '';

        lines.push(`- [ ] ${emoji}**${identifier}** - ${title} (${state}) [\u2192](${url})`);
      }
      lines.push('');
    }

    if ((!obsidianTasks || obsidianTasks.length === 0) &&
        (!linearTickets || linearTickets.length === 0)) {
      lines.push('_No actionable items found._');
      lines.push('');
    }

    lines.push('<!-- END TODO GENERATED -->');

    return lines.join('\n');
  }

  updateNoteWithTodoContent(content, newContent) {
    const lines = content.split('\n');
    const todoSection = this.findTodoSection(content);

    if (!todoSection) {
      let insertIdx = 1;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('# ')) {
          insertIdx = i + 1;
          break;
        }
      }

      lines.splice(insertIdx, 0, '', '## TODO', '', newContent, '');
      return lines.join('\n');
    }

    const sectionContent = todoSection.content;
    const markers = this.findGeneratedMarkers(sectionContent);

    if (markers) {
      const beforeMarkers = sectionContent.substring(0, markers.start);
      const afterMarkers = sectionContent.substring(markers.end);
      const updatedSection = beforeMarkers + newContent + afterMarkers;

      const before = lines.slice(0, todoSection.startLine).join('\n');
      const after = lines.slice(todoSection.endLine).join('\n');
      return before + '\n' + updatedSection + '\n' + after;
    } else {
      const insertLine = todoSection.endLine;
      lines.splice(insertLine, 0, '', newContent);
      return lines.join('\n');
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Obsidian MCP server running on stdio');
  }
}

const server = new ObsidianMCPServer();
server.run().catch(console.error);
