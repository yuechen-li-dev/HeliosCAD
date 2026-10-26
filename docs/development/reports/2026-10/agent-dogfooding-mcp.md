# Phase 4: the Helios MCP, used by an agent

## Method

Claude acted as the native desktop agent against a running Helios (Leviathan host, Claude Code
pairing, MCP over HTTP) and did one ordinary request end to end: *add four 5.5 mm through holes,
6 mm in from each corner of the 50 × 40 × 8 mm plate, and round the four vertical edges with 3 mm
fillets.* Each friction point was fixed in the layer that owned it, then the same request was run
again from a fresh pairing.

## What got in the way

| Friction | Fix |
| --- | --- |
| The request had to be typed twice: in the agent's chat and in Helios before any tool worked. | **Start desktop task** works with an empty box. `task_context` then reports `taskSource: native-chat` and tells the agent the request is in its chat. |
| `task_context` returned JSON-as-a-string inside JSON (`"` everywhere) and no host policy. | Plain fields: task, requirements, files with hashes, how the result will be applied, budget with end time, earlier turns, rules and workflow. |
| After a task ended, every call said "No active Helios candidate", whatever the cause. A 5-minute budget silently discarded work mid-task. | The host sends why it stopped (Stop, budget, page reload); the next call reports it and says no retyping is needed. Desktop tasks default to 20 minutes. |
| `schema` was 55 KB, mostly garments and scenes, and had no entry for Profile, Extrude, Compose or the 2D shapes: the everyday part path had to be guessed. | The compiler schema now declares Profile, Extrude, Compose, Base, Rect2, RoundedRect2, Circle2 and Slot2, each with a buildable entry (tested). `schema` returns a 13 KB index; `describe_construct` gives one construct's fields. |
| `edit_file` said only "candidate-edited"; a missing brace surfaced one build later. | `edit_file` returns the file's problems at once (syntax and admission). |
| `build` returned 10 KB of triangle ranges, `bounds: {}`, and nothing that said which features exist. | A summary: diagnostics with lines, bounds (computed from the mesh when not reported), bodies with features and hole diameters, faces by surface with diameters and readable feature names, parameters. 3.8 KB for the finished plate. |
| `outline` returned raw nodes with spans. | One row per declaration: id, kind, line, field text. |
| **An Extrude with a `Modify` hole built "successfully" with the hole silently missing.** The tree showed no holes and a ray through the hole centre hit the top face. | Aetheris now rejects it, naming the hole and the Compose form that cuts it (`firmament-v2-extrude-modify-feature-unsupported`). |
| Rounding vertical edges: `EdgeFinish` only finishes a face boundary, and Compose rejects fillets. | Not a tool fix: the schema now says to round corners in the Profile (RoundedRect2), which is what the finished task does. |
| No way to see whether the native client had connected. | The pairing line reads **connected ✓ · last call N s ago** from the server's last authenticated MCP request. |
| Auto-apply had no quick way back. | **After a successful build**: *Apply right away* (default, checkpoint first, **Undo AI changes** in one click while nothing else changed) or *Review the diff first*. |

## Result

Second run: start the task with no text, `task_context`, `schema`, `describe_construct Compose`,
two edits (Compose on a RoundedRect2 profile; four `Hole<Shaft>`), one build showing five holes
and four Ø6 corner faces, three rays confirming open holes and the rounded corner, `finish_task`.
Helios applied it; **Undo AI changes** restored the Box.

## Left open

- Diagnostics from the CLI/web admission path for this rejection anchor at line 1; the parser
  attaches the feature's span, but the string-code path drops it.
- The runtime tree names a Compose body after the Model (`WebBracket`) and a plain Extrude after
  its Profile; `build` reports the tree as given.
- `measure` is ray-only. Hole positions are checkable, but there is no "measure this feature".

## Evidence

- Leviathan `DesktopAuthorTests` (structured context, ended-task reason); Helios `agentResults`,
  `agentWorkspace`, `localAgent` and `WorkspacePanels` (undo) unit tests; author e2e (6) with
  presence, structured context, build summary, cancel reason and chat-only tasks.
- Aetheris `FirmamentSemanticSchemaTests`: every new entry builds as written; Extrude + Modify hole
  rejects with the Compose hint.
