# norc-mcp

MCP server for connecting AI platforms (Claude, ChatGPT, etc.) to your [norc](https://norc.app) account — manage cron jobs, machines, and run history from a chat.

## Setup

1. Generate a norc API key: vault → Settings → API Keys → Generate key.
2. Install it for your client (below). Hosted option: point a client that supports remote servers at `https://mcp.norc.app/mcp` with your key as the Bearer token (exact field depends on the client).

## Install

### Claude Desktop

1. Install [Node.js](https://nodejs.org) 20 or newer (Claude Desktop runs the server with `npx`).
2. Open Claude Desktop → Settings → Developer → Edit Config. This opens `claude_desktop_config.json`:
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json` (Microsoft Store install: `%LOCALAPPDATA%\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`)
3. Add norc under `mcpServers` (keep any servers already there) and use your own key (vault → Settings → API Keys):
   ```json
   {
     "mcpServers": {
       "norc": {
         "command": "npx",
         "args": ["-y", "norc-mcp"],
         "env": { "NORC_API_KEY": "norc_sk_..." }
       }
     }
   }
   ```
   On Windows, Claude Desktop cannot launch `npx` directly; wrap it in `cmd`:
   ```json
   "norc": {
     "command": "cmd",
     "args": ["/c", "npx", "-y", "norc-mcp"],
     "env": { "NORC_API_KEY": "norc_sk_..." }
   }
   ```
4. Quit Claude Desktop completely and reopen it. Closing the window is not enough. norc's tools then appear in the tools menu.

### Claude Code

Install the [norc plugin](https://github.com/norcapp/norc-claude-plugin), which adds slash commands and starts this server for you, or add it directly:

```
claude mcp add norc --env NORC_API_KEY=norc_sk_... -- npx -y norc-mcp
```

### Other local MCP clients (Cursor, etc.)

Use the same `command` / `args` / `env` block as the Claude Desktop config above. Without `NORC_API_KEY` (or `--stdio`) the server starts in HTTP mode instead, and a missing or malformed key in stdio mode exits with an error.

## Tools

- `list_jobs`, `create_job`, `update_job`, `delete_job`
- `list_machines`, `rename_machine`, `delete_machine`
- `list_runs`
- `sync_jobs` — declarative sync of your full job set (like `norc gitops`). Dry run by default; jobs not listed are deleted when `apply` is true. Needs the gitops sync feature enabled on your account.

## Self-hosting (HTTP)

This server is a thin, stateless client — it holds no secrets and no database access of its own. It only forwards your API key to `vault.norc.app` (or `$NORC_VAULT_URL`). Run your own instance if you'd like:

```bash
pnpm install
pnpm build
PORT=3000 node dist/server.js
```

Note: self-hosting this server does not mean self-hosting norc itself — it still talks to the hosted norc API.

## Run via Docker

```bash
docker run -p 3000:3000 norcapp/norc-mcp
```

Set `NORC_VAULT_URL` if you're pointing at a non-default vault instance:

```bash
docker run -p 3000:3000 -e NORC_VAULT_URL=https://vault.norc.app norcapp/norc-mcp
```

## License

MIT
