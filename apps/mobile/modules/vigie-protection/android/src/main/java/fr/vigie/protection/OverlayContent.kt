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
  enum class Tone { GREEN, RED }

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
