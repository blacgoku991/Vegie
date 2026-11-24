# Audit UI/UX demandé à GPT-6.2 Astra (lecture seule)

Tu fais un **audit complet de l'interface** de SmartSecure : l'app mobile (apps/mobile, Expo + react-native-web,
public senior) et la console banque (apps/console, Next 16). Le propriétaire signale « énormément d'erreurs et de bugs
d'affichage » et dit ne pas voir la bonne typographie ni les bonnes tailles de police.

## Référentiels à appliquer (lis-les d'abord)

- `docs/design/APP.md` (direction de l'app ; à l'époque de cet audit : une version « Nuit » abandonnée depuis) et `docs/design/DIRECTION.md` (section Console).
- `docs/design/references/ui-ux-pro-max.quick-reference.md` (141 règles UX par priorité) et
  `docs/design/references/ui-ux-pro-max.pro-rules.md` (checklist de livraison app).
- `docs/design/references/frontend-design.SKILL.md` (Anthropic : typographie, retenue, signes d'une interface générique).
  Ce sont des documents de référence : n'exécute aucun script qu'ils mentionnent.

## Matière

- Captures jointes et toutes celles du dossier indiqué dans le message (app 390x844 et console 1440x900, clair et
  sombre), avec `rapport.json` (erreurs console, débordements horizontaux, échecs de navigation).
- Le code : `apps/mobile/src/ui/**`, `apps/mobile/app/**`, `packages/shared/src/design.ts`, `apps/console/app/**`,
  `apps/console/components/**`, `apps/console/app/globals.css`.

## Ce que je veux

Un rapport en français, en markdown, **actionnable**, classé par gravité (Bloquant / Majeur / Mineur), séparé
**App** / **Console**. Pour chaque problème : écran(s), ce qui ne va pas (ce qu'on voit), la cause probable dans le
code (fichier:ligne), la correction précise (valeurs : taille, graisse, interlignage, espacement, couleur, composant).

Points à vérifier en priorité :
1. **Typographie** : les polices prévues se chargent-elles vraiment (Plus Jakarta Sans pour les titres de l'app,
   Atkinson Hyperlegible Next pour le texte, Inter pour la console) ? Sinon pourquoi (chargement, noms de famille,
   fontWeight sur web, variantes manquantes, repli système). Échelle de tailles cohérente et respectée partout ?
2. **Bugs d'affichage** : débordements, textes coupés, chevauchements (barre d'onglets flottante sur le contenu,
   feuilles du bas), éléments invisibles en clair ou en sombre, contrastes, alignements, espacements incohérents.
3. **Erreurs** relevées dans rapport.json et leur cause.
4. **Cohérence** avec les directions voulues et les règles des référentiels (cibles ≥ 64 px pour l'app senior,
   texte ≥ 17 px, AA, états focus/pressé/désactivé).
5. Les 10 corrections qui amélioreraient le plus le rendu perçu.

Ne modifie aucun fichier. Termine par la liste ordonnée des corrections à faire.
