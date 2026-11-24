package fr.vigie.protection

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.telecom.TelecomManager
import androidx.core.content.ContextCompat
import org.json.JSONObject

/** Bouton « Raccrocher » de la notification d'appel non certifié. */
class CallActionReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_END_CALL = "fr.vigie.protection.END_CALL"
    const val EXTRA_NUMBER = "number"

    /** Raccroche l'appel en cours si l'utilisateur a accordé la permission. */
    @Suppress("DEPRECATION")
    fun canEndCall(ctx: Context): Boolean =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
        ContextCompat.checkSelfPermission(ctx, Manifest.permission.ANSWER_PHONE_CALLS) == PackageManager.PERMISSION_GRANTED

    fun endCall(ctx: Context): Boolean {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false
      if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ANSWER_PHONE_CALLS) != PackageManager.PERMISSION_GRANTED) return false
      return try {
        @Suppress("DEPRECATION")
        val ended = ctx.getSystemService(TelecomManager::class.java).endCall()
        ended
      } catch (e: Exception) {
        false
      }
    }
  }

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != ACTION_END_CALL) return
    if (!endCall(context)) return
    Notifier.cancelCall(context)
    CallOverlay.dismiss()
    val number = intent.getStringExtra(EXTRA_NUMBER)
    val pending = goAsync()
    Thread {
      try {
        // Alimente la base communautaire des numéros frauduleux.
        Api.post(Store(context), "/me/calls/report", JSONObject().put("number", number).put("action", "hung_up"), 4000)
      } finally {
        pending.finish()
      }
    }.start()
  }
}
