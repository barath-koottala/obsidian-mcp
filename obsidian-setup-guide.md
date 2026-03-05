# Obsidian + MCP Productivity Setup Guide

Hey! This guide will get you set up with Obsidian for daily note-taking and
an MCP server that lets Claude pull your outstanding tasks automatically.
Takes about 15 minutes.

---

## Step 1: Install Obsidian

**macOS (Homebrew):**
```bash
brew install --cask obsidian
```

**macOS (Manual):**
Download from [obsidian.md/download](https://obsidian.md/download) and drag to `/Applications`.

**Verify it installed:**
```bash
open -a Obsidian
```

---

## Step 2: Create Your Vault

You have two options: local-only or iCloud-synced.

### Option A — iCloud (Recommended: syncs to iPhone/iPad automatically)

Your vault will live in iCloud Drive so it syncs across all Apple devices.

1. Open Finder and make sure iCloud Drive is enabled:
   - `System Settings > Apple Account > iCloud > iCloud Drive (ON)`

2. Create the vault folder:
   ```bash
   mkdir -p ~/Library/Mobile\ Documents/iCloud~md~obsidian/Documents/Notes
   ```

3. Open Obsidian > **"Open folder as vault"** > navigate to:
   ```
   ~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes
   ```
   > **Tip:** In the Finder dialog, press `Cmd+Shift+G` and paste the path above.

### Option B — Local only

1. Pick any folder you like, e.g.:
   ```bash
   mkdir -p ~/Documents/ObsidianVault
   ```

2. Open Obsidian > **"Open folder as vault"** > select that folder.

---

## Step 3: Set Up the Daily Note Template

### 3.1 Create a Templates folder

- In Obsidian, click the folder icon (left sidebar) > **New Folder**
- Name it: `Templates`

### 3.2 Create the template file

- Inside `Templates/`, create a new note called **"Main Note"**
- Paste this content exactly:

```markdown
{{date}} {{time}}

Status:

Tags:

#  Notes



# Meetings




# TODO
- [ ]

# Daily Reflection

#reflection
```

### 3.3 Tell Obsidian where your templates live

1. Open **Settings** (gear icon, bottom-left)
2. Under **Core plugins**, make sure **"Templates"** is toggled ON
3. Click the gear icon next to "Templates" and set:
   - **Template folder location:** `Templates`

### 3.4 Enable Daily Notes

1. Settings > **Core plugins** > toggle ON **"Daily notes"**
2. Click the gear next to "Daily notes" and configure:
   - **Date format:** `YYYY-MM-DD`
   - **New file location:** `Farther/{{date:YYYY}}/{{date:MMMM}}`
   - **Template file location:** `Templates/Main Note`

### 3.5 Create the folder structure

In Obsidian, create these folders:
- `Farther` at the vault root
- `Farther/2026`
- Month folders inside as needed (e.g. `Farther/2026/February`)

Or from terminal:
```bash
VAULT="<your-vault-path>"
mkdir -p "$VAULT/Farther/2026"/{January,February,March,April,May,June,July,August,September,October,November,December}
```

---

## Step 4: Daily Workflow

### Creating your note for the day

1. Open Obsidian
2. Click the **calendar icon** in the left sidebar — this creates today's daily note
3. Once you're in the new note, press **`Cmd+T`** and select your **"Main Note"** template
4. Your note is now filled in with the template sections, ready to go

### Using your note throughout the day

- **Notes section** — jot bullet points, ideas, anything that comes up
- **Meetings section** — log meeting notes (see Step 5 below to auto-populate from Google Calendar)
- **TODO section** — add tasks using checkbox syntax:
  ```markdown
  - [ ] Send the quarterly report
  - [ ] Review PR for auth service
  ```
- **Mark tasks done** by clicking the checkbox (or manually changing `[ ]` to `[x]`):
  ```markdown
  - [x] Send the quarterly report
  ```
- **Daily Reflection** — end of day, write a short reflection on how things went

---

## Step 5: Auto-Populate Meetings from Google Calendar (Optional)

The **Google Calendar and Contacts Lookup** plugin lets you pull meetings directly
from your Google Calendar into your Obsidian notes — no manual copy-pasting.

### Install the plugin

1. In Obsidian, go to **Settings > Community plugins**
2. If prompted, click **"Turn on community plugins"**
3. Click **Browse** and search for **"Google Lookup"**
4. Click **Install**, then **Enable**

### Set up Google credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or use an existing one)
3. Enable the **Google Calendar API** and **People API**
4. Create **OAuth 2.0 credentials** (Desktop application type)
5. In Obsidian, go to **Settings > Google Lookup** and enter your Client ID and Client Secret
6. Click **Authenticate** and sign in with your Google account

### Use it daily

1. Open your daily note and place your cursor in the **Meetings** section
2. Open the command palette (`Cmd+P`) and run **"Google Lookup: Insert Google Calendar Event"**
3. A search modal will appear — find your meeting and select it
4. The plugin inserts the event details (title, time, attendees) right into your note
5. Add your meeting notes underneath

> This plugin also supports looking up Google Contacts — useful if you want to
> quickly pull in someone's info while writing notes.

---

## Step 6: Install the Obsidian MCP Server

### Prerequisites

- **Node.js 18+** — check with `node --version`
- If not installed: `brew install node`
- **Obsidian v1.12+** (recommended) — enables CLI integration for faster search, task parsing, and more robust path handling. The MCP falls back to direct file access if the CLI is unavailable.

### Enable the Obsidian CLI (recommended)

1. Make sure you're on Obsidian v1.12+ (`brew upgrade --cask obsidian` or download from [obsidian.md/download](https://obsidian.md/download))
2. Open Obsidian > **Settings > General > Command line interface** > enable it
3. Follow the prompt to register the CLI in your PATH
4. Verify it works: `obsidian version`

### Installation

1. Clone or copy the `obsidian-mcp` folder to your machine:
   ```bash
   git clone <repo-url> ~/obsidian-mcp
   cd ~/obsidian-mcp
   npm install
   ```

2. Set your vault path as an environment variable (see Step 7 below). You no longer need to edit the source code — the vault path is configured in your Claude Code MCP config.

3. Test the server starts:
   ```bash
   npm start
   ```
   It should start without errors. Press `Ctrl+C` to stop.
   If the Obsidian CLI is detected, you'll see: `[obsidian-mcp] CLI detected at: ...`

---

## Step 7: Add the MCP to Claude Code

Open `~/.claude.json` in a text editor. Find the `"mcpServers"` key (or add it if it doesn't exist) and add the `obsidian-vault` entry:

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/full/path/to/obsidian-mcp/obsidian-mcp-server.js"],
      "env": {
        "OBSIDIAN_VAULT_ROOT": "/Users/<your-username>/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes"
      }
    }
  }
}
```

Replace:
- `/full/path/to/` with the actual path where you cloned the repo
- `OBSIDIAN_VAULT_ROOT` with your vault's absolute path:
  - **iCloud:** `/Users/<your-username>/Library/Mobile Documents/iCloud~md~obsidian/Documents/Notes`
  - **Local:** `/Users/<your-username>/Documents/ObsidianVault`

**Optional environment variables:**

| Variable | Description |
|---|---|
| `OBSIDIAN_VAULT_ROOT` | Absolute path to your Obsidian vault (required for fs fallback) |
| `OBSIDIAN_CLI_PATH` | Custom path to the `obsidian` CLI binary (auto-detected if in PATH) |
| `OBSIDIAN_VAULT_NAME` | Vault name for multi-vault setups (passed as `vault=<name>` to CLI) |

> **Note:** If `mcpServers` already has other entries, just add the `"obsidian-vault"` block alongside them — don't replace the whole object.

Restart Claude Code after saving.

---

## Step 8: Use the MCP to Get Your Outstanding Tasks

Once connected, you can ask Claude things like:

| What you ask | What it does |
|---|---|
| "What are my incomplete tasks for this week?" | Pulls all unchecked tasks from this week's notes |
| "Show me all tasks I haven't finished from last month" | Aggregates incomplete tasks across last month |
| "What did I get done last week?" | Shows all completed tasks from last week |
| "Generate a task rollover summary from last week" | Creates a summary of what carried over |
| "Write my Linear tickets and carryover tasks into today's note" | Populates your TODO section automatically |

The MCP reads your daily notes, parses all `- [ ]` and `- [x]` checkboxes,
and gives you a clear picture of what's still open.

---

## Quick Reference: Task Syntax

| Format | Example |
|---|---|
| Incomplete task | `- [ ] Review the budget proposal` |
| Completed task | `- [x] Review the budget proposal` |
| With timestamp | `- [x] Review the budget proposal ✅ 2026-02-24` |
| Sub-task | `  - [ ] Check page 3 numbers` |

The MCP understands all of these formats.

---

## Troubleshooting

**"Daily note not creating in the right folder"**
- Check Settings > Daily notes > New file location matches your folder structure
  (e.g., `Farther/{{date:YYYY}}/{{date:MMMM}}`)

**"Cmd+T doesn't show templates"**
- Make sure the Templates core plugin is enabled in Settings > Core plugins
- Make sure the Template folder location is set to `Templates`

**"MCP can't find my notes"**
- Verify `VAULT_ROOT` in `obsidian-mcp-server.js` points to your vault
- Verify `WORKING_DIR` matches your top-level folder name
- Make sure your daily notes follow `YYYY-MM-DD.md` naming

**"iCloud sync is slow"**
- This is normal for first sync. Files sync in the background.
- On iPhone/iPad, open the Files app > iCloud Drive to trigger sync.

**"Google Lookup plugin can't authenticate"**
- Double-check your Client ID and Client Secret in the plugin settings
- Make sure the Google Calendar API and People API are both enabled in your Google Cloud project
- Try re-authenticating from Settings > Google Lookup
