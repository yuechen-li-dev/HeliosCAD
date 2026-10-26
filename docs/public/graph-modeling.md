# Make a part through the graph

Use the graph to create a block, drill holes, finish edges and export exact
geometry without writing Firmament. No AI connection is needed.

1. Choose **New part**. In **Choose base shape**, keep **Box**, enter Size X = 60,
   Y = 40 and Z = 12 mm, then **Preview → Apply**. The block is centred in X/Y;
   its bottom is at Z = 0.
2. Select the **Body** card. Click **Add hole…** beside its values. Leave **On**
   at +Z for the top face. Set Center X = 8, Y = 4 mm, Diameter = 8 mm, and
   **End → Through all**. **Preview** displays the candidate. **Apply** commits it.
3. Click the hole's row in the Modify card to edit it. Change X, Y and diameter,
   then click **Apply changes** once. **Discard edits** resets unapplied values.
   Changing focus between fields does not rebuild the part.
4. Click **Chamfer…** or **Fillet…**. Keep the top face and Boundary target;
   enter a distance or radius such as 0.5 mm. **Preview → Apply**.
5. Use **Export → STEP AP242 → Download selected format**. **Save source**
   downloads the editable design. Save before closing or refreshing a local tab.

**Counterbored hole…**, **Countersunk hole…** and **Blind hole…** use the same
placement workflow. A blind hole has a **Blind depth** input. In the End control,
you can switch between through and blind termination. **Other expression…**
retains access to parameter references and other compiler-admitted expressions.

Center X/Y are measured in the support face's local frame, from its authored
origin; they are not screen coordinates. **Use picked face** copies a retained,
source-addressable support from the viewport. Unsupported or unmapped faces are
not substituted with another face. **Field help** explains the compiler's fields.

Use **Pocket…** for a finite recess; **+ Add** opens the full catalog. A part has
one material body. Choosing another base replaces that base and checks its
existing downstream features. Use an Assembly for separate parts.

## Drafts, failures and history

A placement preview does not change working source. **Cancel** leaves the
accepted design intact. Editing an existing node and choosing **Apply changes**
changes source and builds it. If that build fails, the last good geometry stays
visible and is marked out of date. The inspector reports the diagnostic and
offers **Revert to last good**. This also resets the displayed fields.

Toolbar **Undo/Redo** reverses complete source transactions and rebuilds. Escape
discards the focused field's pending text; it does not commit it on blur.
During a build or graph refresh, edit controls are temporarily disabled so that
another operation cannot target an older source revision. Apply or discard
unapplied field edits before switching selections.

The compiler admits supported feature combinations; the graph does not broaden
kernel capabilities. Angular mold Draft is currently a legacy V1 operation and
is not exposed as a V2 graph feature. A saved or failed editing draft is a
different concept. Arbitrary-body fillets and every face/feature combination
are not supported. A rejected preview reports the actual failure.

See [exports](exports.md), [standalone setup](standalone.md) and the
[Firmament language reference](https://github.com/yuechen-li-dev/Aetheris/blob/master/docs/public/reference/language/README.md).
