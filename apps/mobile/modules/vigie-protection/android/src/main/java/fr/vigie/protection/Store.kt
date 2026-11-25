package fr.vigie.protection

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * État partagé entre l'app (via le module) et les services natifs, qui tournent même app fermée.
 * Stockage privé de l'app (bac à sable Android). Aucune donnée de message n'est conservée ici.
 */
class Store(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences("vigie_protection", Context.MODE_PRIVATE)

  var apiUrl: String?
    get() = prefs.getString("apiUrl", null)
    set(v) = prefs.edit().putString("apiUrl", v).apply()

  var token: String?
    get() = prefs.getString("token", null)
    set(v) = prefs.edit().putString("token", v).apply()

  var autoHangup: Boolean
    get() = prefs.getBoolean("autoHangup", false)
    set(v) = prefs.edit().putBoolean("autoHangup", v).apply()

  /** Rappel discret sur les appels inconnus quand aucune annonce n'est ouverte (activé par défaut). */
  var unknownCallBanner: Boolean
    get() = prefs.getBoolean("unknownCallBanner", true)
    set(v) = prefs.edit().putBoolean("unknownCallBanner", v).apply()

  /** Même rappel pour les appels venant d'un contact (activé par défaut). */
  var contactCallBanner: Boolean
    get() = prefs.getBoolean("contactCallBanner", true)
    set(v) = prefs.edit().putBoolean("contactCallBanner", v).apply()

  /** Position de la carte pendant l'appel : « top », « middle », « low » ; null = automatique (selon l'appli Téléphone). */
  var overlayPosition: String?
    get() = prefs.getString("overlayPosition", null)
    set(v) = prefs.edit().putString("overlayPosition", v).apply()

  /** Annuaire (synchronisation JS ou rafraîchissement natif) : l'heure d'enregistrement est mémorisée avec lui. */
  var directoryJson: String?
    get() = prefs.getString("directory", null)
    set(v) = prefs.edit().putString("directory", v).putLong("directorySyncedAtMs", System.currentTimeMillis()).apply()

  /** Heure (ms epoch) du dernier enregistrement de l'annuaire ; 0 = jamais. */
  val directorySyncedAtMs: Long
    get() = prefs.getLong("directorySyncedAtMs", 0L)

  /** Enregistre un annuaire reçu du serveur par le natif (même format que celui poussé par le JS). */
  fun saveDirectory(directory: JSONObject) {
    directoryJson = directory.toString()
  }

  /** Vrai si l'annuaire stocké a plus de 12 h (ou n'a jamais été enregistré). */
  fun directoryIsStale(): Boolean = System.currentTimeMillis() - directorySyncedAtMs > DIRECTORY_MAX_AGE_MS

  /** Vrai si une réponse du serveur porte une empreinte d'annuaire non vide et différente de celle stockée. */
  fun hasNewBankNumbersVersion(response: JSONObject?): Boolean {
    val v = response?.optString("bankNumbersVersion").orEmpty()
    return v.isNotEmpty() && v != "null" && v != bankNumbersVersion()
  }

  /** Empreinte des numéros de banque de l'annuaire stocké, null si absente. */
  fun bankNumbersVersion(): String? {
    val json = directoryJson ?: return null
    return try {
      JSONObject(json).optString("bankNumbersVersion").takeIf { it.isNotEmpty() && it != "null" }
    } catch (e: Exception) {
      null
    }
  }

  var expectedCallJson: String?
    get() = prefs.getString("expectedCall", null)
    set(v) = prefs.edit().putString("expectedCall", v).apply()

  /** Efface l'annonce mémorisée seulement si c'est bien celle de [callId] (un push de fin tardif ne retire pas une annonce plus récente). */
  fun clearExpectedCall(callId: String) {
    val json = expectedCallJson ?: return
    val id = try { JSONObject(json).optString("id") } catch (e: Exception) { "" }
    if (id == callId) expectedCallJson = null
  }

  /** Annonce déjà utilisée par un appel correspondant : elle ne valide plus aucun autre appel, même si l'app la renvoie. */
  var consumedCallId: String?
    get() = prefs.getString("consumedCallId", null)
    set(v) = prefs.edit().putString("consumedCallId", v).apply()

  data class BankNumber(val bankId: String, val bankName: String, val partner: Boolean)

  data class ExpectedCall(
    val id: String,
    val callerNumber: String?,
    val bankName: String,
    val advisorName: String,
    val agency: String,
    val expiresAtMs: Long,
    /** Motif déclaré par le conseiller ; seulement connu via la réponse authentifiée du serveur. */
    val reason: String = "",
  )

  /** Numéros officiels des banques de l'utilisateur, indexés par numéro E.164. */
  fun bankNumbers(): Map<String, BankNumber> {
    val json = directoryJson ?: return emptyMap()
    val arr = JSONObject(json).optJSONArray("bankNumbers") ?: JSONArray()
    val out = HashMap<String, BankNumber>()
    for (i in 0 until arr.length()) {
      val o = arr.getJSONObject(i)
      out[o.getString("number")] = BankNumber(o.getString("bankId"), o.getString("bankName"), o.optBoolean("partner"))
    }
    return out
  }

  /** Banques partenaires qui annoncent leurs appels à ce client (annuaire synchronisé, valable hors connexion). */
  fun announcers(): List<String> {
    val json = directoryJson ?: return emptyList()
    return try {
      CallSignals.announcerNames(JSONObject(json))
    } catch (e: Exception) {
      emptyList()
    }
  }

  /** Numéros signalés par la communauté → nombre de signalements. */
  fun reportedNumbers(): Map<String, Int> {
    val json = directoryJson ?: return emptyMap()
    val arr = JSONObject(json).optJSONArray("reportedNumbers") ?: JSONArray()
    val out = HashMap<String, Int>()
    for (i in 0 until arr.length()) {
      val o = arr.getJSONObject(i)
      out[o.getString("number")] = o.optInt("reports")
    }
    return out
  }

  fun expectedCall(): ExpectedCall? {
    val json = expectedCallJson ?: return null
    return try {
      val o = JSONObject(json)
      val expires = java.time.Instant.parse(o.getString("expiresAt")).toEpochMilli()
      if (expires < System.currentTimeMillis() || o.getString("id") == consumedCallId) null
      else ExpectedCall(
        id = o.getString("id"),
        callerNumber = o.optString("callerNumber").takeIf { it.isNotBlank() && it != "null" },
        bankName = o.getString("bankName"),
        advisorName = o.getString("advisorName"),
        agency = o.getString("agency"),
        expiresAtMs = expires,
      )
    } catch (e: Exception) {
      null
    }
  }
}

private const val DIRECTORY_MAX_AGE_MS = 12L * 60 * 60 * 1000

object PhoneUtil {
  /** Normalisation E.164 (France par défaut), identique à `normalizePhone` côté TypeScript. */
  fun normalize(raw: String?): String? {
    if (raw.isNullOrBlank()) return null
    var digits = raw.filter { it.isDigit() || it == '+' }
    if (digits.startsWith("00")) digits = "+" + digits.substring(2)
    if (digits.startsWith("+")) {
      val rest = digits.substring(1).filter { it.isDigit() }
      val fixed = if (rest.startsWith("330")) "33" + rest.substring(3) else rest
      return if (fixed.length in 8..15) "+$fixed" else null
    }
    if (digits.startsWith("0") && digits.length == 10) return "+33" + digits.substring(1)
    return if (digits.length in 3..6) digits else null
  }

  /** +33612345678 → « 06 12 34 56 78 ». */
  fun display(e164: String): String {
    if (e164.startsWith("+33") && e164.length == 12) {
      return ("0" + e164.substring(3)).chunked(2).joinToString(" ")
    }
    return e164
  }
}
