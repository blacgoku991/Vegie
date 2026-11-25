package fr.vigie.protection

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.telephony.TelephonyManager

/**
 * Appels venant d'un contact. Android ne sollicite pas le service de filtrage quand le numéro est enregistré
 * dans les contacts. À la sonnerie, si le filtrage n'a pas été appelé pour cet appel, on en déduit que
 * l'appelant est un contact, sans lire les contacts ni le journal d'appels (le numéro n'est pas fourni).
 * On n'affiche donc jamais de vert : le numéro est inconnu du code.
 * Secours quand l'accès aux contacts est refusé (ou sur Android 10) : avec cet accès, le filtrage voit aussi ces appels.
 * Délais : attente 1,5 s + requête 2,5 s au plus, soit moins de 8 s (fenêtre SCREEN_WINDOW_MS).
 * Nécessite READ_PHONE_STATE, sinon Android n'envoie pas cette diffusion.
 */
class PhoneStateReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return
    when (intent.getStringExtra(TelephonyManager.EXTRA_STATE)) {
      TelephonyManager.EXTRA_STATE_IDLE -> CallOverlay.dismiss()
      TelephonyManager.EXTRA_STATE_RINGING -> handleRinging(context.applicationContext)
      else -> Unit
    }
  }

  private fun handleRinging(app: Context) {
    // Une même sonnerie peut être diffusée plusieurs fois (double SIM, avec ou sans numéro).
    val now = SystemClock.elapsedRealtime()
    synchronized(lock) {
      if (lastHandledAtMs != 0L && now - lastHandledAtMs < DEDUP_MS) return
      lastHandledAtMs = now
    }
    val pending = goAsync()
    Thread {
      try {
        process(app)
      } catch (e: Exception) {
        // Aucun repli : le rappel est une aide, jamais bloquante.
      } finally {
        pending.finish()
      }
    }.start()
  }

  private fun screenedRecently(): Boolean {
    val last = CallSignals.lastScreenAtMs
    return last != 0L && SystemClock.elapsedRealtime() - last < SCREEN_WINDOW_MS
  }

  private fun process(app: Context) {
    // Laisse au service de filtrage le temps de se manifester pour cet appel.
    Thread.sleep(WAIT_MS)
    if (screenedRecently()) return
    val store = Store(app)
    if (!store.contactCallBanner || store.token == null || store.apiUrl == null || !CallOverlay.canDraw(app)) return

    val remote = Api.get(store, "/me/calls/expected", 2500)
    val content: OverlayContent = when {
      remote == null -> store.announcers().takeIf { it.isNotEmpty() }?.let { OverlayContent.offlineUnknown(it) }
      !remote.isNull("call") -> remote.optJSONObject("call")?.optString("bankName")?.takeIf { it.isNotBlank() }?.let { OverlayContent.contactAnnounced(it) }
      else -> CallSignals.announcerNames(remote).takeIf { it.isNotEmpty() }?.let { OverlayContent.unannounced(it) }
    } ?: return

    // Le filtrage a pu démarrer pendant la requête : sa carte prime.
    if (screenedRecently()) return
    CallOverlay.show(app, content, null)
  }

  private companion object {
    const val WAIT_MS = 1500L
    const val SCREEN_WINDOW_MS = 8000L
    const val DEDUP_MS = 5000L
    val lock = Any()
    var lastHandledAtMs = 0L
  }
}
