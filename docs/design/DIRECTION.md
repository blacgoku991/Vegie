# SmartSecure — direction artistique (refonte du 24/11/2026)

Mot d'ordre : **calme, net, haut de gamme**. Moins d'effets, plus d'air. La marque se voit par petites touches
(logo, un filet, un bouton), jamais par de gros aplats sombres ou des décors.

À bannir partout : blocs bleu nuit/indigo pleine largeur, cercles concentriques et décors, titres en graisse 800,
dégradé sous du texte, ombres lourdes, plus d'une couleur vive par écran (hors verdicts).

## Marque

- Logo : `apps/mobile/assets/logo/smartsecure-icon.svg` (dégradé #6A4DFF → #B23CF5 → #FF6A3D).
- Accent unique : violet. Le dégradé complet n'apparaît que dans le logo et un filet de 2 px (ex. haut de la carte
  de connexion), jamais sous du texte.
- Verdicts inchangés dans leur principe : vert = sûr/certifié, orange = douteux/incomplet, rouge = arnaque,
  toujours icône + mot + couleur.

## Console banque (apps/console) — esprit Stripe / Linear

Public : conseillers et responsables, sur ordinateur. Densité professionnelle, tailles normales.

Typographie : **Inter** via `next/font/google` (400, 500, 600), chiffres tabulaires (`font-variant-numeric: tabular-nums`).
- Titre de page 24 px / 600 / interlettrage -0.02em ; sous-titre 14 px couleur atténuée.
- Texte 14 px (tableaux, formulaires), 15 px pour les paragraphes. Libellés de champ 13 px / 500.
- En-têtes de tableau 12 px / 500, majuscules, interlettrage 0.04em, couleur atténuée.

Couleurs (variables CSS, propres à la console ; ne plus les dériver de packages/shared) :

| Jeton | Clair | Sombre |
|---|---|---|
| fond | #FAFAFB | #0B0B0F |
| surface | #FFFFFF | #121218 |
| surface élevée / survol | #F4F4F6 | #1A1A22 |
| bordure | #E8E8ED | #25252E |
| texte | #0F0F14 | #EDEDF1 |
| texte atténué | #63636F | #9C9CA8 |
| accent | #5B47F5 | #8F80FF |
| accent doux (fond) | #F1EFFE | #1E1A3A |
| texte sur accent | #FFFFFF | #0B0B0F |

Contrastes AA obligatoires (texte atténué sur fond et surface compris).

Formes : rayon 10 px (cartes), 8 px (champs, boutons), bordures 1 px partout, ombre au plus
`0 1px 2px rgb(0 0 0 / 0.04)` en clair, aucune en sombre (la bordure suffit).

Mise en page :
- Barre latérale 248 px, même fond que la page, séparée par une bordure. Logo 28 px + « SmartSecure » 15 px / 600,
  nom de la banque en dessous en atténué. Entrées de navigation 14 px / 500, icône 18 px, hauteur 36 px ;
  entrée active = fond surface élevée + texte plein + petite barre accent à gauche. Bas de barre : sélecteur de thème
  compact (3 segments) et carte utilisateur (initiales en pastille, nom, rôle).
- Contenu : largeur max 1120 px, marges 32 px, en-tête de page (titre + sous-titre à gauche, action principale à
  droite), puis sections espacées de 32 px.
- Cartes : surface + bordure, padding 20-24 px, titre de carte 15 px / 600.
- Tableaux : lignes de 52 px, séparateurs 1 px, survol en surface élevée, pas de zébrures.
- Pastilles d'état : 12 px / 500, point coloré + libellé, fond teinté doux.
- Boutons : primaire = accent plein ; secondaire = surface + bordure ; fantôme. Hauteur 36 px (40 px pour l'action
  principale de page). Focus visible : anneau 2 px accent à 30 % d'opacité.
- Indicateurs (Statistiques) : cartes KPI, chiffre 30 px / 600 tabulaire, libellé 13 px atténué, petite tendance.
- Connexion : fond uni avec une lueur radiale très légère du violet en haut ; carte centrée 400 px (logo 40 px
  au-dessus, titre 22 px, filet dégradé 2 px en haut de la carte) ; pas de demi-écran coloré.
- Code d'invitation : chiffres 40 px / 600 tabulaires, espacés, dans une carte sobre, QR à côté, minuteur discret.

## App mobile : section abandonnée, voir `docs/design/APP.md` (direction « Noir »)

Contraintes non négociables : texte ≥ 17 px, actions ≥ 64 px, contrastes AA clair et sombre (tests de
packages/shared), « Réduire les animations » respecté.

Typographie : Atkinson Hyperlegible Next (déjà chargée), **jamais 800** ; au plus 700.
- Affichage 30 px / 700 / interligne 1.15 / interlettrage -0.4 ; titre 24 px / 700 ; intertitre 20 px / 600 ;
  texte 18 px / 400 / interligne 1.45 ; libellé 17 px / 600.

Couleurs :

| Jeton | Clair | Sombre |
|---|---|---|
| fond | #F5F5F7 | #0B0B0F |
| surface (cartes) | #FFFFFF | #16161C |
| surface élevée | #EEEEF2 | #1F1F27 |
| filet | #E4E4EA | #2A2A34 |
| texte | #111116 | #F2F2F5 |
| texte atténué | #5C5C68 | #A4A4B0 |
| accent | #5B47F5 | #9585FF |
| accent doux | #EFEDFE | #221D40 |

Formes : cartes rayon 22 px, sans bordure en clair (ombre très douce `0 1px 2px rgb(17 17 26 / 0.04),
0 8px 24px rgb(17 17 26 / 0.05)`), bordure 1 px filet en sombre. Boutons 64 px, rayon 18 px, texte 18 px / 600.
Pastilles d'icône 44 px en accent doux.

Écrans :
- Bienvenue : logo 72 px centré en haut, titre « SmartSecure veille sur vous. » centré, phrase atténuée, une carte
  blanche avec les 3 bénéfices (pastille d'icône + texte), bouton « Commencer » en bas. Aucun bloc sombre.
- Connexion / code : titre, phrase, un grand champ (hauteur 64 px, rayon 16 px, texte 22 px tabulaire), bouton bas.
- Accueil : « Bonjour Jeanne » (atténué, 18 px) puis une carte d'état (pastille d'icône 56 px teintée selon l'état,
  mot « Protégé » / « À vérifier » en titre, phrase courte), puis le geste principal « On m'appelle de ma banque »
  (bouton accent 72 px), puis les gestes secondaires en liste groupée façon Réglages iOS.
- Écrans de verdict (certifié, non certifié, alerte) : en-tête teinté doux de la couleur du verdict, grande pastille
  d'icône, mot du verdict, phrase ; carte d'informations ; actions en bas. Plus sobre qu'aujourd'hui, même structure.
- Listes (réglages, historique, banques) : groupes de lignes dans une carte, lignes ≥ 64 px, chevron discret.
- Barre d'onglets : surface, filet en haut, icône 26 px.
