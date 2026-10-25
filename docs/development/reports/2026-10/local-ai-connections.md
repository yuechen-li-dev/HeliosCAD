# Local AI connections — 2026-10-25

## Result

Codex subscription access and local TOML API credentials work through the actual Helios candidate/build/checkpoint path. This removes the API-key-only blocker for the first installed agent. The complete requested client matrix remains incomplete: only Codex implements the installed-agent adapter today. Claude Code and Antigravity are not represented as connected or supported.

## Changes and ownership

- Leviathan owns `HeliosLocalAi`, strict TOML parsing, credential selection and redacted status. Local settings/process endpoints are opt-in and require explicit loopback bindings, a loopback request, the existing authenticated user and an active Helios installation. Mutating HTTP requests retain CSRF protection. WebSocket admission uses a short-lived, one-use, user-bound ticket plus a loopback origin.
- The API gateway continues to use the maintained Dominatus conversation clients. OpenAI, Anthropic and Gemini TOML keys reach those clients; there is no second model API implementation.
- `ILocalAuthorAgent` is the installed-agent seam. `CodexAuthorAgent` uses the official app-server stdio protocol and client-managed ChatGPT login. Helios does not read auth files. API-key accounts and custom OpenAI provider definitions are refused; no API fallback occurs.
- Codex owns its agent loop. Helios owns the candidate tool effects. `AuthorTools()` supplies the same compiler/engineering tool catalog to both routes; `executeAgentTool` is the shared browser executor. ACP is not a dependency or persistence format.
- Each task owns one process and ephemeral working directory. Shell tools, inherited MCP servers, plugins and hooks are disabled for candidate work. Unsupported interactions do not grant additional permissions. Cancellation, disconnection and host shutdown propagate to the process; completed status is emitted after process/pipe cleanup.
- AI Author exposes connection type, runtime model catalog, config-folder opening, reload and credential/connection tests. It distinguishes API usage from subscription mode. Host transaction outcome is shown separately from the agent's final text, which may describe the earlier candidate state.
- `helios.toml` is ignored in both repositories. Secrets are not returned in status, parser errors or provider errors, and credential-bearing settings properties are excluded from JSON serialization. The generated template uses user-only Unix file permissions.

## Qualification

Windows, .NET 10, native Codex CLI `0.164.0-alpha.11.1`:

- `dotnet test Leviathan.slnx -c Release -m:1 -nr:false -p:UseSharedCompilation=false -- RunConfiguration.MaxCpuCount=1`: **75 passed**. Includes real subprocess/RPC/tool round trips, API-account/custom-route refusal, failed turns, cancellation/reaping, strict TOML reload/errors, all three API-client credential routes, secret redaction, local/remote boundary, authenticated access, CSRF and one-time tickets.
- `npm test -- --reporter=dot`: **148 passed**. The existing camera test assumed `fit` selected a negative-Y view; the shared Telos implementation explicitly preserves incoming orientation. The test now verifies that contract. Camera implementation and geometry were not changed.
- `npm run build:fast`: passed. Existing chunk-size warning remains.
- `npx playwright test --config playwright.author.config.ts`: **3 passed** against actual Kestrel, Vite, the public WASM compiler and a deterministic offline stdio protocol peer. Success changes a 20 × 15 × 8 mm Box to 30 × 15 × 8 mm; STEP bounds change only in X, topology count is retained, and recovery restores the original bounds. Failed turns and cancellation leave source/display intact and reap the task PID.
- A live installed Codex/ChatGPT subscription session read the default bracket, changed width 50 → 52 mm, built without diagnostics, applied through Helios and exported STEP. Native CLI analysis reports one enclosed manifold body, 7 faces / 15 edges / 12 vertices and bounds `[-26,-20,0]` to `[26,20,8]` mm. Browser page-error collection was empty. The installed client's catalog and managed account were queried without an API key. This was a real model turn, not the offline peer.
- Aetheris CLI validated the committed browser witness through `Built` admission, built STEP, and independently analyzed the browser-exported Box as one enclosed manifold body, 6 faces / 12 edges / 8 vertices, bounds `[-15,-7.5,0]` to `[15,7.5,8]` mm. Native analysis also checks the live bracket export.
- `git diff --check` passed in both modified repositories. Aetheris source is unchanged. This pass does not claim a new full kernel/corpus qualification or live Mac/Linux agent qualification.

Reproduce the browser test after building the sibling Leviathan solution in Release. The offline protocol peer is a test-only project in that solution so its configuration matches the test assembly; it is not part of server distribution. The browser config creates an ignored TOML fixture pointing at that peer. It never uses a real provider key or consumes model quota.

Evidence is in ignored `artifacts/local/ai-*` and `artifacts/local/author-e2e/` in HeliosCAD, and `artifacts/local/ai-tests/` plus `ai-full.log` in Leviathan. The three retained browser STEP files are `before.step`, `after.step` and `restored.step`.

## Remaining boundary and decisions

**Meaningful progression** against the full installed-agent request: Codex plus local keys are implemented and qualified. The next concrete gap is the lack of Claude Code and Antigravity implementations of `ILocalAuthorAgent`. None of `claude`, `antigravity`, `agy` or `gemini` was available on PATH during this qualification; their installed-client subscription/session behavior has not been tested. API-key mode for Anthropic and Google is qualified offline through the existing clients, not with live credentials.

The first adapter starts an independent ephemeral agent task and reconstructs bounded conversation context from Helios. It does not attach to arbitrary existing desktop conversations. Direct ChatGPT sign-in/token storage is not implemented; Codex owns its existing managed login. This avoids introducing a second OAuth lifecycle for this pass.

One-click packaging and removal of local account-setup friction remain the separate launcher task. The current local AI host is a developer/local-host opt-in, not a public cloud credential service. Public deployments keep the existing environment-credential path. No sketcher, parser, kernel or geometry refactor was included.

User instructions and field reference: [AI connection guide](../../../public/ai-connections.md). Protocol reference: [official Codex app-server documentation](https://learn.chatgpt.com/docs/app-server).
