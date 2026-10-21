# norc-mcp

MCP server for connecting AI platforms (Claude, ChatGPT, etc.) to your [norc](https://norc.app) account — manage cron jobs, machines, and run history from a chat.

## Setup

1. Generate a norc API key: vault → Settings → API Keys → Generate key.
2. Add this server to your MCP client's connector config, pointing at `https://mcp.norc.app/mcp` with your key as the Bearer token (exact field depends on the client).

## Local (stdio) — no Docker, no server

Local MCP clients (Claude Code, Claude Desktop, Cursor) can spawn it directly. Set `NORC_API_KEY` and run it with `npx`:

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

When `NORC_API_KEY` is set (or `--stdio` is passed) the server speaks stdio and exits with an error if the key is missing or malformed. Without either, it starts the HTTP server below. Needs Node 20+.

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
