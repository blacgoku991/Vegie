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
| Module natif Android (Kotlin) : filtrage d'appels, SMS/WhatsApp, raccrocher | ✅ filtrage d'appels testé sur émulateur Android 15 (25/11) | popups vert/rouge, rejet automatique, raccrocher, téléphone verrouillé, app arrêtée, usage unique ; reste un vrai téléphone (Samsung) et la surveillance SMS/WhatsApp |
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

Émulateur Android (SDK d'Android Studio déjà installé, AVD `SmartSecure_Test`, Android 15) : simule de vrais appels entrants.

```bash
emulator -avd SmartSecure_Test                 # dans %LOCALAPPDATA%\Android\Sdk\emulator
adb install -r <apk du build EAS development>  # puis ouvrir l'app sur le serveur Metro du PC :
adb shell am start -a android.intent.action.VIEW -d "exp+vigie://expo-development-client/?url=http%3A%2F%2F<IP du PC>%3A8081"
adb emu gsm call +33199001234                  # appel entrant (ligne directe de démo) ; +33199000000 = numéro public
adb emu gsm cancel +33199001234
```

## Décisions (et pourquoi)

- **Appel certifié = annonce + vérification**, pas d'interception audio. Le conseiller annonce l'appel depuis la console ;
  le serveur pousse « Appel annoncé » (nom, agence ; le motif n'est visible que dans l'app). Tout appel « de la banque »
  sans annonce = **non certifié**. Point clé : les escrocs usurpent le *vrai* numéro de la banque, donc un appel depuis un
  numéro officiel **sans annonce** est justement le cas suspect (et il est remonté à la banque comme « numéro usurpé »).
- **Android** : `CallScreeningService` compare le numéro entrant à la ligne annoncée, avec une vérification serveur courte et à usage unique. Aucune certification hors connexion ou si la vérification opérateur échoue. Le rejet automatique est une option pour les numéros publics des banques partenaires. Les signalements communautaires déclenchent un avertissement. Le service ne lit ni noms ni carnet : avec la permission Contacts (facultative), il demande seulement si le numéro entrant est enregistré. Si le téléphone ne connaît pas l'annonce (notification non reçue, app pas rouverte), le service la demande à `GET /v1/me/calls/expected` (sans effet de bord, annonces déjà utilisées exclues) : le numéro entrant n'est jamais envoyé pour cette question, seulement à `/me/calls/check` quand il concorde. Conséquence à déclarer (RGPD) : le serveur voit qu'un appel hors contacts est arrivé, pas de qui. La même réponse porte `announcers` (banques partenaires reliées en « certifié ») : numéro inconnu + aucune annonce ouverte → petit bandeau gris « <Banque> n'a annoncé aucun appel » (réglage `unknownCallBanner`, activé par défaut ; rien hors ligne). **Contacts : Android ne transmet pas au filtrage les appels des numéros enregistrés** (vérifié sur émulateur). Secours sans lire les contacts, vérifié le 25/11 : `PhoneStateReceiver` (diffusion `PHONE_STATE`, permission `READ_PHONE_STATE`, sans numéro) repère une sonnerie que le filtrage n'a pas vue → c'est un contact → bandeau gris « n'a annoncé aucun appel » ou « a annoncé un appel, numéro non vérifiable » (réglage `contactCallBanner`), jamais de vert. Le même récepteur ferme la carte à la fin de l'appel. Permission `READ_CONTACTS` acceptée par le propriétaire le 25/11 (facultative, carte « Vérifier aussi mes contacts » ; `Contacts.isContact` = simple recherche locale du numéro entrant) : vérifié sur émulateur Android 15 : avec la permission, Android transmet les appels de contacts au filtrage (numéro public enregistré → rouge, ligne annoncée enregistrée → vert, proche → rien, même pendant une annonce) ; Google Play exige une déclaration pour cette permission (obligatoire le 27/01/2027 pour les apps ciblant l'API 37+). **Hors connexion** (vérifié) : numéro public de banque partenaire → carte rouge « Appel non vérifié » ; numéro inconnu ou contact → bandeau gris « Pas de connexion : appel non vérifié » (banques lues dans l'annuaire synchronisé, champ `announcers`) ; jamais de vert sans réponse du serveur. Appel masqué ou numéro illisible = numéro inconnu (vérifié avec un numéro illisible ; l'émulateur ne sait pas masquer un numéro). Comptes qui avaient déjà activé le filtrage : l'interrupteur « Rappel aussi pour mes contacts » redemande la permission Téléphone (accordée sans dialogue, même groupe que « raccrocher »). Hors numéro de banque, l'appel sonne tout de suite et les requêtes attendent jusqu'à 3 s (réseaux lents).
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
- **Pendant l'appel, app fermée** : Android = grand popup par-dessus l'écran d'appel (`CallOverlay.kt`), **vérifié sur émulateur
  Android 15 le 25/11** : vert seulement si le serveur confirme la ligne annoncée, rouge sur un numéro public de banque sans annonce,
  y compris téléphone verrouillé (`FLAG_SHOW_WHEN_LOCKED`, sinon Android cache la carte) et app arrêtée de force. Carte placée à 23 % de
  la hauteur (sous le bandeau d'appel et le nom de l'appelant, au-dessus de Répondre/Refuser), fermée à chaque nouvel appel. Bandeau gris des appels inconnus vérifié de même (affiché, verrouillé, réglage coupé). Sur
  Android 15, le rôle de filtrage accorde tout seul « Afficher par-dessus les autres applis ». Non couvert : fermeture de la carte à
  la fin de l'appel (elle reste 45 s), rendu Samsung. iPhone (codé, NON testé) = étiquette temporaire dans l'annuaire d'appels
  (« ✓ Certifié <Banque> · HH:mm », libellé confirmé par le propriétaire le 25/11, « Annoncé par » écarté ; `expected.json` dans l'App Group, extension de notification + tâche d'arrière-plan + push de fin,
  y compris à l'échéance). Apple interdit tout popup sur un appel normal ; le propriétaire a refusé l'appel VoIP dans l'app. Maquettes :
  `docs/design/maquettes/appel-*.png`. À vérifier sur vrais appareils : mise à jour iOS quand l'app est fermée de force.
- **Numéros officiels des banques** : jamais inventés ; fournis par les banques partenaires (table `banks`).

## Sécurité & RGPD

- Hébergement UE (API, Postgres, scanner, IA via Vertex UE). Secrets uniquement en variables d'environnement.
- Secrets des boîtes mail chiffrés AES-256-GCM (`ENCRYPTION_KEY`, à mettre dans un KMS en production).
- Rétention : alertes « sûr » 30 jours, autres 13 mois ; suppression de compte = effacement en cascade (`DELETE /v1/me`).
- Scanner : protection SSRF (plages privées bloquées, y compris après redirection) ; en production, proxy de sortie
  qui refuse aussi les plages internes (`SCANNER_PROXY`).
- `npm audit` : alerte haute sur `@xmldom/xmldom` (outillage de build Expo uniquement, pas embarqué dans l'app).

## Limites connues / dettes

- `TRUST_PROXY` (0 par défaut) : nombre de proxys de confiance devant l'API. Mettre 1 en production derrière Caddy/Nginx, sinon les limites par IP voient l'adresse du proxy ; ne jamais l'augmenter si l'API est joignable directement (X-Forwarded-For falsifiable).
- Pas de limitation de débit par IP sur `/auth/start` (seulement 45 s par numéro et 5 essais par code) : ajouter un
  rate-limit au niveau du proxy ou de Fastify avant la production.
- `ILMessageFilterExtensionNetworkURL` codé en dur (`api.vigie.example`) dans `targets/VigieMessageFilter/Info.plist`.
- Le rôle Android de filtrage et la permission « Raccrocher » sont demandés depuis l'écran « Appels et messages ».
- Brancher le transport d’e-mail transactionnel pour les liens d’activation avant l’ouverture de la console en production.
- Les alertes historiques gardent leur rétention. Les anciennes URL sont réduites au domaine dans les réponses API ; leur stockage antérieur n’a pas été réécrit.
- Les proches sont joignables par SMS ou par appel. Leur propre parcours d’acceptation ou de révocation reste à développer.
- Écrans testés en web (react-native-web) : vérifier le rendu natif dès le premier build EAS.
