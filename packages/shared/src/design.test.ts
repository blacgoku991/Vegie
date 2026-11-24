import { test } from "node:test";
import assert from "node:assert/strict";
import { contrastRatio, controls, controlSeparation, tabularVariants, textScales, themes, touch, typeScale } from "./design.ts";
import { incompleteVerdict, verdicts } from "./verdict.ts";
import { iconPaths } from "./icons.ts";
import { formatPhone, normalizePhone } from "./phone.ts";

const AA = 4.5;

for (const [name, { palette, tones }] of Object.entries(themes)) {
  test(`[${name}] texte principal et secondaire lisibles (AA) sur le fond et les surfaces`, () => {
    for (const bg of [palette.paper, palette.surface, palette.surfaceHigh]) {
      for (const fg of [palette.ink, palette.inkSoft, palette.inkFaint, palette.accent]) {
        assert.ok(contrastRatio(fg, bg) >= AA, `${fg} sur ${bg} = ${contrastRatio(fg, bg).toFixed(2)}`);
      }
    }
    assert.ok(contrastRatio(palette.onAccent, palette.accentSolid) >= AA, "bouton principal");
    assert.ok(contrastRatio(palette.onAccent, palette.accentPressed) >= AA, "bouton principal appuyé");
    assert.ok(contrastRatio(palette.accent, palette.accentSoft) >= AA, "accent sur accentSoft");
    for (const fg of [palette.ink, palette.inkSoft, palette.inkFaint]) assert.ok(contrastRatio(fg, palette.accentSoft) >= AA);
  });

  test(`[${name}] chaque tonalité de verdict respecte l'AA (texte sur fond teinté, sur surfaces et sur aplat)`, () => {
    for (const [tn, t] of Object.entries(tones)) {
      assert.ok(contrastRatio(t.fg, t.bg) >= AA, `${name}/${tn} fg/bg = ${contrastRatio(t.fg, t.bg).toFixed(2)}`);
      assert.ok(contrastRatio(t.onSolid, t.solid) >= AA, `${name}/${tn} solid = ${contrastRatio(t.onSolid, t.solid).toFixed(2)}`);
      for (const bg of [palette.paper, palette.surface, palette.surfaceHigh]) {
        assert.ok(contrastRatio(t.fg, bg) >= AA, `${name}/${tn} fg sur ${bg} = ${contrastRatio(t.fg, bg).toFixed(2)}`);
      }
    }
  });
}

test("tailles d'une vraie app : texte courant 16 px, secondaire ≥ 13 px, seul le libellé d'onglet descend à 11", () => {
  for (const name of ["body", "bodyStrong", "action", "input", "subhead"] as const) assert.ok(typeScale[name].size >= 16, name);
  for (const [name, v] of Object.entries(typeScale)) assert.ok(v.size >= (name === "micro" ? 11 : 13), `${name} = ${v.size}`);
  assert.ok(tabularVariants.includes("numeric") && tabularVariants.includes("number"));
});

test("« Texte plus grand » : le réglage ne réduit jamais le texte", () => {
  assert.equal(textScales.normal, 1);
  assert.ok(textScales.large > 1 && textScales.larger > textScales.large);
});

test("aucune commande sous 40 px de haut, cible tactile de 44 px, 8 px entre deux commandes", () => {
  for (const [name, v] of Object.entries(controls)) assert.ok(v >= 40, `${name} = ${v}`);
  assert.ok(touch.min >= 44);
  assert.ok(controlSeparation >= 8);
});

test("le contour des champs se voit à 3:1 sur chaque surface, dans les deux thèmes", () => {
  for (const [name, { palette }] of Object.entries(themes)) {
    for (const bg of [palette.paper, palette.surface, palette.surfaceHigh]) {
      assert.ok(contrastRatio(palette.control, bg) >= 3, `[${name}] ${palette.control} sur ${bg} = ${contrastRatio(palette.control, bg).toFixed(2)}`);
    }
  }
});

test("chaque verdict possède un libellé, une icône dessinée et une couleur lisible dans les deux thèmes", () => {
  for (const v of [...Object.values(verdicts), incompleteVerdict]) {
    assert.ok(v.label.trim());
    assert.ok(iconPaths[v.icon].d.length);
    for (const { tones } of Object.values(themes)) assert.ok(contrastRatio(tones[v.tone].fg, tones[v.tone].bg) >= AA);
  }
});

test("normalisation des numéros français", () => {
  assert.equal(normalizePhone("06 12 34 56 78"), "+33612345678");
  assert.equal(normalizePhone("0033 6 12 34 56 78"), "+33612345678");
  assert.equal(normalizePhone("+33 (0)6 12 34 56 78"), "+33612345678");
  assert.equal(normalizePhone("3639"), "3639");
  assert.equal(normalizePhone("abc"), null);
  assert.equal(formatPhone("+33612345678"), "06 12 34 56 78");
});
