# Demo polish qualification — 2026-10-26

Verdict: **Success for the Helios changes**. The broader pass retains an explicit
Aetheris performance stop; this report does not claim that target is closed.

## What changed

The SDK dependency is now `file:../Aetheris/Aetheris.Web.Runtime/sdk`, represented
as a directory link in the lockfile. Rebuilding a local same-version SDK no
longer invalidates a pinned tarball checksum. Registry package integrity remains
intact. `npm run sdk:link` builds the SDK, installs/builds its Telos package, then
installs Helios. Existing sdk:install aliases continue to work. The bootstrap
runs npm through the current Node executable and npm entry point, without shell
quoting or forced dependency installation.

Vite admits the linked SDK tree and deduplicates Three so Helios and Telos use
one runtime. The README gives a fresh source-tree sequence and Node 24+/.NET 10
prerequisites. Node 24+ is required by the existing directly executed TypeScript
build script, not a new browser requirement.

Production WebGPU-to-WebGL fallback was already present upstream. It was
sanity-checked rather than rewritten. New real-browser tests cover absent
WebGPU, no adapter, and device initialization failure. They build a real part,
check Ready and a quiet WebGL badge, reject the viewport alert, and decode actual
canvas screenshot pixels to prove visible geometry (central coverage >10%).
The retained screenshot shows the plate and its actual through hole.

The required authoring tests exposed missing Leviathan protocol implementation:
Helios already polls pairing status and sends application/time-budget context,
but the backend omitted them. That owner was repaired in Leviathan. The frontend
still owns candidate validation, checkpointing and final application/review.
No second orchestration or persistence layer was added.

## Evidence

- Frontend unit suite: **192 passed**, 42 files, two workers.
- Production `build:fast`: passed.
- Browser polish suite: **28 passed** — IntelliDraft 18, graph editing 7,
  automatic WebGL fallback 3.
- Local author suite after the backend repair: **6 passed**, including Codex,
  Claude Code, Claude Desktop and Antigravity adapters, geometry update,
  recovery checkpoint, refusal/cancellation and process cleanup.
- Author tests use deterministic offline fixture agents/MCP clients. Live vendor
  subscriptions, credentials and native application login are not qualified.
- An initially clean archived source tree reproduced a missing Telos dist
  prerequisite. The bootstrap now builds it explicitly. Clean-source final
  bootstrap evidence is recorded in the addendum below.
- Windows Chrome/Node 26.2 were used. No Linux container qualification is claimed:
  Docker's daemon was unavailable, and the installed WSL distribution had no
  Linux Node/.NET toolchain. No unrelated toolchains were modified.

Logs and screenshot evidence are ignored under `artifacts/local/` in this repo
and paired Aetheris `artifacts/local/demo-polish/`. No preview release was
published. Production viewport behavior and exact engineering geometry remain
owned by the existing shared renderer/compiler paths.

## Clean-source completion

The final patches were copied into the archived source trees, then Helios and
Telos `node_modules`, Telos `dist` and SDK `dist` were removed. From that state,
the README's `npm run sdk:link` completed without force or local tarball integrity
bypasses. `/local` built/rendered the real plate in all three fallback cases:
**3 passed**. Logs are paired Aetheris `artifacts/local/demo-polish/clean-bootstrap-qualified.log`
and `clean-browser-qualified.log`. Existing host .NET/Node and NuGet caches were
available; this is not a fresh operating-system/container claim.

The clean-container acceptance remains unqualified. The Windows path is proven;
Linux/macOS install behavior must not be inferred solely from these browser tests.

Final compiler refresh: `demo-polish-sdk-qualified.log` and
`demo-polish-build-qualified.log` pass; `demo-polish-browser-qualified.log`
records **28 passed** and `demo-polish-author-qualified.log` records **6 passed**
against the final accounting source. `git diff --check` passes in all three repos.
