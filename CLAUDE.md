# SmartSecure — mémoire du projet

App mobile anti-arnaque pour les seniors français et leurs familles, plus une console web pour les banques.
Objectif : que l'utilisateur ne se fasse plus arnaquer, **sans rien avoir à faire** une fois l'app configurée.

**Nom commercial : SmartSecure** (famille SmartFixx : SmartRemote, SmartInventory). « Vigie » reste le nom de code
interne (dépôt, projet Expo `@blsckgolu/vigie`, module natif, cibles iOS). Identifiant iOS/Android définitif :
`fr.smartfixx.antiarnaque` (`fr.vigie.app` est pris chez Apple). App Store Connect : « SmartSecure - Anti-arnaque »,
ascAppId `6838742540`. Logo : `apps/mobile/assets/logo/make-icons.mjs` (dégradé #6A4DFF → #B23CF5 → #FF6A3D).
Builds du 24/11/2026 : Android dev OK (pont Kotlin compilé, ancien identifiant), iOS production OK + envoyé sur
TestFlight (Swift + 3 extensions compilés). Identifiants Apple gérés par EAS ; session Apple mémorisée sur le PC.
Les interfaces et les SMS utilisent SmartSecure. Le schéma historique `vigie://` reste accepté pour les anciens liens.

## État (24/11/2026)

| Brique | État | Vérifié comment |
|---|---|---|
| `packages/shared` : design system (jetons), contrat d'API, icônes, téléphones | ✅ | tests contraste AA + normalisation (`npm test`) |
| `apps/server` : API Fastify + Postgres, file de tâches, moteur d'analyse | ✅ | Tests du moteur et tests d’intégration sur Postgres, y compris sessions, rôles et concurrence |
| Appel certifié (console → push → app → confirmation → console en direct) | ✅ | parcours joué de bout en bout (navigateur + API) |
| Analyse mails/SMS : expéditeur, liens, site, texte → verdict + phrase | ✅ règles, ⚠️ IA non testée en réel | tests ; l'appel Claude compile mais n'a pas été exécuté (pas de clé) |
| Connexion boîtes mail : Outlook (Graph), IMAP (Orange/Free/SFR/La Poste/Bouygues), Gmail (flag) | ✅ code, ⚠️ non testé contre de vrais comptes | nécessite app Azure + vrais identifiants |
| `apps/scanner` : navigateur isolé (Playwright) | ✅ | tests SSRF + capture réelle ; sites externes bloqués par le réseau du bac à sable |
| `apps/mobile` : tous les écrans | ✅ | typecheck + export web + captures iPhone (Playwright) |
| Module natif Android (Kotlin) : filtrage d'appels, SMS/WhatsApp, raccrocher | ✅ compile (build EAS réussi) | build EAS `development` Android OK le 24/11 (pont Expo compris) ; reste à tester sur un vrai téléphone |
| Extensions iOS (Swift) : filtre SMS, annuaire d'appels, Partager | ✅ build iOS antérieur | Les dernières modifications Swift et Kotlin attendent un nouveau build et un essai sur téléphone |
| `apps/console` : Next.js (connexion, appeler, appel en cours, stats, faux appels) | ✅ | `next build` + parcours Playwright |

Comptes de démo (après `npm run seed -w @vigie/server`) : app `06 39 98 00 01` + code `000000` (DEV_FIXED_OTP) ;
console `conseiller@banque-horizon.test` / `vigie-demo`, responsable `responsable@banque-horizon.test` / `vigie-demo`,
superadmin `admin@smartsecure.test` / `smartsecure-admin`. Banque Horizon est fictive, ses numéros sont dans les plages
ARCEP réservées à la fiction (01 99 00…, 06 39 98…).

## Expo / EAS (déjà configuré, ne rien redemander)

- Projet Expo : `@blsckgolu/vigie` (projectId `ad30c03a-7e67-45c4-b712-633694be77f3`, inscrit dans `app.config.ts`).
- Environnement cloud Claude Code **« Vegie »** : autorise `api.expo.dev`, `expo.dev`, `exp.host` et porte le jeton Expo
  comme secret réseau (injecté par le proxy). Lancer EAS avec un jeton factice :
  `cd apps/mobile && EXPO_TOKEN=proxy-injected npx eas-cli@latest build -p android --profile development --non-interactive`
- Builds : https://expo.dev/accounts/blsckgolu/projects/vigie/builds

## Refonte des parcours (24/11/2026)

- **Accueil mobile.** Les premiers gestes sont « Vérifier l’appel », « Rappeler ma banque » et « Vérifier un message ». Le diagnostic détaille les appels, les messages et les mails. Chaque état vient du téléphone ou de l’API. L’aperçu web propose les gestes manuels.
- **Rappel hors connexion.** Seul le numéro de rappel fourni par la banque est mémorisé, avec la date de synchronisation et l’identité du compte local. Le retrait d’une banque renouvelle le cache. La déconnexion l’efface. L’écran de rappel indique aussi où trouver le numéro sur sa carte ou son relevé.
- **Annonce d’appel.** Le responsable déclare la ligne directe dans Équipe. Le conseiller ne peut pas la remplacer au moment de l’appel. Une seule annonce ouverte par client, pendant dix minutes. Android demande une décision serveur pour le premier numéro concordant. Une vérification manuelle établit seulement l’existence de l’annonce. « J’ai lu l’annonce » accuse réception. La console distingue cet accusé de réception, l’annonce et sa fin.
- **Console.** Le superadmin gère les banques et leurs responsables. Le responsable affecte les rôles, agences et lignes de son équipe. Le conseiller recherche un client, vérifie son identité et peut lui remettre une invitation. Le QR conserve le code pendant la connexion SMS. L’utilisateur doit le valider lui-même. Activation du compte, mise à jour du mot de passe et révocation des sessions sont transactionnelles.
- **Mesure.** Les statistiques distinguent les annonces, les accusés de réception, les clients reliés, les appels suspects pour lesquels le client a raccroché et les ouvertures du composeur pour rappeler. Une ouverture du composeur ne mesure pas un appel abouti. Un numéro officiel affiché dans un signalement ne prouve pas une usurpation.
- **Messages et proches.** L’historique sépare les vérifications incomplètes des messages sans signe détecté. Pour les nouvelles analyses, le titre sans objet est générique et les liens stockés sont limités au domaine. Les domaines seuls sont aussi renvoyés à la lecture des anciennes alertes. Les proches peuvent être appelés depuis leur fiche. L’envoi automatique de SMS est désactivé à la création d’un compte dans l’application. Les préférences existantes sont respectées.
- **Validation web locale.** Parcours de démonstration vérifiés sur les services en cours avec Chromium, y compris les trois rôles, le lien d’invitation avant connexion, la concordance de numéro dans le simulateur, le refus du rejeu, le rappel hors connexion et les thèmes clair/sombre. Les vérifications navigateur ne couvrent pas la téléphonie native.

## Prochaine étape

1. **Rebuild EAS** (nouvel identifiant, logo, correctifs Kotlin/Swift de l'audit du 24/11 non compilés) puis tester le
   filtrage d'appels sur un vrai Android 10+. iOS : identifiants déjà créés (4 profils, certificat équipe 9642GYNCU9,
   clé App Store Connect `QN3CRFKK2K`), les builds peuvent partir en non interactif :
   `cd apps/mobile && npx eas-cli build -p ios --profile production --auto-submit --non-interactive`.
   Mettre le serveur en ligne (UE) : sans lui, l'app TestFlight ne se connecte pas (`api.vigie.example`).
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
  le serveur pousse « Appel annoncé » (nom, agence ; le motif n'est visible que dans l'app). Tout appel « de la banque »
  sans annonce = **non certifié**. Point clé : les escrocs usurpent le *vrai* numéro de la banque, donc un appel depuis un
  numéro officiel **sans annonce** est justement le cas suspect (et il est remonté à la banque comme « numéro usurpé »).
- **Android** : `CallScreeningService` compare le numéro entrant à la ligne annoncée, avec une vérification serveur courte et à usage unique. Aucune certification hors connexion ou si la vérification opérateur échoue. Le rejet automatique est une option pour les numéros publics des banques partenaires. Les signalements communautaires déclenchent un avertissement. Le service ne lit pas les contacts.
- **iOS** : pas d'accès aux appels en temps réel → bouton « On m'appelle de ma banque » + notification « time-sensitive »
  + annuaire CallKit (numéros signalés étiquetés, numéros de banque étiquetés « vérifiez dans SmartSecure »).
  Live Caller ID Lookup (iOS 18) permettrait le temps réel mais exige un serveur PIR + validation Apple : plus tard.
- **SMS/messageries** : Android via `NotificationListenerService` ; seuls les messages avec lien, numéro ou demande d'argent
  partent au serveur, les SMS reconnus comme contenant un code sont exclus. iOS : filtre SMS (inconnus uniquement, requête anonyme, rangement en
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
- **Mails** : les nouvelles alertes conservent l’expéditeur, l’objet s’il existe, le verdict, les vérifications et les domaines. `postal-mime` (mailparser est en
  maintenance). IMAP : une connexion IDLE par boîte (à répartir entre processus à grande échelle).
  Microsoft Graph : abonnement renouvelé tous les ~3 jours (max < 7 j), réponse webhook < 3 s (file de tâches).
  Gmail : flag `FEATURE_GMAIL` (scope restreint → vérification Google + audit CASA annuel).
- **File de tâches sur Postgres** (`FOR UPDATE SKIP LOCKED`) : pas de Redis à opérer.
- **Sessions** : jetons opaques aléatoires, hachés en base (révocables). App : Keychain/Keystore (expo-secure-store).
  Console : cookie httpOnly SameSite=Strict, même domaine via réécriture Next.
- **Notifications** : service Expo (Google Cloud, transfert hors UE encadré) ; aucun contenu de message dans les
  notifications, seulement le verdict. Passage direct FCM/APNs possible plus tard.
- **Design** (24/11, choisi par le propriétaire après 6 versions refusées) : app en direction « Noir » (noir et blanc façon app
  bancaire, couleur réservée aux verdicts, Inter, tailles d'une vraie app + réglage « Taille du texte ») : `docs/design/APP.md`.
  Console sobre façon Stripe/Linear (Inter, couleurs propres) : `docs/design/DIRECTION.md`. Toujours montrer une maquette
  (`docs/design/maquettes/`) et la faire choisir AVANT de coder un nouveau style. AA testé, verdicts icône + mot + couleur.
- **Console multi-banques** : rôles `superadmin` (sans banque, crée les banques + 1er responsable), `bank_admin` (équipe, agences,
  numéros officiels, lignes directes de SA banque), `advisor` (appels, invitations). Droits contrôlés côté serveur (`context.ts` :
  `requireAdvisor/BankAdmin/Superadmin`, 403 hors périmètre ; compte désactivé = connexion 403 + sessions coupées). Création de compte =
  jeton d'activation haché, 72 h, usage unique (`/activate`, mot de passe ≥ 12) . Le développement fournit le lien dans la console.
- **Invitation client** : conseiller → code lié au numéro du dossier client, 6 chiffres + QR (`smartsecure://join?code=`), 15 min, usage unique, haché ; app → `POST /me/banks/join`
  (5 essais / 15 min, réponse identique si inconnu/expiré) → lien `certified` direct. Annonce d'appel : ligne directe obligatoire, jamais un numéro officiel public (`caller_number_required`).
- **Console v2** : barre latérale par rôle (Tableau de bord, Clients, Appels, Invitations, Signalements, Activité ; Administration : Équipe, Agences, Numéros officiels, Journal d'activité). Fiche client `/clients/[id]` (Aperçu, Appels, Signalements, Notes, Journal) servie par `/console/customers/*` (`routes-clients.ts`) : 404 hors banque, téléphone masqué pour un conseiller, dissocier réservé au responsable (le lien repasse en « basic »). RGPD : la banque ne voit que le lien, ses appels, ses signalements et ses notes (`client_notes`), jamais alertes, proches ni autres banques.
- **Journal d'activité** : table `audit_events` (migration 005), alimentée par `services/audit.ts` dans les routes (connexion, annonce, invitation, lien, notes, équipe, réglages) ; métadonnées non sensibles (jamais de téléphone ni de code). `user_banks.referent_id` = conseiller référent. Invitation annulable (`cancelled_at`), annonce d'appel déplacée sur `/announce`.
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
- Brancher le transport d’e-mail transactionnel pour les liens d’activation avant l’ouverture de la console en production.
- Les alertes historiques gardent leur rétention. Les anciennes URL sont réduites au domaine dans les réponses API ; leur stockage antérieur n’a pas été réécrit.
- Les proches sont joignables par SMS ou par appel. Leur propre parcours d’acceptation ou de révocation reste à développer.
- Écrans testés en web (react-native-web) : vérifier le rendu natif dès le premier build EAS.
