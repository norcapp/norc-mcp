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
   On Windows, `npx` is a `.cmd` script and may fail to launch directly; use `cmd` instead:
   ```json
   "command": "cmd",
   "args": ["/c", "npx", "-y", "norc-mcp"]
   ```
4. Quit Claude Desktop completely and reopen it. Closing the window is not enough. norc's tools then appear in the tools menu.

### Claude Code

Install the [norc plugin](https://github.com/norcapp/norc-claude-plugin), which adds slash commands and starts this server for you, or add it directly:

```
claude mcp add norc --env NORC_API_KEY=norc_sk_... -- npx -y norc-mcp
```

### Other local MCP clients (Cursor, etc.)

Use the same `command` / `args` / `env` block as the Claude Desktop config above. Without `NORC_API_KEY` (or `--stdio`) the server starts in HTTP mode instead, and a missing or malformed key in stdio mode exits with an error.

### Hosted (remote clients)

For clients that only support remote servers, use `https://mcp.norc.app/mcp` (Streamable HTTP, `POST`) with the header `Authorization: Bearer norc_sk_...`. It is the same code as this repo, deployed on Vercel; your key is forwarded to `vault.norc.app` and not stored.

## Authentication and key choice

The server authenticates with a norc API key sent as a Bearer token (`norc_sk_...`); in stdio mode it is read from `NORC_API_KEY`. Prefer a read-only key unless you want the assistant to change jobs: read-only keys can list jobs, machines and runs, and get a 403 on every write. Rotate or revoke keys in vault → Settings → API Keys. The server is stateless and keeps nothing between requests.

## Approval flow

Jobs created or changed through the API are **pending** until the account owner approves them in the Norc app (vault, desktop or mobile). A job's command runs on your machine only after approval, so tool results carry `approval_status` and the assistant is told to say so plainly. Deleting a job or machine archives it, and the owner can undo that in the app for about 10 minutes.

## Tools

| Tool | What it does | Notes |
| --- | --- | --- |
| `list_jobs` | List jobs, optionally for one machine | Read-only. Paginated (`cursor`, `limit`). Long commands are truncated |
| `get_job` | One job with its full command | Read-only |
| `create_job` | Create a job on a machine | Created as `pending` until approved in the app |
| `update_job` | Change name, schedule, command or enabled | Changing command or schedule re-requires approval |
| `delete_job` | Archive a job | Needs `confirm: true` and the exact job `name`; undo for about 10 minutes |
| `list_machines` | List paired machines | Read-only |
| `rename_machine` | Rename a machine | |
| `delete_machine` | Unpair (archive) a machine and its jobs | Needs `confirm: true` and the exact machine `name`; undo for about 10 minutes |
| `list_runs` | Run history (status, exit code, timestamps) | Read-only. Paginated |
| `sync_jobs` | Declarative sync of your full job set (like `norc gitops`) | Two steps: a dry run returns the diff and a 5-minute `confirmation_token`; applying needs that token and `confirm_delete_count`. Jobs not listed are archived. At most 100 operations per request. Needs the gitops sync feature on your account |

Every tool sets MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`). Text that comes from your account (job names, commands, hostnames) is returned inside a `<norc-data>` block with a fixed preamble stating it is data, control characters are stripped, and long fields are truncated. Upstream error text is not forwarded; errors are stable messages with a request id you can quote to support. Inputs are validated before any request is sent (length limits, no control characters, cron shape). Requests time out after 15 seconds and writes are never retried.

## Self-hosting (HTTP)

This server is a thin, stateless client — it holds no secrets and no database access of its own. It only forwards your API key to `vault.norc.app` (or `$NORC_VAULT_URL`). Run your own instance if you'd like:

```bash
pnpm install
pnpm build
PORT=3000 node dist/server.js
```

The listener binds to `127.0.0.1` by default; set `HOST=0.0.0.0` to accept remote connections (the Docker image does) and terminate TLS in front of it. The `Host` header must be in `NORC_MCP_ALLOWED_HOSTS` (comma-separated; default `mcp.norc.app,localhost,127.0.0.1,[::1]`), and a request that carries an `Origin` header must match `NORC_MCP_ALLOWED_ORIGINS` (default `https://claude.ai,https://claude.com`). Requests without an `Origin` header (non-browser MCP clients) are not affected.

Note: self-hosting this server does not mean self-hosting norc itself — it still talks to the hosted norc API.

## Run via Docker

```bash
docker run -p 3000:3000 norcapp/norc-mcp
```

Set `NORC_VAULT_URL` if you're pointing at a non-default vault instance:

```bash
docker run -p 3000:3000 -e NORC_VAULT_URL=https://vault.norc.app norcapp/norc-mcp
```

If you reach the container by a hostname other than `localhost`, add it to `NORC_MCP_ALLOWED_HOSTS`.

## License

MIT
