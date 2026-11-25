# Audit complet de SmartSecure : brief pour l'auditeur

Tu es un auditeur externe. **Lecture seule : ne modifie aucun fichier.** Ton livrable est ta dernière réponse :
un rapport en **français**, en Markdown, spécifique à ce dépôt.

## Contexte

- Lis d'abord `CLAUDE.md` à la racine : produit, architecture, décisions, limites connues.
- L'arbre de travail contient des changements non commités du 25/11/2026 (filtrage d'appels Android : position de la
  carte, annuaire rechargé tout seul, cartes « autre numéro »). Audite **l'état du disque**, pas seulement le dernier commit.
- Ne lis pas `.env` (valeurs locales de développement) ni `node_modules`.
- Dossiers : `apps/server` (API Fastify + Postgres), `apps/console` (Next.js, espace banque), `apps/mobile` (Expo, écrans
  dans `app/`, module natif dans `modules/vigie-protection/` en Kotlin et Swift, extensions iOS dans `targets/`),
  `apps/scanner` (navigateur isolé), `packages/shared` (types, téléphones, jetons de design).

## 1. Fonctionnement

- **Appel certifié** (annonce par le conseiller, vérification sur le téléphone) : suis le parcours de bout en bout,
  console → serveur → téléphone Android (`VigieCallScreeningService`, `PhoneStateReceiver`, `CallOverlay`) et iPhone.
  Cas limites à éprouver : usage unique, concurrence, expiration, hors connexion, numéro dans les contacts, numéro
  masqué, deux appareils sur le même compte, horloge du téléphone fausse, délai de 5 s du filtrage Android, annuaire
  périmé, annonce ouverte et appel d'un autre numéro, raccrochage automatique.
- **Analyse des messages** (SMS, messageries, mails) : règles, seuils de verdict, faux positifs et faux négatifs évidents,
  comportement sans clé IA ni Web Risk, ce que voit réellement l'utilisateur.
- **Mails** (IMAP, Microsoft Graph, Gmail), file de tâches Postgres, notifications push.
- **Console** : rôles superadmin, responsable, conseiller ; invitations ; journal d'activité ; statistiques.
- Liste les **écarts entre ce que `CLAUDE.md` affirme et ce que le code fait réellement**.

## 2. Sécurité

Menaces à prendre au sérieux : un escroc qui veut faire passer son appel pour certifié, faire apparaître du vert ou
faire disparaître du rouge ; un escroc qui détourne l'app, les SMS ou la console pour hameçonner ; un conseiller
malveillant ; un client ou un employé d'une autre banque ; un attaquant sur le même Wi-Fi.

À vérifier dans le code : authentification (code SMS, sessions, activation des comptes), autorisations et cloisonnement
entre banques (IDOR), limites de débit, injections SQL, SSRF (scanner, RDAP, liens analysés), authenticité des webhooks,
force brute des codes d'invitation, liens profonds `smartsecure://` et `vigie://`, composants Android exportés et
permissions (récepteurs, services, superposition d'écran, tapjacking), HTTP en clair du profil EAS `local`, données
envoyées au serveur par l'écoute des notifications, secrets et chiffrement, journalisation de données personnelles,
RGPD (minimisation, rétention, suppression de compte), dépendances à risque.

## 3. Critique

- Produit et UX pour des seniors : ce qui est confus, dangereux ou faussement rassurant (bandeau gris, textes des
  cartes, notifications, parcours d'activation).
- Dette technique, tests manquants les plus risqués, choix d'architecture discutables.
- Ce qui bloquerait une mise en production : Play Store (permissions sensibles, accès aux notifications, contacts),
  App Store, hébergement, exploitation.

## Format du rapport

1. **Synthèse** (10 lignes au plus) : verdict global et les 5 risques majeurs.
2. **Constats**, classés Critique / Élevé / Moyen / Faible. Pour chacun : un titre, `fichier:ligne`, un scénario concret
   d'exploitation ou de panne, une correction courte. Ne rapporte que ce que tu as vérifié dans le code ; sinon écris
   « hypothèse ».
3. **Écarts entre CLAUDE.md et le code.**
4. **Critique produit et UX** (10 points au plus).
5. **Plan d'action** : 10 actions, dans l'ordre de priorité.

Pas de paraphrase du code, pas de généralités, pas de compliments : uniquement des constats utiles et vérifiables.
