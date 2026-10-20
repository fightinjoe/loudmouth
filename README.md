# Setting up Figma MCP (remote) with remote OMP

To get this to work, you must do the following:
1. Setup Figma Remote in Pi (to generate the Client ID and Client Secret)
2. Setup SSH port forwarding to port 3000 (for the OAuth redirect to work)
3. Add an HTTP MCP server manually in OMP

## Setting up Figma in Pi

See (pi docs)[https://pi.dev/packages/pi-figma-remote-auth?page=29] for more info.

```bash
pi install npm:pi-mcp-adapter

pi install npm:pi-figma-remote-auth
```

Then open pi and login

`/figma-remote-auth login`

Copy and paste the URL into a browser, then change the redirect URL to point to the remote server

## Setup SSH port forwarding

On a machine with a GUI:

`ssh -L 3000:localhost:3000 tinytiger@tiny`

## Add an HTTP MCP server manually in OMP

Open OMP and type

`/mcp add figma`

The URL is https://mcp.figma.com/mcp.

Go through the flow for adding an HTTP MCP server. This will fail at OAuth. Choose to put in the credentials manually.

Then type `less ~/.pi/agents/mcp.json` to view the `clientId` and `clientSecret`.

Paste these values into OMP when prompted. Copy the URL, remove carriage returns, and paste into a browswer. Authorize, and voila! It should work.  
