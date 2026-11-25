package fr.vigie.protection

/** Contenu du grand popup d'appel, sans aucune dépendance Android (testable en JVM pur). */
data class OverlayContent(
  val tone: Tone,
  val title: String,
  /** Ligne en gras sous le titre (« Claire Martin · Banque Horizon »). */
  val headline: String?,
  /** Détail (agence, motif ou explication). */
  val detail: String?,
  /** Phrase de prévention affichée sous un filet (appel certifié uniquement). */
  val rule: String?,
  val showHangup: Boolean,
  val showCallback: Boolean,
) {
  enum class Tone { GREEN, RED, NEUTRAL }

  companion object {
    const val RULE = "Même votre conseiller ne vous demandera jamais un code."
    const val GREEN_COLOR = 0xFF157A37.toInt()
    const val RED_COLOR = 0xFFD92D20.toInt()

    /**
     * Appel certifié : vert, UNIQUEMENT à appeler quand le serveur a validé le numéro (usage unique).
     * Aucun autre chemin du code ne doit construire du vert.
     */
    fun certified(advisorName: String, bankName: String, agency: String, reason: String?): OverlayContent {
      val lines = buildList {
        if (agency.isNotBlank()) add(agency)
        if (!reason.isNullOrBlank()) add("Motif : $reason")
      }
      return OverlayContent(
        tone = Tone.GREEN,
        title = "Appel certifié",
        headline = "$advisorName · $bankName",
        detail = lines.takeIf { it.isNotEmpty() }?.joinToString("\n"),
        rule = RULE,
        showHangup = false,
        showCallback = false,
      )
    }

    /** Numéro public d'une banque partenaire sans annonce : rouge. */
    fun uncertifiedBank(bankName: String, canHangup: Boolean): OverlayContent = OverlayContent(
      tone = Tone.RED,
      title = "Appel non certifié",
      headline = null,
      detail = "Ce numéro se présente comme $bankName, mais votre banque n'a annoncé aucun appel." +
        if (canHangup) "" else " Raccrochez, puis rappelez votre banque.",
      rule = null,
      showHangup = canHangup,
      showCallback = true,
    )

    /**
     * Numéro inconnu alors que le serveur confirme qu'aucune annonce n'est ouverte : petit bandeau gris,
     * ni vert ni rouge (on n'affirme pas que l'appel est une arnaque), sans bouton.
     */
    fun unannounced(bankNames: List<String>): OverlayContent {
      val several = bankNames.size > 1
      return OverlayContent(
        tone = Tone.NEUTRAL,
        title = if (several) "Vos banques n'ont annoncé aucun appel" else "${bankNames.firstOrNull() ?: "Votre banque"} n'a annoncé aucun appel",
        headline = null,
        detail = if (several) "Si on vous dit appeler de leur part, raccrochez." else "Si on vous dit appeler de sa part, raccrochez.",
        rule = null,
        showHangup = false,
        showCallback = false,
      )
    }

    /** Numéro public d'une banque partenaire alors que le serveur est injoignable : rouge, on ne peut rien confirmer. */
    fun unverifiedBank(bankName: String, canHangup: Boolean): OverlayContent = OverlayContent(
      tone = Tone.RED,
      title = "Appel non vérifié",
      headline = null,
      detail = "Pas de connexion : SmartSecure ne peut pas vérifier cet appel de $bankName. Raccrochez et rappelez votre banque.",
      rule = null,
      showHangup = canHangup,
      showCallback = true,
    )

    /** Numéro inconnu et serveur injoignable : bandeau gris, on n'affirme rien. */
    fun offlineUnknown(bankNames: List<String>): OverlayContent {
      val who = if (bankNames.size == 1) bankNames[0] else "votre banque"
      return OverlayContent(
        tone = Tone.NEUTRAL,
        title = "Pas de connexion : appel non vérifié",
        headline = null,
        detail = "Si on vous dit appeler de $who, raccrochez et rappelez-la.",
        rule = null,
        showHangup = false,
        showCallback = false,
      )
    }

    /** Appelant enregistré dans les contacts alors qu'une annonce est ouverte : jamais de vert, le numéro est inconnu du code. */
    fun contactAnnounced(bankName: String): OverlayContent = OverlayContent(
      tone = Tone.NEUTRAL,
      title = "$bankName a annoncé un appel",
      headline = null,
      detail = "Ce numéro est dans vos contacts : SmartSecure ne peut pas le vérifier. En cas de doute, raccrochez et rappelez votre banque.",
      rule = null,
      showHangup = false,
      showCallback = false,
    )

    /** Numéro signalé par la communauté : rouge, sans « rappeler ma banque » (pas de banque en cause). */
    fun reported(displayNumber: String, reports: Int, canHangup: Boolean): OverlayContent = OverlayContent(
      tone = Tone.RED,
      title = "Numéro signalé",
      headline = null,
      detail = "$displayNumber a été signalé $reports fois par d'autres utilisateurs de SmartSecure." +
        if (canHangup) "" else " Raccrochez.",
      rule = null,
      showHangup = canHangup,
      showCallback = false,
    )
  }
}
