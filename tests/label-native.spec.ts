import { test, expect, type Page } from '@playwright/test';
import { replaceEditorSource } from './editor';

const side = (n: number) => `face(bracket.Side("profile:section.Outer.Vertex${n}_Vertex${(n + 1) % 6}"))`;
const bracket = (pmi: string) => `Model SimpleBracket {
  units: mm
  Concept Struct layout on XZ {
    Polygon2<Explicit> outline {
      points: [[0mm,0mm], [30mm,0mm], [30mm,3mm], [3mm,3mm], [3mm,40mm], [0mm,40mm]]
    }
  }
  Profile section using layout {
    Loop Outer { outline |> TraceLoop }
  }
  Extrude bracket { profile: section; from: 0mm; to: 20mm }
  Pmi {
${pmi}
  }
}
`;

async function open(page: Page, source: string) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/local'); await expect(page.locator('.status-ready')).toContainText('Ready');
  await replaceEditorSource(page, source);
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.locator('.status-ready')).toContainText('Ready');
  await expect(page.locator('.status-problems, .statusbar')).not.toContainText(/[1-9]\d* problems?/);
  await page.getByRole('tab', { name: 'Label', exact: true }).click();
}
const records = (page: Page) => page.getByLabel('PMI records', { exact: true });
const ready = (page: Page) => expect(page.locator('.status-ready')).toContainText('Ready');

test('two faces of a native extrusion take a distance and a parallelism from the Label tab', async ({ page }) => {
  // A scratch record selects both faces the way a reader would: click it in the list. It is then deleted in place.
  await open(page, bracket(`    Distance Scratch { between: [${side(1)}, ${side(3)}] value: 27mm tolerance: PlusMinus(1mm, 1mm) }`));
  await records(page).getByRole('button', { name: /Scratch/ }).first().click();
  await expect(page.locator('.selection-chip')).toHaveCount(2);
  await records(page).getByRole('button', { name: 'Edit Scratch', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Edit Scratch', exact: true });
  await editor.getByRole('button', { name: 'Delete', exact: true }).click();
  await editor.getByRole('button', { name: 'Delete Scratch?', exact: true }).click();
  await ready(page);
  await expect(records(page)).not.toContainText('Scratch');

  // The same two faces, now unlabeled: the measured distance is offered first.
  const distance = page.getByRole('radio', { name: /^Distance 27\.000$/ });
  await expect(distance).toBeChecked();
  const form = page.getByRole('form', { name: 'Add Distance', exact: true });
  await form.getByLabel('Name', { exact: true }).fill('Reach');
  await form.getByLabel('Upper + (mm)', { exact: true }).fill('0.1');
  await form.getByLabel('Lower − (mm)', { exact: true }).fill('0.1');
  await expect(form.getByLabel('Source to write', { exact: true })).toHaveText(`Distance Reach { between: [${side(1)}, ${side(3)}] value: 27mm tolerance: PlusMinus(0.1mm, 0.1mm) }`);
  await form.getByRole('button', { name: 'Apply', exact: true }).click();
  await ready(page);
  await expect(records(page)).toContainText('Reach');

  // Parallelism of the first face to the second, which becomes datum A, with a free-state modifier.
  await page.getByRole('radio', { name: 'Parallelism to A', exact: true }).check();
  const parallel = page.getByRole('form', { name: 'Add Parallelism', exact: true });
  await parallel.getByLabel('Tolerance (mm)', { exact: true }).fill('0.05');
  await parallel.getByLabel('Free state Ⓕ').check();
  await expect(parallel.getByLabel('Source to write', { exact: true })).toHaveText(
    `Datum A { target: ${side(3)} }\nParallelism Parallelism { target: ${side(1)} tolerance: 0.05mm datumRefs: [A] modifiers: [FreeState] }`);
  await parallel.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(parallel.getByRole('button', { name: 'Preview', exact: true })).toBeEnabled();
  await expect(parallel.locator('.label-error')).toHaveCount(0);
  await parallel.getByRole('button', { name: 'Apply', exact: true }).click();
  await ready(page);
  await expect(records(page)).toContainText('Parallelism');
  // Controls the faces cannot take are listed with the reason, out of the way.
  await page.locator('.label-unavailable summary').click();
  await expect(page.locator('.label-unavailable')).toContainText('not perpendicular');

  // Edit the parallelism in place: tighter zone.
  await records(page).getByRole('button', { name: 'Edit Parallelism', exact: true }).click();
  const edit = page.getByRole('form', { name: 'Edit Parallelism', exact: true });
  await edit.getByLabel('tolerance', { exact: true }).fill('0.02mm');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await ready(page);
  await expect(records(page)).toContainText('0.02mm');
  // A datum in use cannot be deleted.
  await records(page).getByRole('button', { name: 'Edit A', exact: true }).click();
  await expect(page.getByRole('form', { name: 'Edit A', exact: true }).getByRole('button', { name: 'Delete', exact: true })).toBeDisabled();
});

test('a native hole is labeled by its name, with zone and material condition', async ({ page }) => {
  await open(page, `Model Plate {
  units: mm
  Box stock { size: [40mm, 30mm, 8mm] }
  Modify stock { Hole<Shaft> mount { on: +Z center: Point2(0mm, 0mm) diameter: 8mm end: ThroughAll } }
  Pmi {
    Datum A { target: face(-Z) }
    Cylindricity Scratch { target: mount tolerance: 0.1mm }
  }
}
`);
  await records(page).getByRole('button', { name: /Scratch/ }).first().click();
  await expect(page.locator('.selection-chip')).toHaveCount(1);
  await expect(page.getByRole('radio', { name: /^Recognize/ })).toHaveCount(0);
  await page.getByRole('radio', { name: 'Position', exact: true }).check();
  const form = page.getByRole('form', { name: 'Add Position', exact: true });
  await form.getByLabel('Tolerance Ø (mm)', { exact: true }).fill('0.1');
  await form.getByLabel('Material condition', { exact: true }).selectOption('LeastMaterial');
  await expect(form.getByLabel('Source to write', { exact: true })).toHaveText(
    'Position Position { target: mount tolerance: 0.1mm zone: Cylindrical datumRefs: [A] modifiers: [LeastMaterial] }');
  await form.getByRole('button', { name: 'Apply', exact: true }).click();
  await ready(page);
  await expect(records(page)).toContainText('Position');
  await expect(page.locator('.statusbar, .status-problems')).not.toContainText(/[1-9]\d* problems?/);
});

const pocketBlock = (pmi: string) => `Model PocketBlock {
  units: mm
  Profile stock = Rect2 { center: [0mm, 0mm]; size: [50mm, 32mm] }
  Profile recess = Rect2 { center: [0mm, 0mm]; size: [24mm, 14mm] }
  Compose Body {
    Base Stock { profile: stock; from: 0mm; to: 10mm; role: Stock }
    Pocket Recess { on: Top; profile: recess; depth: 4mm; minimumFloorThickness: 3mm }
  }
  Pmi {
${pmi}
  }
}
`;

test('faces of a composed part take requirements from the Label tab by their construction names', async ({ page }) => {
  await open(page, pocketBlock('    Distance Scratch { between: [face(Stock.Top), face(Recess.Floor)] value: 4mm tolerance: PlusMinus(1mm, 1mm) }'));
  await records(page).getByRole('button', { name: /Scratch/ }).first().click();
  await expect(page.locator('.selection-chip')).toHaveCount(2);
  await records(page).getByRole('button', { name: 'Edit Scratch', exact: true }).click();
  const editor = page.getByRole('form', { name: 'Edit Scratch', exact: true });
  await editor.getByRole('button', { name: 'Delete', exact: true }).click();
  await editor.getByRole('button', { name: 'Delete Scratch?', exact: true }).click();
  await ready(page);

  // The pocket's floor and the stock's top: the depth is measured and written against the caps' names.
  await expect(page.getByRole('radio', { name: /^Distance 4\.000$/ })).toBeChecked();
  const form = page.getByRole('form', { name: 'Add Distance', exact: true });
  await form.getByLabel('Name', { exact: true }).fill('Depth');
  await form.getByLabel('Upper + (mm)', { exact: true }).fill('0.1');
  await form.getByLabel('Lower − (mm)', { exact: true }).fill('0.1');
  await expect(form.getByLabel('Source to write', { exact: true })).toHaveText(/^Distance Depth \{ between: \[face\((Stock\.Top|Recess\.Floor)\), face\((Stock\.Top|Recess\.Floor)\)\] value: 4mm/);
  await form.getByRole('button', { name: 'Apply', exact: true }).click();
  await ready(page);
  await expect(records(page)).toContainText('Depth');
  await expect(page.locator('.status-problems, .statusbar')).not.toContainText(/[1-9]\d* problems?/);
});
