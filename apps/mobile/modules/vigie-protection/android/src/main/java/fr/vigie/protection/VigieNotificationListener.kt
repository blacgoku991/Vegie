package fr.vigie.protection

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONObject
import java.util.concurrent.Executors

/**
 * Lit les notifications des SMS et messageries (activé par l'utilisateur dans les réglages).
 *
 * Confidentialité par conception : seuls les messages contenant un lien, un numéro de téléphone
 * ou une demande d'argent/de code sont envoyés au serveur pour analyse. Les autres ne quittent
 * jamais le téléphone. Rien n'est stocké localement.
 */
class VigieNotificationListener : NotificationListenerService() {
  private val executor = Executors.newSingleThreadExecutor()
  private val recent = object : LinkedHashMap<Int, Boolean>(64, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Int, Boolean>?) = size > 200
  }

  companion object {
    /** Applications surveillées → source et nom affiché. */
    val apps = mapOf(
      "com.google.android.apps.messaging" to ("sms" to "SMS"),
      "com.samsung.android.messaging" to ("sms" to "SMS"),
      "com.android.mms" to ("sms" to "SMS"),
      "com.whatsapp" to ("whatsapp" to "WhatsApp"),
      "com.whatsapp.w4b" to ("whatsapp" to "WhatsApp"),
      "org.telegram.messenger" to ("messaging" to "Telegram"),
      "com.facebook.orca" to ("messaging" to "Messenger"),
      "org.thoughtcrime.securesms" to ("messaging" to "Signal"),
      "com.viber.voip" to ("messaging" to "Viber"),
    )

    private val link = Regex("""(https?://|www\.)\S+|\b[a-z0-9-]+\.(fr|com|net|org|info|xyz|top|online|site|shop|live|app|io|co|me|eu|cc|icu|vip|club|support|link|click)\b""", RegexOption.IGNORE_CASE)
    private val phone = Regex("""(\+33|0033|\b0)[1-9]([ .-]?\d{2}){4}""")
    private val money = Regex("""(€|eur\b|euros?|virement|paiement|payer|r[ée]gler|frais|carte bancaire|code|rib|iban|nouveau num[ée]ro|amende|colis)""", RegexOption.IGNORE_CASE)

    private val otp = Regex("""\b\d{4,8}\b""")
    private val otpWords = Regex("""(code|mot de passe|password)""", RegexOption.IGNORE_CASE)

    /**
     * Le message mérite-t-il une vérification ?
     * Les SMS de code à usage unique (code + chiffres, sans lien) ne sont JAMAIS envoyés :
     * un vrai code ne doit pas quitter le téléphone.
     */
    fun worthChecking(text: String): Boolean {
      val hasLink = link.containsMatchIn(text)
      if (!hasLink && otp.containsMatchIn(text) && otpWords.containsMatchIn(text)) return false
      return hasLink || phone.containsMatchIn(text) || money.containsMatchIn(text)
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    val (source, appName) = apps[sbn.packageName] ?: return
    val n = sbn.notification ?: return
    if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
    val extras = n.extras ?: return
    val sender = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()
    val text = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: return
    if (text.length < 8 || !worthChecking(text)) return

    val key = (sbn.packageName + sender + text).hashCode()
    synchronized(recent) {
      if (recent.containsKey(key)) return
      recent[key] = true
    }

    executor.execute {
      val store = Store(this)
      val body = JSONObject().put("source", source).put("sender", sender).put("text", text.take(5000)).put("app", appName)
      val res = Api.post(store, "/me/scan", body, 20_000) ?: return@execute
      val verdict = res.optString("verdict")
      val incomplete = verdict == "safe" && res.optBoolean("incomplete", false)
      if (verdict == "scam" || verdict == "suspicious" || incomplete) {
        val shown = if (incomplete) "incomplete" else verdict
        Notifier.message(this, shown, res.optString("explanation"), res.optString("alertId").takeIf { it.isNotBlank() && it != "null" }, appName)
      }
    }
  }
}
