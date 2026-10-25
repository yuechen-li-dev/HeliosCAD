# Connect an AI collaborator

AI Author can use your installed Codex client, connect Claude Code or Antigravity native chat through MCP tools, or use an OpenAI, Anthropic or Google API key. Every path works on a separate candidate project, uses the Aetheris compiler to build it, and keeps recovery checkpoints in **Version Control**.

## Use your Codex subscription

1. Install the native Codex CLI and sign in with ChatGPT using `codex login`.
2. Open Helios connected to its local AI host, and sign in to that host.
3. In **AI Author**, select **Installed Codex · ChatGPT subscription**.
4. Expand **AI connection settings**, then select **Test connection**. Choose a model from the installed client's catalog.
5. Describe your change and select **Run agent**. Progress streams into the conversation. **Stop agent** cancels the candidate task.

The connection uses Codex's supported app-server interface. It starts a separate task; it does not attach to a conversation already open in the Codex desktop app. Codex retains ownership of its login and token renewal. Helios does not read or copy its credential files. An API-key account is refused in this mode, and a failed subscription request never switches to API billing.

The model catalog is not a guarantee of account entitlement. A completed task verifies access for that request; subscription quotas and provider policies still apply. This adapter uses experimental Codex dynamic tools, qualified on Windows with CLI `0.164.0-alpha.11.1`. Unsupported client/protocol combinations fail explicitly. Custom OpenAI provider definitions in the Codex profile are refused in subscription mode so a custom API route cannot change its billing behavior.

## Connect Claude Code, Claude Desktop Chat or Antigravity

Your existing desktop client keeps its chat, login, model selection and subscription. Helios supplies candidate editing and engineering tools. No provider credential is copied from the desktop client, and no model request is made by Leviathan in this mode.

1. In **AI Author → Connection**, choose **Claude Code · project workspace**, **Claude Desktop · local MCP**, or **Antigravity · native desktop chat** to match the client you are actually using.
2. Expand **AI connection settings** and select **Prepare desktop connection**. This creates a temporary, local MCP capability; it does not claim to have authenticated your provider account.
3. Select **Copy MCP configuration** and add the `helios` server in your native client, preserving other server entries. Configure the client before starting the task so setup time does not consume the task budget.
4. Enter the requested change in Helios and select **Start desktop task**. A recovery checkpoint is saved before candidate access is granted.
5. Select **Copy desktop task prompt** and send it in your native chat. It asks the agent to read `task_context`, use the Helios tools, build, and call `finish_task`.
6. Review the host outcome in Helios. A successfully built candidate is applied automatically only if **Apply changes after a successful build** is selected.

For **Claude Code**, add the copied entry to the selected workspace's `.mcp.json`. The entry uses `type: "http"`, `url`, and an Authorization header. Open or reload that workspace in Claude Code and enable the server there. This is the Code workspace connection; a browser-hosted Claude connector cannot reach a loopback URL on your computer. See [Claude Code MCP setup](https://code.claude.com/docs/en/mcp).

For ordinary **Claude Desktop Chat**, a project `.mcp.json` is not loaded. Choose **Claude Desktop · local MCP** instead. Merge the generated `helios` entry into the Desktop local MCP configuration through **Settings → Developer → Edit Config** (or the local-server/Extensions section in newer layouts), preserving other entries. Fully restart Claude Desktop and enable the server in a new Chat through **+ → Connectors**. The generated entry launches the local .NET stdio bridge with a temporary Helios capability. This process runs on the desktop computer and forwards MCP calls to the same local tool endpoint; the model's Linux execution environment does not need a route to Windows localhost. See [Claude Desktop local MCP setup](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop).

Do not add this loopback URL as a Claude **remote/cloud connector**: those requests originate from Anthropic's infrastructure. The local Desktop configuration is a different mechanism; availability in Cowork/VM sessions must not be inferred from Chat support. This local-host pass does not add a public tunnel or Cowork plugin. [Network requirements](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)

For **Antigravity**, use its MCP settings. In Antigravity IDE, the route is **… → MCP Servers → Manage MCP Servers → View raw config**. Merge the copied `helios` entry into `mcpServers`, then refresh the server. Versions supporting workspace MCP configuration can load `.agents/mcp_config.json`. The generated entry uses `serverUrl` and an Authorization header. See [Antigravity MCP setup](https://www.antigravity.google/docs/mcp).

Antigravity's consumer-plan guidance excludes wrapping its headless CLI inside another application. This connection uses its supported native MCP client: you chat in Antigravity and it calls Helios tools. [Provider guidance](https://antigravity.google/docs/faq)

The pairing lasts up to eight hours, remains in local-host memory, and grants access only while a Helios task is active. It can be reused for later tasks in that browser session. After host restart or expiry, select **Prepare desktop connection** again and refresh the updated configuration in the native client. Treat the copied capability as a local credential; keep it out of source repositories, chat and exports.

**Stop agent** cancels the current task and removes candidate access. **Disconnect desktop** revokes the pairing. Cancelling an in-flight native tool request also rejects the current candidate. HTTP connections launch no native-client processes; your existing desktop applications remain open. Claude Desktop owns the small stdio bridge process: closing its stdin ends that process and disposes the HTTP transport. Stopping an individual task keeps that reusable MCP connection idle. Native-client filesystem and shell permissions remain controlled by that client; the Helios tool server supplies neither.

An idle paired client can discover the tool schema but cannot read project source. `finish_task` requires a successful build of the current candidate; a subsequent source edit invalidates that admission. The final Helios build and source-revision check still run before application. The MCP server never exposes a direct apply-to-working-project tool.

## Configure API keys locally

In **AI connection settings**, select **Open configuration folder**. This creates a commented `helios.toml` template if there is no file. Edit it with your preferred text editor, select **Reload connections**, and select **Test connection** for the chosen provider.

```toml
defaultProvider = "openai"

[providers.openai]
apiKeyEnv = "OPENAI_API_KEY"

[providers.anthropic]
apiKeyEnv = "ANTHROPIC_API_KEY"

[providers.gemini]
apiKeyEnv = "GEMINI_API_KEY"

[agents.codex]
executable = "codex"
```

Instead of `apiKeyEnv`, you can write `apiKey = "your actual key"` in the corresponding provider table. Use one field per provider. TOML keys are case-sensitive: `apiKey`, `apiKeyEnv`, `defaultProvider` and `executable`. Unknown fields, malformed TOML and conflicting key fields are errors. On Windows, use forward slashes or a single-quoted literal string for an absolute executable path; select the native `codex.exe`, not a `.cmd` wrapper.

The default location is the operating system's application-data directory under `Aetheris/Helios/helios.toml`. On Windows this is normally `%APPDATA%\Aetheris\Helios\helios.toml`. The UI displays the exact path. Treat the file as a local secret: it is plaintext if you put keys directly in it. Keep it outside design projects and restrict access to your operating-system user. Files created by the host use user-only permissions on Unix.

The local host reads keys; they are never returned to the browser, sent in chat, stored in checkpoints, or included in design exports. **Provider API key** mode uses separately billed API access. Testing an API connection requests the provider's model catalog without requesting inference; a completed task still needs to verify selected-model access and quota.

Explicit TOML provider settings take precedence over host environment credentials. An empty key or an unset variable named by `apiKeyEnv` leaves that provider unconfigured; it does not fall back. Providers omitted from TOML retain support for the host's existing environment credentials. `defaultProvider` selects the initial connection; it does not enable automatic provider fallback. `codex`, `claude-code`, `claude-desktop` and `antigravity` are also admitted defaults. Native-chat modes do not need an executable entry under `agents`.

## Review, apply and recover

All connection modes can read project documents, inspect compiler schemas, edit candidate source, build, measure and prepare review exports through the existing engineering tools. Installed Codex tasks do not inherit shell access or the user's MCP connectors into the candidate workspace. No agent tool directly applies changes to the working project.

Helios saves **Before AI task** before starting work. A changed candidate must build successfully before it can be applied. Disable **Apply changes after a successful build** to inspect the source diff first. The host's transaction status states whether the working project was updated; the agent's final text can describe an earlier candidate state.

Cancelled, disconnected and failed tasks are not applied. Source changes made elsewhere invalidate the running task. Use **Version Control** to restore a checkpoint; restoration keeps the later checkpoints. Browser-local history is not a cloud backup.

## Local host setup for development

Until the Helios desktop launcher is packaged, start the local host from the sibling Leviathan checkout:

```powershell
$env:ASPNETCORE_ENVIRONMENT = 'Development'
$env:HELIOS_LOCAL_AI = 'true'
$env:LEVIATHAN_DATA_DIR = Join-Path $PWD 'artifacts/local/helios-data'
dotnet run --project src/Leviathan.Server --no-launch-profile --urls http://127.0.0.1:5189
```

Then start Helios with `npm run dev -- --host 127.0.0.1`. Register or sign in to the local host using Helios's account screen; local AI currently retains the existing account and active Helios installation checks. It does not bypass cloud authorization.

`HELIOS_CONFIG_FILE` can select another absolute configuration path. `HELIOS_API_URL` changes the Vite development proxy target when the host uses another port. Local AI is opt-in and requires explicit loopback bindings. Host settings, executable launching and subscription connections are refused for non-loopback requests. Do not expose the development UI or local host through a public proxy. A hosted Helios deployment cannot read a visitor's local TOML or run their installed agent.

Related: [project and checkpoint workflow](helios-showcase.md), [export formats](exports.md), [Codex app-server documentation](https://learn.chatgpt.com/docs/app-server).
