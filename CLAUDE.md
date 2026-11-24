# Vigie : mémoire du projet

App mobile anti-arnaque pour les seniors français et leurs familles, plus une console web pour les banques.
Objectif : que l'utilisateur ne se fasse plus arnaquer, **sans rien avoir à faire** une fois l'app configurée.

## État (24/11/2026)

| Brique | État | Vérifié comment |
|---|---|---|
| `packages/shared` : design system (jetons), contrat d'API, icônes, téléphones | ✅ | tests contraste AA + normalisation (`npm test`) |
| `apps/server` : API Fastify + Postgres, file de tâches, moteur d'analyse | ✅ | 23 tests (15 moteur + 8 intégration API sur Postgres) |
| Appel certifié (console → push → app → confirmation → console en direct) | ✅ | parcours joué de bout en bout (navigateur + API) |
| Analyse mails/SMS : expéditeur, liens, site, texte → verdict + phrase | ✅ règles, ⚠️ IA non testée en réel | tests ; l'appel Claude compile mais n'a pas été exécuté (pas de clé) |
| Connexion boîtes mail : Outlook (Graph), IMAP (Orange/Free/SFR/La Poste/Bouygues), Gmail (flag) | ✅ code, ⚠️ non testé contre de vrais comptes | nécessite app Azure + vrais identifiants |
| `apps/scanner` : navigateur isolé (Playwright) | ✅ | tests SSRF + capture réelle ; sites externes bloqués par le réseau du bac à sable |
| `apps/mobile` : tous les écrans | ✅ | typecheck + export web + captures iPhone (Playwright) |
| Module natif Android (Kotlin) : filtrage d'appels, SMS/WhatsApp, raccrocher | ✅ compile hors module Expo | compilé contre l'API Android 14 + tests unitaires Kotlin ; `VigieProtectionModule.kt` (pont Expo) non compilé ici |
| Extensions iOS (Swift) : filtre SMS, annuaire d'appels, Partager | ✅ générées | `expo prebuild` crée les 3 cibles et les droits ; Swift non compilé (pas de Mac) |
| `apps/console` : Next.js (connexion, appeler, appel en cours, stats, faux appels) | ✅ | `next build` + parcours Playwright |

Comptes de démo (après `npm run seed -w @vigie/server`) : app `06 39 98 00 01` + code `000000` (DEV_FIXED_OTP) ;
console `conseiller@banque-horizon.test` / `vigie-demo`. Banque Horizon est fictive, ses numéros sont dans les plages
ARCEP réservées à la fiction (01 99 00…, 06 39 98…).

## Prochaine étape

1. **Premier build EAS** (`eas build -p android --profile development`) : valider la compilation du pont Kotlin/Swift
   et tester le filtrage d'appels sur un vrai téléphone Android 10+.
2. Créer l'app Azure (Microsoft Graph, « comptes de toute organisation + comptes personnels ») et tester Outlook réel.
3. Brancher l'IA en UE (Vertex AI `europe-west1`, `AI_PROVIDER=vertex`) et mesurer sur un jeu d'arnaques réelles.
4. Remplacer `api.vigie.example` (Info.plist du filtre SMS, `eas.json`) par le vrai domaine + fichier
   `apple-app-site-association` (`messagefilter` → app ET extension).

## Architecture

```
packages/shared   jetons du design system, types d'API, icônes, numéros (TS sans build)
apps/server       Fastify + pg ; src/analysis (moteur), src/mail (Graph/IMAP/Gmail), src/jobs (file Postgres)
apps/scanner      Chromium jetable (Playwright) dans un conteneur sans secret ni accès base
apps/console      Next.js 16 (App Router), /api/v1/* réécrit vers l'API (cookie httpOnly, pas de CORS)
apps/mobile       Expo SDK 58 + expo-router ; modules/vigie-protection (Kotlin/Swift) ; targets/ (extensions iOS)
```

Le TypeScript serveur s'exécute directement avec Node ≥ 22.18 (type stripping) : imports en `.ts`, pas d'enum
ni de `namespace` (`erasableSyntaxOnly`). Tests : `node --test`.

## Commandes

```bash
npm install
npm run db:up                       # Postgres local (docker compose) ; ou un Postgres 16 déjà présent
cp .env.example .env
npm run seed -w @vigie/server       # migrations + démo
npm run dev:server                  # API :4000 (+ workers)
npm run dev:console                 # console :3000
npm run dev:mobile                  # Expo (dev build)
npm run typecheck && npm test       # tout le dépôt
cd apps/mobile && npx expo export -p web   # aperçu web de l'app (dev uniquement)
```

## Décisions (et pourquoi)

- **Appel certifié = annonce + vérification**, pas d'interception audio. Le conseiller annonce l'appel depuis la console ;
  le serveur pousse « Appel certifié » (nom, agence ; le motif n'est visible que dans l'app). Tout appel « de la banque »
  sans annonce = **non certifié**. Point clé : les escrocs usurpent le *vrai* numéro de la banque, donc un appel depuis un
  numéro officiel **sans annonce** est justement le cas suspect (et il est remonté à la banque comme « numéro usurpé »).
- **Android** : `CallScreeningService` décide en local en < 5 s (annonce mémorisée, annuaire des numéros, numéros signalés),
  avec au plus 2,5 s d'appel serveur. Ne voit pas les contacts (on ne demande pas READ_CONTACTS : déclaration Play
  obligatoire depuis oct. 2026). Raccrochage auto en option (rejet si banque partenaire sans annonce, ou numéro signalé ≥ 5 fois).
  Vérification opérateur (STIR/SHAKEN = « MAN » en France) en échec → avertissement.
- **iOS** : pas d'accès aux appels en temps réel → bouton « On m'appelle de ma banque » + notification « time-sensitive »
  + annuaire CallKit (numéros signalés bloqués/étiquetés, numéros de banque étiquetés « vérifiez dans Vigie »).
  Live Caller ID Lookup (iOS 18) permettrait le temps réel mais exige un serveur PIR + validation Apple : plus tard.
- **SMS/messageries** : Android via `NotificationListenerService` ; seuls les messages avec lien, numéro ou demande d'argent
  partent au serveur, **jamais les SMS de code**. iOS : filtre SMS (inconnus uniquement, requête anonyme, rangement en
  « Indésirables » ; une extension iOS ne peut pas notifier) + extension Partager pour tout le reste.
- **Moteur d'analyse** : règles déterministes d'abord (marques imitées, domaines sosies, SPF/DKIM/DMARC du fournisseur,
  liens maquillés, âge du domaine RDAP, Web Risk), puis IA (Claude, sortie structurée, un seul appel texte + captures).
  L'IA peut **aggraver** un verdict, jamais l'adoucir. Données sensibles masquées avant envoi (carte, IBAN, adresses).
- **IA** : modèle `claude-opus-5-5` (configurable `AI_MODEL`), effort `medium`. API Anthropic : repli serveur activé
  (`fallbacks: "default"`) ; Vertex UE : pas de repli serveur, l'analyse retombe sur les règles en cas de refus.
  `inference_geo` de l'API Anthropic ne propose pas l'UE → **production = Vertex AI région UE**.
- **Réputation** : Google Web Risk (Safe Browsing gratuit = non commercial interdit). URLhaus optionnel (clé, licence
  commerciale à vérifier). OpenPhish communautaire et PhishTank exclus (non commercial / fermé).
- **RDAP** : fichier d'amorçage IANA (mis en cache 24 h) + secours `rdap.nic.fr` ; rdap.org seulement en dernier recours.
- **Mails** : jamais de corps stocké, seulement expéditeur, objet, verdict, explication. `postal-mime` (mailparser est en
  maintenance). IMAP : une connexion IDLE par boîte (à répartir entre processus à grande échelle).
  Microsoft Graph : abonnement renouvelé tous les ~3 jours (max < 7 j), réponse webhook < 3 s (file de tâches).
  Gmail : flag `FEATURE_GMAIL` (scope restreint → vérification Google + audit CASA annuel).
- **File de tâches sur Postgres** (`FOR UPDATE SKIP LOCKED`) : pas de Redis à opérer.
- **Sessions** : jetons opaques aléatoires, hachés en base (révocables). App : Keychain/Keystore (expo-secure-store).
  Console : cookie httpOnly SameSite=Strict, même domaine via réécriture Next.
- **Notifications** : service Expo (Google Cloud, transfert hors UE encadré) ; aucun contenu de message dans les
  notifications, seulement le verdict. Passage direct FCM/APNs possible plus tard.
- **Design** : fond papier chaud, encre presque noire, **un seul accent** (bleu Vigie `#2B3AD4`), Atkinson Hyperlegible Next
  (conçue pour les malvoyants), texte ≥ 17 px, boutons ≥ 64 px, contrastes AA vérifiés par test. Verdicts toujours
  icône + mot + couleur (vert sûr/certifié, orange douteux, rouge arnaque). Écrans de verdict d'appel = même structure
  (`VerdictScreen`). Animations coupées si « Réduire les animations ».
- **Numéros officiels des banques** : jamais inventés ; fournis par les banques partenaires (table `banks`).

## Sécurité & RGPD

- Hébergement UE (API, Postgres, scanner, IA via Vertex UE). Secrets uniquement en variables d'environnement.
- Secrets des boîtes mail chiffrés AES-256-GCM (`ENCRYPTION_KEY`, à mettre dans un KMS en production).
- Rétention : alertes « sûr » 30 jours, autres 13 mois ; suppression de compte = effacement en cascade (`DELETE /v1/me`).
- Scanner : protection SSRF (plages privées bloquées, y compris après redirection) ; en production, proxy de sortie
  qui refuse aussi les plages internes (`SCANNER_PROXY`).
- `npm audit` : alerte haute sur `@xmldom/xmldom` (outillage de build Expo uniquement, pas embarqué dans l'app).

## Limites connues / dettes

- Pas de limitation de débit par IP sur `/auth/start` (seulement 45 s par numéro et 5 essais par code) : ajouter un
  rate-limit au niveau du proxy ou de Fastify avant la production.
- `ILMessageFilterExtensionNetworkURL` codé en dur (`api.vigie.example`) dans `targets/VigieMessageFilter/Info.plist`.
- Le rôle Android de filtrage et la permission « Raccrocher » sont demandés depuis l'écran « Appels et messages ».
- Proches : prévenus par SMS (Brevo) ; pas encore d'app « famille » avec notifications push.
- Écrans testés en web (react-native-web) : vérifier le rendu natif dès le premier build EAS.
