package fr.vigie.protection

import org.json.JSONObject

/** État partagé entre le service de filtrage d'appels et le récepteur d'état du téléphone. */
object CallSignals {
  /**
   * Instant (SystemClock.elapsedRealtime) du dernier appel entrant passé par le service de filtrage.
   * Android ne le sollicite pas pour un appelant enregistré dans les contacts.
   */
  @Volatile
  var lastScreenAtMs: Long = 0L

  /** Instant (SystemClock.elapsedRealtime) de la dernière tentative de rechargement d'un annuaire ancien ; -1 = jamais. */
  @Volatile
  var lastDirectoryRefreshTryMs: Long = -1L

  /** Noms des banques du tableau `announcers` d'une réponse du serveur ou de l'annuaire (vide si absent). */
  fun announcerNames(json: JSONObject?): List<String> {
    val arr = json?.optJSONArray("announcers") ?: return emptyList()
    val out = ArrayList<String>()
    for (i in 0 until arr.length()) {
      val name = arr.optString(i, "")
      if (name.isNotBlank()) out.add(name)
    }
    return out
  }
}
