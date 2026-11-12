---
kind: guide
status: current
summary: Connect the remote Figma MCP server to OMP on a remote host, using Pi to obtain OAuth credentials.
verified: 2026-10-20
---

# Figma MCP (remote) with remote OMP

Three steps:

1. Set up Figma Remote in Pi to generate the client ID and client secret.
2. Forward port 3000 over SSH so the OAuth redirect works.
3. Add an HTTP MCP server manually in OMP.

## Set up Figma in Pi

See the [Pi package docs](https://pi.dev/packages/pi-figma-remote-auth?page=29).

```bash
pi install npm:pi-mcp-adapter

pi install npm:pi-figma-remote-auth
```

Open Pi and log in with `/figma-remote-auth login`. Paste the URL into a browser, then change the redirect URL to point to the remote server.

## Forward the port

On a machine with a GUI:

```bash
ssh -L 3000:localhost:3000 tinytiger@tiny
```

## Add the HTTP MCP server in OMP

Open OMP and run `/mcp add figma`. The URL is https://mcp.figma.com/mcp.

Follow the flow for adding an HTTP MCP server. It fails at OAuth; choose to enter the credentials manually. Run `less ~/.pi/agents/mcp.json` to view the `clientId` and `clientSecret`, and paste them into OMP when prompted. Copy the URL, remove line breaks, paste it into a browser and authorize.
