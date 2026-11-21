# norc-mcp

[![npm](https://img.shields.io/npm/v/norc-mcp)](https://www.npmjs.com/package/norc-mcp)
[![npm downloads](https://img.shields.io/npm/dm/norc-mcp)](https://www.npmjs.com/package/norc-mcp)
[![Docker](https://img.shields.io/docker/v/norcapp/norc-mcp?sort=semver&label=docker)](https://hub.docker.com/r/norcapp/norc-mcp)
[![Docker pulls](https://img.shields.io/docker/pulls/norcapp/norc-mcp)](https://hub.docker.com/r/norcapp/norc-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-io.github.norcapp%2Fnorc--mcp-blue)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.norcapp/norc-mcp)
[![License: MIT](https://img.shields.io/npm/l/norc-mcp)](LICENSE)
[![mcptry](https://mcptry.com/badge/io.github.norcapp/norc-mcp.svg)](https://mcptry.com/servers/io.github.norcapp/norc-mcp)
[![Glama](https://glama.ai/mcp/servers/norcapp/norc-mcp/badges/score.svg)](https://glama.ai/mcp/servers/norcapp/norc-mcp)

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

### Remote-config clients

The entries below use the hosted endpoint, `https://mcp.norc.app/mcp`. Most read the key from the `NORC_API_KEY` environment variable. Set it without writing it to your shell history:

```bash
printf 'norc API key (norc_sk_...): ' && read -rs NORC_API_KEY && echo && export NORC_API_KEY
```

The client must inherit the variable. Start it from that same shell (for example `cursor .`), or set `NORC_API_KEY` in the environment your desktop session starts apps with. A client opened from the Dock or Start menu does not see a variable exported in a terminal.

#### Codex (CLI and IDE extension)

Add to `~/.codex/config.toml`. Codex reads the token from the named
environment variable, so the key never sits in the file:

```toml
[mcp_servers.norc]
url = "https://mcp.norc.app/mcp"
bearer_token_env_var = "NORC_API_KEY"
```

#### Gemini CLI

Add to `~/.gemini/settings.json` (or `.gemini/settings.json` in a project):

```json
{
  "mcpServers": {
    "norc": {
      "httpUrl": "https://mcp.norc.app/mcp",
      "headers": {
        "Authorization": "Bearer $NORC_API_KEY"
      }
    }
  }
}
```

#### Google Antigravity

Open the agent panel's **⋯ menu → MCP Servers → Manage MCP Servers → View raw
config**, add this to `mcp_config.json` and swap in your key:

```json
{
  "mcpServers": {
    "norc": {
      "serverUrl": "https://mcp.norc.app/mcp",
      "headers": {
        "Authorization": "Bearer norc_sk_your_api_key_here"
      }
    }
  }
}
```

#### OpenCode

Add to `opencode.json` in your project (or `~/.config/opencode/opencode.json`). This is the V2 shape, with server names under `mcp.servers`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "norc": {
        "type": "remote",
        "url": "https://mcp.norc.app/mcp",
        "headers": {
          "Authorization": "Bearer {env:NORC_API_KEY}"
        }
      }
    }
  }
}
```

On OpenCode V1, put `norc` directly under `mcp` and add `"enabled": true`.

#### Cursor

Add to `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "norc": {
      "url": "https://mcp.norc.app/mcp",
      "headers": {
        "Authorization": "Bearer ${env:NORC_API_KEY}"
      }
    }
  }
}
```

#### VS Code (GitHub Copilot)

Local harness: add to `.vscode/mcp.json`. VS Code asks for the key the first time the server
starts and stores it securely:

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "norc-api-key",
      "description": "norc API key",
      "password": true
    }
  ],
  "servers": {
    "norc": {
      "type": "http",
      "url": "https://mcp.norc.app/mcp",
      "headers": {
        "Authorization": "Bearer ${input:norc-api-key}"
      }
    }
  }
}
```

The Copilot harness does not support the `${input:...}` prompt. Use a `.mcp.json` file at the workspace root, which reads the key from the `NORC_API_KEY` environment variable, and start VS Code from a shell that has it set:

```json
{
  "mcpServers": {
    "norc": {
      "type": "http",
      "url": "https://mcp.norc.app/mcp",
      "headers": {
        "Authorization": "Bearer ${NORC_API_KEY}"
      },
      "tools": ["*"]
    }
  }
}
```

#### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "norc": {
      "serverUrl": "https://mcp.norc.app/mcp",
      "headers": {
        "Authorization": "Bearer ${env:NORC_API_KEY}"
      }
    }
  }
}
```

### Other clients

- **Local (stdio):** use the same `command` / `args` / `env` block as the Claude Desktop config above. Without `NORC_API_KEY` (or `--stdio`) the server starts in HTTP mode instead, and a missing or malformed key in stdio mode exits with an error.
- **Remote:** use `https://mcp.norc.app/mcp` (Streamable HTTP, `POST`) with the header `Authorization: Bearer norc_sk_...`. It is the same code as this repo, deployed on Vercel; your key is forwarded to `vault.norc.app` and not stored.

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
