package fr.vigie.protection

import android.Manifest
import android.app.Activity
import android.app.role.RoleManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Pont JavaScript ⇄ services natifs Android de Vigie (voir src/protection.ts). */
class VigieProtectionModule : Module() {
  private val roleRequestCode = 4711
  private val permissionRequestCode = 4712
  private var rolePromise: Promise? = null

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "Contexte Android indisponible" }

  override fun definition() = ModuleDefinition {
    Name("VigieProtection")

    Function("setSession") { apiUrl: String, token: String? ->
      val store = Store(context)
      store.apiUrl = apiUrl
      store.token = token
    }

    AsyncFunction("syncDirectory") { json: String ->
      Store(context).directoryJson = json
    }

    Function("setExpectedCall") { json: String? ->
      Store(context).expectedCallJson = json
    }

    Function("clearExpectedCall") { callId: String ->
      Store(context).clearExpectedCall(callId)
    }

    Function("setAutoHangup") { enabled: Boolean ->
      Store(context).autoHangup = enabled
    }

    AsyncFunction("getStatus") {
      mapOf(
        "callScreening" to callScreeningState(),
        "notificationListener" to listenerState(),
        "callDirectory" to "unsupported",
        "canEndCall" to canEndCall(),
        "overlay" to overlayState(),
      )
    }

    /** Ouvre l'écran système « Afficher par-dessus les autres applis » pour cette app. */
    Function("requestOverlay") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        (appContext.currentActivity ?: context).startActivity(intent)
      }
    }

    /** Demande le rôle « appli de filtrage des appels » (écran système d'Android). */
    AsyncFunction("requestCallScreening") { promise: Promise ->
      val activity = appContext.currentActivity
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || activity == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val roleManager = context.getSystemService(RoleManager::class.java)
      if (!roleManager.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) {
        promise.resolve(false)
        return@AsyncFunction
      }
      if (roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) {
        requestEndCallPermission(activity)
        promise.resolve(true)
        return@AsyncFunction
      }
      rolePromise = promise
      activity.startActivityForResult(roleManager.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING), roleRequestCode)
    }

    Function("openNotificationListenerSettings") {
      val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      (appContext.currentActivity ?: context).startActivity(intent)
    }

    // Spécifique iOS : sans effet sur Android.
    AsyncFunction("openCallDirectorySettings") {}

    AsyncFunction("endCall") {
      CallActionReceiver.endCall(context)
    }

    OnActivityResult { activity, payload ->
      if (payload.requestCode == roleRequestCode) {
        val granted = payload.resultCode == Activity.RESULT_OK
        rolePromise?.resolve(granted)
        rolePromise = null
        if (granted) requestEndCallPermission(activity)
      }
    }
  }

  private fun callScreeningState(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "unsupported"
    val roleManager = context.getSystemService(RoleManager::class.java)
    if (!roleManager.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) return "unsupported"
    return if (roleManager.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) "enabled" else "disabled"
  }

  private fun overlayState(): String = if (CallOverlay.canDraw(context)) "enabled" else "disabled"

  private fun listenerState(): String =
    if (NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)) "enabled" else "disabled"

  private fun canEndCall(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.ANSWER_PHONE_CALLS) == PackageManager.PERMISSION_GRANTED

  /** Permission « Raccrocher » demandée juste après l'activation du filtrage, quand elle a du sens. */
  private fun requestEndCallPermission(activity: Activity) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && !canEndCall()) {
      ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.ANSWER_PHONE_CALLS), permissionRequestCode)
    }
  }
}
