# Helios MVP readiness audit — 2026-09-24

Bar as stated: presentable, worth a subscription, and "not embarrassing like Zoo".
Read from the checked-in source, the release reports, the Leviathan API surface, and the
Zoo failure screenshot. Not a live run - the Windows `node_modules` in this checkout will
not execute under the Linux bridge, so the numbers below come from the reports rather than
from a fresh measurement.

## Verdict

Helios is not a prototype in the sense of being flimsy. The shell is a real CAD shell:
two designed themes, project explorer, model tree, viewport with named views and
display/selection modes, Monaco source panel, inspector with projected-field editing,
command palette, status bar carrying source/display revision, diagnostics, timings and
mesh counts. That is more product than most seed-stage CAD demos, and it is visibly more
finished than what the Zoo screenshot shows.

What is missing is not polish. It is three specific things: **the language service is too
thin for a code-first tool**, **first load is enormous**, and **there is no way to charge
anyone**. Everything else on the list below is secondary to those.

## What is already ahead of Zoo, and should be the whole pitch

The attached Zoo screenshot shows `BooleanSubtract resulted in errors: The Zoo engine
cannot handle this 3D subtraction yet` on a cylinder through a cylinder. That is the
second thing anyone tries in a CAD system. Helios does that operation and exports an
analytic AP242 STEP with no NURBS in it.

That is the demo. Not a feature tour - one model, the exact one Zoo failed on, built in
Helios in ten seconds, exported, and opened in SolidWorks or FreeCAD on the same screen.
"Their kernel cannot subtract a cylinder; ours exports a cylinder that is still a cylinder"
is a sharper claim than any UI comparison, and it is provable in front of a VC in a minute.
Everything in the MVP list below exists to make that minute work reliably.

Genuine assets already in hand: the analytic no-NURBS export (defensible and rare), the
publish/fork/gallery loop, source-as-truth with revision pinning, and a status bar that
tells the truth about staleness - which is exactly the honesty Zoo's silent-failure
screenshot lacks.

## Ranked: what will embarrass you

### 1. The language service does not cover the language (existential)

`HELIOS-LX-X0.md` states it plainly: `language.complete` returns fields only for Helix and
Loft owner contexts, no construct candidates or snippets at Model scope, and **no Box or
Hole field metadata at all**. Box and Hole are the first two things every user types. A
fresh tester could not build a Loft from a bare `Loft L {`.

For a code-first CAD this is not a gap, it is the product. If autocomplete does not know
the language, only someone who already knows Firmament can use Helios - and nobody does.
Zoo's KCL at least completes its own language. This has to be closed before anyone but you
can be handed the editor.

### 2. Diagnostics point at the wrong place with an internal code

Also from the LX report: a missing brace surfaces as `firmament-v2-source-required` at line
1:1. A missing brace is the single most common error a new user makes, and the product
answers it with an internal error code aimed at the top of the file. There are also no live
diagnostics - errors appear only on explicit rebuild.

This is the moment a demo dies. Someone types, it looks fine, they hit rebuild, and the
tool blames line 1 in compiler jargon. Live parse diagnostics with correct ranges matter
more than any new geometry feature.

### 3. First load is 62 MB of WebAssembly

`WEB-RUNTIME-PERF-X1.md`: the AOT native asset is 62,444,979 bytes; the production npm
package is 100.1 MB compressed, 186.4 MB unpacked. Zoo renders server-side and starts
instantly.

On a good connection that is roughly ten seconds of nothing before the first pixel of
geometry; on conference wifi it is a minute. The gallery is already correctly split so no
runtime loads before Fork, which helps - but the moment a visitor forks, they hit the wall.

Mitigations worth costing: ship the 4 MB non-AOT runtime for first paint and swap to AOT in
the background; or serve the first build's mesh precomputed from the publication so the
viewport has geometry while the runtime streams. Either way this needs a measured
time-to-first-triangle over a throttled connection, which does not exist yet.

### 4. Your best-looking gallery item cannot be edited

`HELIOS-DISCOVERY-X0.md`: the Cartesian lamp is the flagship, and it is not forkable as a
full assembly because `LoftFile<...>` needs a second source document while projects save one
source string. Only the shade is editable.

A visitor clicks the nicest thing in the gallery and hits a dead end. Either make the lamp
buildable as a single project, or demote it and promote something forkable to the hero slot.
The second option costs an afternoon.

### 5. Two undo systems that disagree

`commitHistory` only records on a *successful build*, and the toolbar arrows swap the whole
document, while Monaco has its own undo stack for the same text. Ctrl+Z and the ↶ button do
different things, and edits that failed to build vanish from one of them. This is a
five-minute discovery for any tester and reads as unfinished.

### 6. Nothing has ever been deployed

`HELIOS-TELOS-X0.md`: `docker compose config` parsed, the daemon was stopped, no image was
built, PostgreSQL migrations and the S3 adapter are unproven live. `worker-production-bundle.spec.ts`
is the one failing Playwright test because this checkout has a development SDK bundle.

You cannot demo a URL you have not deployed, and the first real deployment always surfaces
migration and CORS problems. This is the item with the least glory and the most schedule risk.

### 7. Smaller but visible

- No public STEP for user publications, so an anonymous visitor cannot verify the export
  claim that is your main differentiator. Only the pre-baked lamp STEP is downloadable.
- Model detail is a static PNG with zoom - no orbit. Zoo's detail pages are live.
- Firefox, Safari and cross-origin deployment are unqualified; only Chrome and one Edge pass.
- Source-range selection picks whole occurrences rather than exact faces.
- Inspector overrides have no reset.
- The editor sets `min-width: 1000px`, so there is no tablet story. Fine for CAD, but the
  gallery should degrade and the editor should say why rather than clipping.

## What blocks payment, specifically

Leviathan has **no billing of any kind**. Grepping the whole server for stripe, subscription,
billing, plan, quota or seat returns nothing, and the API surface is auth, projects,
publications, apps and platform capabilities. There is no plan on an account, no quota, no
paywall boundary and no payment integration.

So today the answer to "will people pay a subscription" is that they cannot, regardless of
how good the product is. Minimum to be able to charge:

- a plan field on the account and a free/paid boundary that something actually enforces -
  private project count, or STEP export, or storage, pick one and only one for the MVP;
- Stripe Checkout plus a webhook that flips that field, and a customer portal link for
  cancellation;
- a pricing page, terms, and a privacy policy;
- account deletion and source export, because investors and EU users both ask, and because
  "your CAD is locked in our database" is the objection that kills cloud CAD sales.

None of that is hard. All of it is load-bearing for the stated goal, and none of it exists.

## The MVP cut

The bar is "not embarrassing", which argues for one narrow path executed perfectly rather
than breadth. I would ship exactly this and visibly mark everything else as coming:

**The golden path.** Land on the gallery, click a part, fork it, change one dimension, watch
it rebuild, export a STEP, open it in FreeCAD. Every step of that path has to be fast,
correct and pretty. Nothing else needs to work for a demo to land.

To make that path hold:

1. Box and Hole field completion, plus construct candidates at Model scope. Without this the
   editor is unusable by strangers.
2. Live diagnostics with correct source ranges and human wording. Kill `firmament-v2-source-required`
   at 1:1 for a missing brace.
3. A measured, throttled time-to-first-triangle, and whatever runtime split gets it under
   about five seconds.
4. One undo. Delete the snapshot stack and let Monaco own it, or make the arrows drive Monaco.
5. Deploy it. Once, for real, with PostgreSQL and S3, behind the DNS name, and run the
   production Playwright config against the public host.
6. Billing boundary plus Stripe Checkout and a pricing page.
7. Make the hero gallery item forkable, and publish a downloadable STEP with each publication.

**Explicitly not in the MVP:** multi-file projects, assembly editing, hover docs, symbol
search, sheet metal, FEA, collaboration, mobile. Every one of those is a reasonable thing to
want and none of them changes whether the golden path lands.

## The strategic read

The usability ceiling of a code-first CAD is set by its language service, not its UI - and
Helios's UI is already past its language service. The DFH report identifies the same thing:
the real blocker is a public Aetheris language/project contract with parser-backed metadata,
a symbol index, precise diagnostics and multi-file compilation. That is the roadmap, and it
lives in Aetheris rather than in Helios.

Which is the right place for it, because it is also the moat. Zoo's problem is a kernel that
cannot subtract a cylinder. Yours is a kernel that can, with a thin language service in front
of it. Thin language services get thicker with ordinary work; kernels that cannot do booleans
do not get fixed by ordinary work. Bet the schedule accordingly - the geometry is done enough
to sell, and the things standing between here and a paid demo are all unglamorous.
