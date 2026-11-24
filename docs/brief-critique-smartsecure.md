# SmartSecure : demande de critique

Tu es un expert produit, sécurité mobile et UX pour seniors. Critique sans complaisance le projet ci-dessous :
points faibles, risques, ce qu'il faut changer, et fonctionnalités à ajouter pour être nettement meilleur que la
concurrence. Classe tes propositions par impact et par effort.

## Le produit
App mobile anti-arnaque (iOS + Android) pour les seniors français et leurs familles, plus une console web pour les
banques. Promesse : une fois installée, la personne n'a **rien à faire**, l'app veille seule.

## Fonctions actuelles
- **Appel certifié** : le conseiller bancaire annonce son appel depuis la console ; le client reçoit « Appel certifié –
  Claire Martin, Banque X » avant que ça sonne. Appel « de la banque » sans annonce = non certifié (les escrocs usurpent
  le vrai numéro de la banque). Règle à retenir : « Pas de message SmartSecure avant l'appel = ce n'est pas votre banque ».
  - Android : filtrage pendant la sonnerie (CallScreeningService), raccrochage automatique en option.
  - iOS : pas d'accès aux appels en direct → notification urgente avant l'appel, annuaire CallKit (numéros signalés
    bloqués, numéros de banque étiquetés « vérifiez dans SmartSecure »), bouton « On m'appelle de ma banque ».
- **Mails** (Outlook, Orange, Free, SFR, La Poste, Bouygues ; Gmail plus tard) : analyse automatique, verdict Sûr /
  Douteux / Arnaque + une phrase d'explication.
- **SMS / WhatsApp** : Android analyse auto (seuls les messages avec lien, numéro ou demande d'argent partent au serveur,
  jamais les SMS de code) ; iOS filtre SMS (range en Indésirables) + extension Partager.
- **Moteur** : règles (marques imitées, domaines sosies, SPF/DKIM/DMARC, liens maquillés, âge du domaine, Google Web
  Risk, visite du site dans un navigateur isolé) puis IA (Claude) qui peut aggraver un verdict, jamais l'adoucir.
- **Proche** prévenu par SMS en cas d'arnaque.
- **Console banque** : annoncer un appel, suivre en direct, statistiques, faux appels signalés (« numéro usurpé »).

## Choix techniques et contraintes
Expo / React Native, serveur Node + Postgres hébergé en UE, IA via Vertex AI UE, RGPD (pas de corps de mail stocké,
notifications sans contenu). Design : texte ≥ 17 px, boutons ≥ 64 px, contrastes AA, une seule couleur d'accent.

## Limites connues
- iOS ne voit pas les appels en direct ; un escroc avec un numéro inconnu n'est pas détecté automatiquement.
- Le système d'appel certifié n'a de valeur que si des banques adoptent la console.
- Pas encore d'app « famille » avec notifications push.

## Questions
1. Le modèle économique (B2C abonnement, B2B banques, assureurs, mutuelles, opérateurs) : lequel et pourquoi ?
2. Qu'est-ce qui manque pour qu'un senior l'adopte vraiment (et sa famille l'installe) ?
3. Quelles fonctionnalités ajouter en priorité ? Quels risques (juridiques, faux positifs, App Store / Play Store) ?
4. Le nom « SmartSecure » est-il bon pour des seniors français ?
