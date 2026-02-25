#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Obsidian vault root - points to iCloud Obsidian vault
const VAULT_ROOT = path.resolve('/Users/barath/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes');

// Default working path for daily notes (Farther/current year)
const FARTHER_ROOT = path.join(VAULT_ROOT, 'Farther');

class ObsidianMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'obsidian-vault-server',
        version: '0.2.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'read_note',
            description: 'Read the contents of a specific note file. Daily notes are stored at Farther/YYYY/MonthName/YYYY-MM-DD.md (e.g., Farther/2026/February/2026-02-24.md). You can also pass just a date like "2026-02-24" and it will auto-resolve to the correct path.',
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
            description: 'Search for notes containing specific text. Defaults to searching under Farther/ directory.',
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
            description: 'List all notes or notes in a specific folder. Defaults to Farther/ directory.',
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
            description: 'Get notes modified within a specified time period. Defaults to Farther/ directory.',
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
        throw new McpError(ErrorCode.InternalError, `Error executing ${name}: ${error.message}`);
      }
    });
  }

  // ===== Core Note Operations =====

  async readNote(filePath) {
    // Check if filePath is a bare date (YYYY-MM-DD) — auto-resolve to daily note
    const dateMatch = filePath.match(/^(\d{4}-\d{2}-\d{2})(?:\.md)?$/);
    if (dateMatch) {
      const date = new Date(dateMatch[1] + 'T12:00:00');
      if (!isNaN(date.getTime())) {
        const resolved = await this.resolveDailyNotePath(date);
        if (resolved) {
          const content = await fs.readFile(resolved.fullPath, 'utf-8');
          const stats = await fs.stat(resolved.fullPath);
          return {
            content: [
              {
                type: 'text',
                text: `# ${path.basename(resolved.fullPath)}\n\nPath: ${resolved.relativePath}\nLast modified: ${stats.mtime.toISOString()}\n\n${content}`,
              },
            ],
          };
        }
        throw new Error(`No daily note found for date: ${dateMatch[1]}. Expected at Farther/${date.getFullYear()}/${this.getMonthName(date)}/${dateMatch[1]}.md`);
      }
    }

    const fullPath = this.resolvePath(filePath);
    await this.validatePath(fullPath);

    try {
      const content = await fs.readFile(fullPath, 'utf-8');
      const stats = await fs.stat(fullPath);

      return {
        content: [
          {
            type: 'text',
            text: `# ${path.basename(filePath)}\n\nLast modified: ${stats.mtime.toISOString()}\n\n${content}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  async writeNote(filePath, content, createFolders = true, appendMode = true) {
    const fullPath = this.resolvePath(filePath);
    await this.validatePath(fullPath);

    try {
      if (createFolders) {
        const dirPath = path.dirname(fullPath);
        await fs.mkdir(dirPath, { recursive: true });
      }

      if (appendMode) {
        try {
          await fs.access(fullPath);
          const existingContent = await fs.readFile(fullPath, 'utf-8');
          await fs.writeFile(fullPath, existingContent + content, 'utf-8');
        } catch (error) {
          await fs.writeFile(fullPath, content, 'utf-8');
        }
      } else {
        await fs.writeFile(fullPath, content, 'utf-8');
      }

      const stats = await fs.stat(fullPath);

      return {
        content: [
          {
            type: 'text',
            text: `Successfully ${appendMode ? 'appended to' : 'wrote to'} ${filePath}\n\nFile size: ${stats.size} bytes\nLast modified: ${stats.mtime.toISOString()}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to write file: ${error.message}`);
    }
  }

  async searchNotes(query, folderPath = '') {
    const searchPath = folderPath ? this.resolvePath(folderPath) : FARTHER_ROOT;
    await this.validatePath(searchPath);

    const results = [];
    await this.searchInDirectory(searchPath, query.toLowerCase(), results);

    return {
      content: [
        {
          type: 'text',
          text: `Found ${results.length} notes containing "${query}":\n\n${results
            .map(
              (result) =>
                `**${result.relativePath}**\n${result.matches
                  .map((match) => `- ${match}`)
                  .join('\n')}\n`
            )
            .join('\n')}`,
        },
      ],
    };
  }

  async searchInDirectory(dirPath, query, results) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.searchInDirectory(fullPath, query, results);
      } else if (entry.name.endsWith('.md')) {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          const matches = [];

          lines.forEach((line, index) => {
            if (line.toLowerCase().includes(query)) {
              matches.push(`Line ${index + 1}: ${line.trim()}`);
            }
          });

          if (matches.length > 0) {
            results.push({
              relativePath: path.relative(VAULT_ROOT, fullPath),
              matches: matches.slice(0, 5),
            });
          }
        } catch (error) {
          continue;
        }
      }
    }
  }

  async listNotes(folderPath = '', recursive = true) {
    const searchPath = folderPath ? this.resolvePath(folderPath) : FARTHER_ROOT;
    await this.validatePath(searchPath);

    const notes = [];
    await this.collectNotes(searchPath, notes, recursive);

    return {
      content: [
        {
          type: 'text',
          text: `Found ${notes.length} notes:\n\n${notes
            .map((note) => `- ${note.relativePath} (${note.lastModified})`)
            .join('\n')}`,
        },
      ],
    };
  }

  async collectNotes(dirPath, notes, recursive) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory() && recursive) {
        await this.collectNotes(fullPath, notes, recursive);
      } else if (entry.name.endsWith('.md')) {
        try {
          const stats = await fs.stat(fullPath);
          notes.push({
            relativePath: path.relative(VAULT_ROOT, fullPath),
            lastModified: stats.mtime.toISOString().split('T')[0],
          });
        } catch (error) {
          continue;
        }
      }
    }
  }

  async getRecentNotes(days, folderPath = '') {
    const searchPath = folderPath ? this.resolvePath(folderPath) : FARTHER_ROOT;
    await this.validatePath(searchPath);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentNotes = [];
    await this.collectRecentNotes(searchPath, cutoffDate, recentNotes);

    recentNotes.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    return {
      content: [
        {
          type: 'text',
          text: `Found ${recentNotes.length} notes modified in the last ${days} days:\n\n${recentNotes
            .map((note) => `- **${note.relativePath}** (${note.lastModified})`)
            .join('\n')}`,
        },
      ],
    };
  }

  async collectRecentNotes(dirPath, cutoffDate, notes) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        await this.collectRecentNotes(fullPath, cutoffDate, notes);
      } else if (entry.name.endsWith('.md')) {
        try {
          const stats = await fs.stat(fullPath);
          if (stats.mtime > cutoffDate) {
            notes.push({
              relativePath: path.relative(VAULT_ROOT, fullPath),
              lastModified: stats.mtime.toISOString(),
            });
          }
        } catch (error) {
          continue;
        }
      }
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

    await this.analyzeDirectory(FARTHER_ROOT, cutoffDate, trends, keyword);

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
      content: [
        {
          type: 'text',
          text: analysisText,
        },
      ],
    };
  }

  async analyzeDirectory(dirPath, cutoffDate, trends, keyword) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          await this.analyzeDirectory(fullPath, cutoffDate, trends, keyword);
        } else if (entry.name.endsWith('.md')) {
          try {
            const stats = await fs.stat(fullPath);
            if (stats.mtime > cutoffDate) {
              trends.totalNotes++;

              const date = stats.mtime.toISOString().split('T')[0];
              trends.dailyActivity[date] = (trends.dailyActivity[date] || 0) + 1;

              const content = await fs.readFile(fullPath, 'utf-8');

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
          } catch (error) {
            continue;
          }
        }
      }
    } catch (error) {
      return;
    }
  }

  // ===== Date Calculation Helper Methods =====

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

  /**
   * Resolve a date to its daily note file path, supporting both layouts:
   *   New (Nov 2025+): Farther/YYYY/MonthName/YYYY-MM-DD.md
   *   Old (pre-Nov 2025): Farther/YYYY/MonthName/Week .../YYYY-MM-DD.md
   */
  async resolveDailyNotePath(date) {
    const dateStr = this.formatDateStr(date);
    const year = date.getFullYear().toString();
    const monthName = this.getMonthName(date);

    // Try new flat layout first: Farther/YYYY/MonthName/YYYY-MM-DD.md
    const flatPath = this.resolvePath(`Notes/Farther/${year}/${monthName}/${dateStr}.md`);
    try {
      await fs.access(flatPath);
      return {
        fullPath: flatPath,
        relativePath: `Farther/${year}/${monthName}/${dateStr}.md`
      };
    } catch (e) {
      // Not found in flat layout, try week-folder layout
    }

    // Try old week-folder layout: Farther/YYYY/MonthName/Week .../YYYY-MM-DD.md
    const monthDir = this.resolvePath(`Notes/Farther/${year}/${monthName}`);
    try {
      const entries = await fs.readdir(monthDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('Week ')) {
          const weekNotePath = path.join(monthDir, entry.name, `${dateStr}.md`);
          try {
            await fs.access(weekNotePath);
            return {
              fullPath: weekNotePath,
              relativePath: `Farther/${year}/${monthName}/${entry.name}/${dateStr}.md`
            };
          } catch (e) {
            // Not in this week folder, continue
          }
        }
      }
    } catch (e) {
      // Month directory doesn't exist
    }

    return null;
  }

  /**
   * Find all daily notes (YYYY-MM-DD.md) within a date range,
   * scanning both flat and week-folder layouts under Farther/YYYY/MonthName/.
   */
  async findDailyNotesInRange(startDate, endDate) {
    const results = [];
    const fartherPath = this.resolvePath('Notes/Farther');

    // Determine which year/month combos to scan
    const current = new Date(startDate);
    current.setDate(1);
    const endMonth = new Date(endDate);
    endMonth.setDate(1);

    const monthsToScan = [];
    while (current <= endMonth) {
      monthsToScan.push({
        year: current.getFullYear().toString(),
        monthName: this.getMonthName(current)
      });
      current.setMonth(current.getMonth() + 1);
    }

    const datePattern = /^\d{4}-\d{2}-\d{2}\.md$/;

    for (const { year, monthName } of monthsToScan) {
      const monthDir = path.join(fartherPath, year, monthName);

      try {
        const entries = await fs.readdir(monthDir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isFile() && datePattern.test(entry.name)) {
            // New flat layout: YYYY-MM-DD.md directly in month dir
            const dateStr = entry.name.replace('.md', '');
            const noteDate = new Date(dateStr + 'T12:00:00');
            if (noteDate >= startDate && noteDate <= endDate) {
              results.push({
                date: noteDate,
                dateStr,
                fullPath: path.join(monthDir, entry.name)
              });
            }
          } else if (entry.isDirectory() && entry.name.startsWith('Week ')) {
            // Old week-folder layout: scan inside for YYYY-MM-DD.md files
            const weekDir = path.join(monthDir, entry.name);
            try {
              const weekEntries = await fs.readdir(weekDir, { withFileTypes: true });
              for (const weekEntry of weekEntries) {
                if (weekEntry.isFile() && datePattern.test(weekEntry.name)) {
                  const dateStr = weekEntry.name.replace('.md', '');
                  const noteDate = new Date(dateStr + 'T12:00:00');
                  if (noteDate >= startDate && noteDate <= endDate) {
                    results.push({
                      date: noteDate,
                      dateStr,
                      fullPath: path.join(weekDir, weekEntry.name)
                    });
                  }
                }
              }
            } catch (e) {
              // Skip unreadable week folders
            }
          }
        }
      } catch (e) {
        // Month directory doesn't exist, skip
      }
    }

    results.sort((a, b) => a.date - b.date);
    return results;
  }

  /**
   * Calculate date range for a named period
   */
  calculatePeriodDateRange(period, customStartDate = null, customEndDate = null, referenceDate = new Date()) {
    let startDate, endDate;

    switch (period) {
      case 'current_week':
        startDate = this.getStartOfWeek(referenceDate);
        endDate = this.getEndOfWeek(referenceDate);
        break;

      case 'last_week':
        const lastWeekDate = new Date(referenceDate);
        lastWeekDate.setDate(lastWeekDate.getDate() - 7);
        startDate = this.getStartOfWeek(lastWeekDate);
        endDate = this.getEndOfWeek(lastWeekDate);
        break;

      case 'current_month':
        startDate = this.getStartOfMonth(referenceDate);
        endDate = this.getEndOfMonth(referenceDate);
        break;

      case 'last_month':
        const lastMonthDate = new Date(referenceDate);
        lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
        startDate = this.getStartOfMonth(lastMonthDate);
        endDate = this.getEndOfMonth(lastMonthDate);
        break;

      case 'current_year':
        startDate = this.getStartOfYear(referenceDate);
        endDate = this.getEndOfYear(referenceDate);
        break;

      case 'last_year':
        const lastYearDate = new Date(referenceDate);
        lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);
        startDate = this.getStartOfYear(lastYearDate);
        endDate = this.getEndOfYear(lastYearDate);
        break;

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

  // ===== Task Parsing Helpers =====

  parseTask(line, sourceFile) {
    const taskMatch = line.match(/^-\s+\[([ xX])\]\s+(.+)$/);
    if (!taskMatch) {
      return null;
    }

    const completed = taskMatch[1].toLowerCase() === 'x';
    const text = taskMatch[2];

    const timestampMatch = text.match(/\u2705\s+(\d{4}-\d{2}-\d{2})/);
    const timestamp = timestampMatch ? timestampMatch[1] : null;

    return {
      completed,
      text,
      rawLine: line,
      sourceFile,
      timestamp,
    };
  }

  async extractTasksFromFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');
      const sourceFile = path.basename(filePath);
      const tasks = [];

      for (const line of lines) {
        const task = this.parseTask(line.trim(), sourceFile);
        if (task) {
          tasks.push(task);
        }
      }

      return tasks;
    } catch (error) {
      return [];
    }
  }

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

  // ===== Tool Handlers =====

  /**
   * Parse optional start_date/end_date from args, defaulting to current week
   */
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

  /**
   * Handle extract_tasks tool
   */
  async extractTasks(args) {
    try {
      const { startDate, endDate } = this.parseDateRangeArgs(args);
      const dailyNotes = await this.findDailyNotesInRange(startDate, endDate);

      if (dailyNotes.length === 0) {
        return {
          content: [{ type: 'text', text: `No daily notes found for ${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}.` }],
        };
      }

      const completedTasks = [];
      const incompleteTasks = [];

      for (const note of dailyNotes) {
        const tasks = await this.extractTasksFromFile(note.fullPath);
        for (const task of tasks) {
          if (task.completed) {
            completedTasks.push(task);
          } else {
            incompleteTasks.push(task);
          }
        }
      }

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
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(ErrorCode.InternalError, `Failed to extract tasks: ${error.message}`);
    }
  }

  /**
   * Handle generate_task_summary tool
   */
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

      const completedTasks = [];
      const incompleteTasks = [];

      for (const note of dailyNotes) {
        const tasks = await this.extractTasksFromFile(note.fullPath);
        for (const task of tasks) {
          if (task.completed) {
            completedTasks.push(task);
          } else {
            incompleteTasks.push(task);
          }
        }
      }

      if (completedTasks.length === 0 && incompleteTasks.length === 0) {
        return {
          content: [{ type: 'text', text: `No tasks found for ${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}. Cannot generate summary.` }],
        };
      }

      const markdown = this.generateTaskSummaryMarkdown(completedTasks, incompleteTasks, options);
      const today = new Date();
      const year = today.getFullYear().toString();
      const monthName = this.getMonthName(today);
      const monthDir = this.resolvePath(`Notes/Farther/${year}/${monthName}`);
      await fs.mkdir(monthDir, { recursive: true });

      const outputPath = path.join(monthDir, filename);
      await fs.writeFile(outputPath, markdown, 'utf-8');
      const stats = await fs.stat(outputPath);
      const relativePath = path.relative(VAULT_ROOT, outputPath);

      return {
        content: [{
          type: 'text',
          text: `Task summary generated successfully!\n\n**File:** ${relativePath}\n**Period:** ${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}\n**Total Tasks:** ${completedTasks.length + incompleteTasks.length}\n**Completed:** ${completedTasks.length}\n**Incomplete:** ${incompleteTasks.length}\n**Size:** ${stats.size} bytes`,
        }],
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(ErrorCode.InternalError, `Failed to generate task summary: ${error.message}`);
    }
  }

  /**
   * Handle aggregate_tasks_by_period tool
   */
  async aggregateTasksByPeriod(args) {
    try {
      const {
        period,
        custom_start_date,
        custom_end_date,
        filter = 'all',
        group_by = 'date'
      } = args;

      const validPeriods = ['current_week', 'last_week', 'current_month', 'last_month', 'current_year', 'last_year', 'custom'];
      if (!validPeriods.includes(period)) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Invalid period: ${period}. Must be one of: ${validPeriods.join(', ')}`
        );
      }

      const validFilters = ['all', 'completed', 'incomplete'];
      if (!validFilters.includes(filter)) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Invalid filter: ${filter}. Must be one of: ${validFilters.join(', ')}`
        );
      }

      const dateRange = this.calculatePeriodDateRange(period, custom_start_date, custom_end_date);
      const { startDate, endDate } = dateRange;

      const dailyNotes = await this.findDailyNotesInRange(startDate, endDate);

      if (dailyNotes.length === 0) {
        const periodName = period.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        return {
          content: [{
            type: 'text',
            text: `No daily notes found for ${periodName} (${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}).`
          }]
        };
      }

      const completedTasks = [];
      const incompleteTasks = [];

      for (const note of dailyNotes) {
        const tasks = await this.extractTasksFromFile(note.fullPath);
        for (const task of tasks) {
          const enrichedTask = { ...task, noteDate: note.dateStr };
          if (task.completed) {
            completedTasks.push(enrichedTask);
          } else {
            incompleteTasks.push(enrichedTask);
          }
        }
      }

      let tasksForDisplay;
      switch (filter) {
        case 'completed':
          tasksForDisplay = { completed: completedTasks, incomplete: [] };
          break;
        case 'incomplete':
          tasksForDisplay = { completed: [], incomplete: incompleteTasks };
          break;
        case 'all':
        default:
          tasksForDisplay = { completed: completedTasks, incomplete: incompleteTasks };
          break;
      }

      const periodName = period.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      const totalTasks = tasksForDisplay.completed.length + tasksForDisplay.incomplete.length;

      let text = `# Task Aggregation: ${periodName}\n\n`;
      text += `**Period:** ${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}\n`;
      text += `**Total Tasks:** ${totalTasks}\n`;
      text += `**Completed:** ${tasksForDisplay.completed.length}\n`;
      text += `**Incomplete:** ${tasksForDisplay.incomplete.length}\n`;
      text += `**Notes Analyzed:** ${dailyNotes.length}\n\n`;
      text += '---\n\n';

      if (group_by === 'date') {
        // Group tasks by their source date
        const allTasks = [...tasksForDisplay.incomplete, ...tasksForDisplay.completed];
        const byDate = {};
        for (const task of allTasks) {
          const dateKey = task.noteDate;
          if (!byDate[dateKey]) {
            byDate[dateKey] = { completed: [], incomplete: [] };
          }
          if (task.completed) {
            byDate[dateKey].completed.push(task);
          } else {
            byDate[dateKey].incomplete.push(task);
          }
        }

        const sortedDates = Object.keys(byDate).sort();
        for (const dateKey of sortedDates) {
          const dateTasks = byDate[dateKey];
          text += `## ${dateKey}\n\n`;
          if (dateTasks.incomplete.length > 0) {
            text += `### Incomplete (${dateTasks.incomplete.length})\n\n`;
            for (const task of dateTasks.incomplete) {
              text += `${task.rawLine} _(${task.sourceFile})_\n`;
            }
            text += '\n';
          }
          if (dateTasks.completed.length > 0) {
            text += `### Completed (${dateTasks.completed.length})\n\n`;
            for (const task of dateTasks.completed) {
              text += `${task.rawLine} _(${task.sourceFile})_\n`;
            }
            text += '\n';
          }
          text += '---\n\n';
        }
      } else {
        // Flat list
        if (tasksForDisplay.incomplete.length > 0) {
          text += `## Incomplete Tasks (${tasksForDisplay.incomplete.length})\n\n`;
          for (const task of tasksForDisplay.incomplete) {
            text += `${task.rawLine} _(${task.sourceFile} - ${task.noteDate})_\n`;
          }
          text += '\n---\n\n';
        }
        if (tasksForDisplay.completed.length > 0) {
          text += `## Completed Tasks (${tasksForDisplay.completed.length})\n\n`;
          for (const task of tasksForDisplay.completed) {
            text += `${task.rawLine} _(${task.sourceFile} - ${task.noteDate})_\n`;
          }
          text += '\n';
        }
      }

      return {
        content: [{
          type: 'text',
          text
        }]
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to aggregate tasks by period: ${error.message}`
      );
    }
  }

  /**
   * Handle create_period_rollover_summary tool
   */
  async createPeriodRolloverSummary(args) {
    try {
      const {
        source_period,
        include_completed = true,
        filename = 'Task-Rollover.md',
      } = args;

      const validPeriods = ['last_week', 'last_month', 'last_year'];
      if (!validPeriods.includes(source_period)) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `Invalid source_period: ${source_period}. Must be one of: ${validPeriods.join(', ')}`
        );
      }

      const { startDate, endDate } = this.calculatePeriodDateRange(source_period);
      const dailyNotes = await this.findDailyNotesInRange(startDate, endDate);

      if (dailyNotes.length === 0) {
        throw new McpError(
          ErrorCode.InvalidRequest,
          `No daily notes found for ${source_period} (${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}). Cannot create rollover summary.`
        );
      }

      let totalCompleted = 0;
      let totalIncomplete = 0;
      const allIncompleteTasks = [];
      const allCompletedTasks = [];

      for (const note of dailyNotes) {
        const tasks = await this.extractTasksFromFile(note.fullPath);
        for (const task of tasks) {
          if (task.completed) {
            totalCompleted++;
            allCompletedTasks.push({ ...task, noteDate: note.dateStr });
          } else {
            totalIncomplete++;
            allIncompleteTasks.push({ ...task, noteDate: note.dateStr });
          }
        }
      }

      let rolloverMarkdown = `# Task Rollover: ${source_period.replace('_', ' ')}\n\n`;
      rolloverMarkdown += `**Source Period:** ${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}\n`;
      rolloverMarkdown += `**Generated:** ${new Date().toISOString()}\n`;
      rolloverMarkdown += `**Notes Analyzed:** ${dailyNotes.length}\n`;
      rolloverMarkdown += `**Total Tasks:** ${totalCompleted + totalIncomplete}\n`;
      rolloverMarkdown += `**Incomplete (to roll over):** ${totalIncomplete}\n`;
      rolloverMarkdown += `**Completed:** ${totalCompleted}\n\n`;
      rolloverMarkdown += '---\n\n';

      if (allIncompleteTasks.length > 0) {
        rolloverMarkdown += `## Tasks to Roll Over (${allIncompleteTasks.length})\n\n`;
        for (const task of allIncompleteTasks) {
          rolloverMarkdown += `${task.rawLine} _(${task.sourceFile} - ${task.noteDate})_\n`;
        }
        rolloverMarkdown += '\n';
      }

      if (include_completed && allCompletedTasks.length > 0) {
        rolloverMarkdown += `## Completed Tasks (${allCompletedTasks.length})\n\n`;
        for (const task of allCompletedTasks) {
          rolloverMarkdown += `${task.rawLine} _(${task.sourceFile} - ${task.noteDate})_\n`;
        }
        rolloverMarkdown += '\n';
      }

      const today = new Date();
      const year = today.getFullYear().toString();
      const monthName = this.getMonthName(today);
      const monthDir = this.resolvePath(`Notes/Farther/${year}/${monthName}`);
      await fs.mkdir(monthDir, { recursive: true });

      const outputPath = path.join(monthDir, filename);
      await fs.writeFile(outputPath, rolloverMarkdown, 'utf-8');
      const stats = await fs.stat(outputPath);

      const relativePath = path.relative(VAULT_ROOT, outputPath);

      return {
        content: [
          {
            type: 'text',
            text: `Task rollover summary created successfully!\n\n**File:** ${relativePath}\n**Source Period:** ${source_period.replace('_', ' ')}\n**Date Range:** ${this.formatDateStr(startDate)} to ${this.formatDateStr(endDate)}\n**Notes Analyzed:** ${dailyNotes.length}\n**Total Tasks from Period:** ${totalCompleted + totalIncomplete}\n**Tasks to Roll Over:** ${totalIncomplete} (incomplete)\n**Completed Tasks:** ${totalCompleted}\n**File Size:** ${stats.size} bytes`,
          },
        ],
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(ErrorCode.InternalError, `Failed to create period rollover summary: ${error.message}`);
    }
  }

  // ===== Actionable Items Methods =====

  async getTodayTasks(targetDate = new Date(), filter = 'incomplete') {
    const dateStr = this.formatDateStr(targetDate);
    const resolved = await this.resolveDailyNotePath(targetDate);

    if (!resolved) {
      return {
        tasks: [],
        metadata: {
          timeframe: 'today',
          date: dateStr,
          source: null,
          error: 'Daily note not found'
        }
      };
    }

    const allTasks = await this.extractTasksFromFile(resolved.fullPath);

    let filteredTasks;
    switch (filter) {
      case 'completed':
        filteredTasks = allTasks.filter(t => t.completed);
        break;
      case 'incomplete':
        filteredTasks = allTasks.filter(t => !t.completed);
        break;
      case 'all':
      default:
        filteredTasks = allTasks;
        break;
    }

    return {
      tasks: filteredTasks,
      metadata: {
        timeframe: 'today',
        date: dateStr,
        source: resolved.relativePath,
        totalTasks: allTasks.length,
        filteredCount: filteredTasks.length,
        completedCount: allTasks.filter(t => t.completed).length,
        incompleteCount: allTasks.filter(t => !t.completed).length
      }
    };
  }

  async getThisWeekTasks(targetDate = new Date(), filter = 'incomplete') {
    const weekStart = this.getStartOfWeek(targetDate);
    const weekEnd = this.getEndOfWeek(targetDate);

    const dailyNotes = await this.findDailyNotesInRange(weekStart, weekEnd);

    if (dailyNotes.length === 0) {
      return {
        tasks: [],
        metadata: {
          timeframe: 'this_week',
          dateRange: {
            start: this.formatDateStr(weekStart),
            end: this.formatDateStr(weekEnd)
          },
          error: 'No daily notes found for this week'
        }
      };
    }

    const completedTasks = [];
    const incompleteTasks = [];

    for (const note of dailyNotes) {
      const tasks = await this.extractTasksFromFile(note.fullPath);
      for (const task of tasks) {
        if (task.completed) {
          completedTasks.push(task);
        } else {
          incompleteTasks.push(task);
        }
      }
    }

    let filteredTasks;
    switch (filter) {
      case 'completed':
        filteredTasks = completedTasks;
        break;
      case 'incomplete':
        filteredTasks = incompleteTasks;
        break;
      case 'all':
      default:
        filteredTasks = [...incompleteTasks, ...completedTasks];
        break;
    }

    return {
      tasks: filteredTasks,
      metadata: {
        timeframe: 'this_week',
        dateRange: {
          start: this.formatDateStr(weekStart),
          end: this.formatDateStr(weekEnd)
        },
        notesFound: dailyNotes.length,
        totalTasks: completedTasks.length + incompleteTasks.length,
        filteredCount: filteredTasks.length,
        completedCount: completedTasks.length,
        incompleteCount: incompleteTasks.length
      }
    };
  }

  async getActionableItemsByTimeframe(timeframe, customDate = null, filter = 'incomplete') {
    const validTimeframes = ['today', 'this_week', 'custom'];
    if (!validTimeframes.includes(timeframe)) {
      throw new Error(`Invalid timeframe: ${timeframe}. Must be one of: ${validTimeframes.join(', ')}`);
    }

    const validFilters = ['all', 'incomplete', 'completed'];
    if (!validFilters.includes(filter)) {
      throw new Error(`Invalid filter: ${filter}. Must be one of: ${validFilters.join(', ')}`);
    }

    if (timeframe === 'custom') {
      if (!customDate) {
        throw new Error('custom_date is required when timeframe is "custom"');
      }
      const targetDate = new Date(customDate);
      if (isNaN(targetDate.getTime())) {
        throw new Error('Invalid custom_date format. Please use ISO format (YYYY-MM-DD)');
      }
      return await this.getTodayTasks(targetDate, filter);
    } else if (timeframe === 'today') {
      return await this.getTodayTasks(new Date(), filter);
    } else if (timeframe === 'this_week') {
      return await this.getThisWeekTasks(new Date(), filter);
    }
  }

  async getMyActionableItems(args) {
    try {
      const { timeframe = 'today', custom_date, filter = 'incomplete', include_metadata = true } = args;

      const result = await this.getActionableItemsByTimeframe(timeframe, custom_date, filter);

      let responseText = '';

      if (result.metadata.error) {
        responseText = `# Actionable Items: ${timeframe.replace('_', ' ')}\n\n`;
        responseText += `**Error:** ${result.metadata.error}\n\n`;
        responseText += `**Date:** ${result.metadata.date || 'Unknown'}\n`;

        if (result.metadata.source) {
          responseText += `**Expected Source:** ${result.metadata.source}\n`;
        }

        return {
          content: [{
            type: 'text',
            text: responseText
          }]
        };
      }

      responseText = `# Actionable Items: ${timeframe.replace('_', ' ')}\n\n`;

      if (include_metadata) {
        if (timeframe === 'today' || timeframe === 'custom') {
          responseText += `**Date:** ${result.metadata.date}\n`;
          responseText += `**Source:** ${result.metadata.source}\n`;
        } else if (timeframe === 'this_week') {
          if (result.metadata.dateRange) {
            responseText += `**Week:** ${result.metadata.dateRange.start} to ${result.metadata.dateRange.end}\n`;
          }
          if (result.metadata.notesFound !== undefined) {
            responseText += `**Notes Found:** ${result.metadata.notesFound}\n`;
          }
        }

        responseText += `**Total Tasks:** ${result.metadata.totalTasks}\n`;
        responseText += `**Filtered Tasks (${filter}):** ${result.metadata.filteredCount}\n`;
        responseText += `**Completed:** ${result.metadata.completedCount}\n`;
        responseText += `**Incomplete:** ${result.metadata.incompleteCount}\n\n`;
        responseText += '---\n\n';
      }

      if (result.tasks.length === 0) {
        responseText += `_No ${filter === 'all' ? '' : filter + ' '}tasks found._\n`;
      } else {
        responseText += `## Tasks (${result.tasks.length})\n\n`;

        if (timeframe === 'this_week') {
          const grouped = this.groupTasksBySource(result.tasks);
          const sortedFiles = Object.keys(grouped).sort();

          for (const filename of sortedFiles) {
            responseText += `### ${filename.replace('.md', '')}\n\n`;
            for (const task of grouped[filename]) {
              responseText += `${task.rawLine}\n`;
            }
            responseText += '\n';
          }
        } else {
          for (const task of result.tasks) {
            responseText += `${task.rawLine}\n`;
          }
        }
      }

      return {
        content: [{
          type: 'text',
          text: responseText
        }]
      };

    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get actionable items: ${error.message}`
      );
    }
  }

  // ===== Write TODOs to Today Methods =====

  async getTodayNotePath() {
    const today = new Date();
    const dateStr = this.formatDateStr(today);

    const resolved = await this.resolveDailyNotePath(today);
    if (resolved) {
      return resolved.fullPath;
    }

    const year = today.getFullYear().toString();
    const monthName = this.getMonthName(today);
    return this.resolvePath(`Notes/Farther/${year}/${monthName}/${dateStr}.md`);
  }

  async ensureDailyNoteExists(notePath) {
    try {
      await fs.access(notePath);
      return false;
    } catch (error) {
      const dirPath = path.dirname(notePath);
      await fs.mkdir(dirPath, { recursive: true });

      const dateStr = path.basename(notePath, '.md');
      const initialContent = `# ${dateStr}\n\n`;
      await fs.writeFile(notePath, initialContent, 'utf-8');

      return true;
    }
  }

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
    if (startIdx === -1) {
      return null;
    }

    const endIdx = content.indexOf(endMarker, startIdx);
    if (endIdx === -1) {
      return null;
    }

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

  async writeTodosToToday(args) {
    try {
      const {
        obsidian_tasks = [],
        linear_tickets = [],
        strategy = 'replace'
      } = args;

      const notePath = await this.getTodayNotePath();
      const wasCreated = await this.ensureDailyNoteExists(notePath);
      const content = await fs.readFile(notePath, 'utf-8');

      const newContent = this.generateTodoContent(obsidian_tasks, linear_tickets);

      const todoSection = this.findTodoSection(content);
      const hadGeneratedContent = todoSection ? this.findGeneratedMarkers(todoSection.content) !== null : false;

      const updatedContent = this.updateNoteWithTodoContent(content, newContent);

      await fs.writeFile(notePath, updatedContent, 'utf-8');

      return {
        content: [{
          type: 'text',
          text: `\u2713 Successfully updated TODO section in today's note!\n\n**File:** ${path.basename(notePath)}\n**Note Created:** ${wasCreated ? 'Yes' : 'No'}\n**TODO Section Existed:** ${todoSection ? 'Yes' : 'No (created)'}\n**Generated Content:** ${hadGeneratedContent ? 'Updated' : 'Added'}\n**Obsidian Tasks:** ${obsidian_tasks.length}\n**Linear Tickets:** ${linear_tickets.length}\n\nThe generated content has been ${hadGeneratedContent ? 'updated' : 'added'} within your TODO section.`
        }]
      };

    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to write TODOs to today's note: ${error.message}`
      );
    }
  }

  // ===== Utility Methods =====

  resolvePath(relativePath) {
    return path.resolve(VAULT_ROOT, relativePath);
  }

  async validatePath(fullPath) {
    const normalizedPath = path.normalize(fullPath);
    const normalizedRoot = path.normalize(VAULT_ROOT);

    if (!normalizedPath.startsWith(normalizedRoot)) {
      throw new Error('Path is outside of vault root');
    }

    try {
      await fs.access(fullPath);
    } catch (error) {
      throw new Error('Path does not exist');
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
