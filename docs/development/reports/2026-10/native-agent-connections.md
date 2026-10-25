# Native agent connections — 2026-10-25

## Result and boundary

Implemented native MCP tool connections for Claude Code, Claude Desktop local Chat and Antigravity. The native application retains chat, model selection, provider authentication and subscription usage. Helios remains the authority for candidate source, build, review, revision checks and checkpoints. Codex's existing task-scoped app-server adapter and API-key/Dominatus paths remain supported.

**Meaningful progression:** implementation and automated qualification pass. Real Claude Desktop/Antigravity application setup and provider-backed agent turns remain unverified. The user explicitly deferred further manual setup after the initial Claude attempt failed. Do not count the automated protocol peers as native provider/account qualification.

## Motivating findings and repairs

The first user attempt used a Claude session reporting Linux-VM execution and no loaded local MCP servers. The prepared project `.mcp.json` was a Claude Code configuration, not a configuration for ordinary Desktop Chat. The agent could open Helios's gallery in another browser but could not access the active candidate through that new browser session. It correctly declined to claim success.

The repair separates **Claude Code · project workspace** from **Claude Desktop · local MCP** in Helios. Code uses HTTP MCP in its selected workspace. Desktop Chat uses a local stdio entry in its native MCP settings. `DesktopMcpStdio` runs on the desktop computer and forwards tools through the official MCP SDK client/server to the same local HTTP endpoint. It does not start another web host, initialize the application database, embed a model loop or require the agent's VM to reach Windows localhost. No public tunnel or Cowork plugin was added; remote/cloud connectors are not represented as working against a loopback endpoint.

Antigravity uses its native MCP client. Google's consumer-plan guidance excludes wrapping `agy` inside a third-party application. The implementation therefore leaves the conversation and inference in Antigravity, using its supported external-tool connection rather than reusing login tokens or proxying provider calls.

## Ownership and lifecycle

- The existing authenticated/CSRF-protected local API creates and revokes owner/client-bound, eight-hour capabilities. Pairings can be checked/reused or regenerated after host restart. Capabilities are held in host memory; source and provider credentials are not stored in the pairing registry.
- Native requests require that capability and a loopback peer/host. Browser cookies alone cannot authorize MCP. The route subtree is gated, and non-loopback origins are refused.
- MCP transport and negotiation belong to `ModelContextProtocol.AspNetCore` 2.3.0. The adapters project `AuthorTools()` and use the same `executeAgentTool` candidate executor. `task_context` and `finish_task` are task-lifecycle tools, not alternate CAD semantics. No ACP core schema, second compiler or hand-written MCP transport was added.
- A paired but idle client can discover schemas, but cannot read project source. Calls serialize within the active candidate. Source edits invalidate successful-build admission. `finish_task` requires the current candidate to build, and the original host still performs final build/revision/apply checks.
- Stop, disconnection, host shutdown, pairing revocation and cancellation of an in-flight native tool request cancel candidate work. Existing desktop applications are not terminated. The Desktop stdio helper is a reusable connection owned by its native MCP host; stdin EOF releases its upstream transport and exits. HTTP modes create no additional native processes.
- Settings and setup text distinguish provider-account authentication from local capability pairing. Helios does not claim a native subscription is authenticated merely because it minted a capability. The native client retains its own filesystem/shell permission model.

## Evidence

| Check | Observed result |
|---|---|
| .NET test project, Release, serial, current sources | 78 passed |
| Helios full Vitest suite | 149 passed |
| Helios `build:fast` | Passed; existing large-chunk warning |
| Browser/native-protocol suite | 6 passed |
| Source diff checks | Passed in HeliosCAD and Leviathan; Aetheris source unchanged |

The six browser cases exercise actual Kestrel, Vite, the public WASM compiler and candidate/checkpoint transactions. They cover Codex process success/failure/cancellation, Claude Code HTTP MCP, Claude Desktop's actual generated stdio process, and Antigravity HTTP MCP. Native-mode cases verify idle-source denial, premature-finish rejection, a 20 → 30 mm Box edit and successful compile/application, recovery checkpoint creation, task cancellation, access revocation and rejection after disconnect. The stdio case checks the advertised tools capability and verifies clean process exit on stdin EOF. Backend tests separately exercise owner/client isolation, concurrent-task refusal, dirty-build admission and cancellation of a blocked native call.

The pre-existing STEP bounds/topology and restoration witness continues through the shared tools. No geometry or language code changed in this pass. This does not claim a fresh full Aetheris kernel corpus run or live native Mac/Linux client qualification.

Current-source .NET qualification used `-p:OutDir=.../artifacts/local/desktop-qualification/bin/` while the manual playtest host was open, avoiding Windows DLL locks. The browser config accepts `HELIOS_AUTHOR_TEST_SERVER` to qualify that exact binary. The test peer supports both ordinary project output and a shared qualification output directory. This is test support, not a product runtime route.

Logs: `Leviathan/artifacts/local/desktop-current-tests.log` and `desktop-tests/desktop-current.trx`; `HeliosCAD/artifacts/local/desktop-unit.log`, `desktop-build.log`, `desktop-e2e.log`. Canonical commands are documented in the public connection guide and `playwright.author.config.ts`.

## Cleanup and deferred work

The temporary manual playtest browser, Vite and Kestrel hosts were stopped after the user deferred setup. No owned stdio helpers, test peers, test hosts or Playwright Chrome profiles remained running in the final process check. User Claude and Antigravity applications were left alone. Generated pairing snippets from that stopped host are stale; regenerate them from Helios before any future test.

Automatic approval review blocked deletion of the first temporary Chrome-profile directory. It remains under ignored artifacts; the reviewable manual cleanup script is `artifacts/local/desktop-native/cleanup-profile.ps1`. Generated outputs are now excluded from Vite's watcher so browser cache churn cannot crash the dev host.

Native application UI/account smoke tests are explicitly deferred to the user's later setup. One-click connection installation/desktop extension packaging belongs with the launcher/distribution work. Current setup uses documented native configuration surfaces and the existing local-host sign-in; it does not claim a finished consumer onboarding experience.

References: [current connection guide](../../../public/ai-connections.md), [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Claude Desktop local MCP](https://support.claude.com/en/articles/10949351-getting-started-with-local-mcp-servers-on-claude-desktop), [Claude remote connector networking](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [Antigravity MCP](https://www.antigravity.google/docs/mcp), [Antigravity consumer-plan boundary](https://antigravity.google/docs/faq).
