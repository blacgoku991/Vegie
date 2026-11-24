import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, palette, tones, typeScale, touch } from "./design.ts";
import { formatPhone, normalizePhone } from "./phone.ts";

const AA = 4.5;

test("texte principal et secondaire lisibles (AA) sur le fond et les surfaces", () => {
  for (const bg of [palette.paper, palette.surface]) {
    for (const fg of [palette.ink, palette.inkSoft, palette.inkFaint, palette.accent]) {
      assert.ok(contrastRatio(fg, bg) >= AA, `${fg} sur ${bg} = ${contrastRatio(fg, bg).toFixed(2)}`);
    }
  }
  assert.ok(contrastRatio(palette.onAccent, palette.accent) >= AA);
  assert.ok(contrastRatio(palette.accent, palette.accentSoft) >= AA);
});

test("chaque tonalité de verdict respecte l'AA (texte sur fond teinté et sur aplat)", () => {
  for (const [name, t] of Object.entries(tones)) {
    assert.ok(contrastRatio(t.fg, t.bg) >= AA, `${name} fg/bg = ${contrastRatio(t.fg, t.bg).toFixed(2)}`);
    assert.ok(contrastRatio(t.onSolid, t.solid) >= AA, `${name} solid = ${contrastRatio(t.onSolid, t.solid).toFixed(2)}`);
    assert.ok(contrastRatio(t.fg, palette.surface) >= AA, `${name} fg/surface`);
  }
});

test("aucun texte sous 17 px, cibles tactiles ≥ 48 px", () => {
  for (const v of Object.values(typeScale)) assert.ok(v.size >= 17);
  for (const v of Object.values(touch)) assert.ok(v >= 48);
});

test("normalisation des numéros français", () => {
  assert.equal(normalizePhone("06 12 34 56 78"), "+33612345678");
  assert.equal(normalizePhone("0033 6 12 34 56 78"), "+33612345678");
  assert.equal(normalizePhone("+33 (0)6 12 34 56 78"), "+33612345678");
  assert.equal(normalizePhone("3639"), "3639");
  assert.equal(normalizePhone("abc"), null);
  assert.equal(formatPhone("+33612345678"), "06 12 34 56 78");
});
