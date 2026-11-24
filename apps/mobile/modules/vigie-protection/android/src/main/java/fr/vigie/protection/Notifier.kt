package fr.vigie.protection

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Notifications natives affichées pendant la sonnerie ou à l'arrivée d'un message.
 * Verdict toujours en toutes lettres dans le titre (jamais la couleur seule).
 */
object Notifier {
  const val CHANNEL_CALLS = "vigie-calls"
  const val CHANNEL_MESSAGES = "vigie-messages"
  const val CALL_NOTIFICATION_ID = 4201

  private const val GREEN = 0xFF0A6B3D.toInt()
  private const val RED = 0xFFB3261E.toInt()
  private const val ORANGE = 0xFFA14E00.toInt()

  private fun ensureChannels(ctx: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = ctx.getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_CALLS, "Vérification des appels", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "Appel certifié ou non certifié, pendant la sonnerie"
        enableVibration(true)
        lightColor = Color.RED
        lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
      },
    )
    nm.createNotificationChannel(
      NotificationChannel(CHANNEL_MESSAGES, "Messages dangereux", NotificationManager.IMPORTANCE_HIGH).apply {
        description = "SMS et messages repérés comme arnaques"
      },
    )
  }

  private fun deepLink(ctx: Context, path: String, requestCode: Int): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("vigie://$path")).apply {
      setPackage(ctx.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    return PendingIntent.getActivity(ctx, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  private fun endCallAction(ctx: Context, number: String?): NotificationCompat.Action {
    val intent = Intent(ctx, CallActionReceiver::class.java).apply {
      action = CallActionReceiver.ACTION_END_CALL
      putExtra(CallActionReceiver.EXTRA_NUMBER, number)
    }
    val pi = PendingIntent.getBroadcast(ctx, 7, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    return NotificationCompat.Action.Builder(0, "Raccrocher", pi).build()
  }

  private fun post(ctx: Context, id: Int, builder: NotificationCompat.Builder) {
    ensureChannels(ctx)
    try {
      NotificationManagerCompat.from(ctx).notify(id, builder.build())
    } catch (e: SecurityException) {
      // Notifications refusées par l'utilisateur : rien à afficher.
    }
  }

  private fun base(ctx: Context, channel: String, color: Int, title: String, text: String) =
    NotificationCompat.Builder(ctx, channel)
      .setSmallIcon(android.R.drawable.stat_sys_warning)
      .setColor(color)
      .setColorized(true)
      .setContentTitle(title)
      .setContentText(text)
      .setStyle(NotificationCompat.BigTextStyle().bigText(text))
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setAutoCancel(true)

  fun callCertified(ctx: Context, call: Store.ExpectedCall) {
    val text = "L'appel vient du numéro annoncé par ${call.advisorName} (${call.agency}). Même votre banque ne vous demandera jamais un code, un mot de passe ou un virement : si on vous le demande, raccrochez et rappelez votre banque."
    post(
      ctx,
      CALL_NOTIFICATION_ID,
      base(ctx, CHANNEL_CALLS, GREEN, "✓ Appel certifié · ${call.bankName}", text)
        .setSmallIcon(android.R.drawable.ic_dialog_info)
        .setContentIntent(deepLink(ctx, "call/certified?id=${call.id}&verified=1", 1)),
    )
  }

  /** Une annonce existe, mais l'appel entrant vient d'un autre numéro : message neutre, jamais de vert. */
  fun callAnnouncedOtherNumber(ctx: Context, bankName: String) {
    val text = "Votre banque a prévu un appel, mais pas depuis ce numéro : raccrochez et rappelez votre banque ($bankName)."
    post(ctx, CALL_NOTIFICATION_ID, base(ctx, CHANNEL_CALLS, ORANGE, "Appel de $bankName ? Numéro différent", text).setContentIntent(deepLink(ctx, "call/check", 7)))
  }

  fun callUncertified(ctx: Context, bankName: String, number: String, blocked: Boolean) {
    val title = if (blocked) "Faux appel bloqué" else "⚠ Appel NON certifié"
    val text =
      if (blocked) "Un appel se présentant comme $bankName a été rejeté : votre banque ne l'avait pas annoncé."
      else "Ce numéro se présente comme $bankName, mais votre banque n'a annoncé aucun appel. Ne donnez aucune information. Raccrochez."
    val b = base(ctx, CHANNEL_CALLS, RED, title, text).setContentIntent(deepLink(ctx, "call/uncertified", 2))
    if (!blocked) b.addAction(endCallAction(ctx, number))
    post(ctx, CALL_NOTIFICATION_ID, b)
  }

  fun callUnverifiable(ctx: Context, bankName: String) {
    val text = "Vigie ne peut pas certifier les appels de $bankName. En cas de doute, raccrochez et rappelez le numéro au dos de votre carte."
    post(ctx, CALL_NOTIFICATION_ID, base(ctx, CHANNEL_CALLS, ORANGE, "Appel de $bankName ?", text).setContentIntent(deepLink(ctx, "call/check", 3)))
  }

  fun callReported(ctx: Context, number: String, reports: Int, blocked: Boolean) {
    val title = if (blocked) "Appel d'arnaque bloqué" else "⚠ Numéro signalé comme arnaque"
    val text = "${PhoneUtil.display(number)} a été signalé $reports fois par d'autres utilisateurs de Vigie."
    val b = base(ctx, CHANNEL_CALLS, RED, title, text).setContentIntent(deepLink(ctx, "call/uncertified", 4))
    if (!blocked) b.addAction(endCallAction(ctx, number))
    post(ctx, CALL_NOTIFICATION_ID, b)
  }

  fun callSpoofSuspected(ctx: Context, number: String) {
    val text = "L'opérateur n'a pas pu confirmer ce numéro (${PhoneUtil.display(number)}). Il est peut-être usurpé : méfiance si l'on vous demande de l'argent ou un code."
    post(ctx, CALL_NOTIFICATION_ID, base(ctx, CHANNEL_CALLS, ORANGE, "⚠ Numéro peut-être usurpé", text).setContentIntent(deepLink(ctx, "call/check", 5)))
  }

  fun message(ctx: Context, verdict: String, explanation: String, alertId: String?, app: String) {
    val title = when (verdict) {
      "scam" -> "⛔ Arnaque · message $app"
      "incomplete" -> "⚠ Vérification incomplète · $app"
      else -> "⚠ Message douteux · $app"
    }
    val color = if (verdict == "scam") RED else ORANGE
    post(
      ctx,
      (alertId ?: explanation).hashCode(),
      base(ctx, CHANNEL_MESSAGES, color, title, "$explanation Ne cliquez sur aucun lien.")
        .setCategory(NotificationCompat.CATEGORY_MESSAGE)
        .setContentIntent(deepLink(ctx, if (alertId != null) "alert/$alertId" else "history", 6)),
    )
  }

  fun cancelCall(ctx: Context) {
    NotificationManagerCompat.from(ctx).cancel(CALL_NOTIFICATION_ID)
  }
}
