package fr.vigie.protection

import android.os.Build
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.CallScreeningService.CallResponse
import java.util.concurrent.Executors

/**
 * Filtrage des appels entrants (rôle « appli de filtrage des appels », Android 10+).
 * Android impose une réponse en moins de 5 s : tout est décidé localement, avec au plus
 * une vérification serveur de 2,5 s pour les numéros de banque.
 *
 * Règles :
 *  1. Appel annoncé par la banque (numéro attendu) → « Appel certifié ».
 *  2. Numéro officiel d'une banque PARTENAIRE sans annonce → « Appel NON certifié »
 *     (cas typique d'usurpation du vrai numéro de la banque) ; rejet si l'option est activée.
 *  3. Numéro officiel d'une banque non partenaire → information prudente.
 *  4. Numéro signalé par la communauté → avertissement, rejet si l'option est activée.
 *  5. Vérification opérateur (STIR/SHAKEN, « MAN » en France) en échec → avertissement.
 *  Les contacts du téléphone ne passent jamais par ce service.
 */
class VigieCallScreeningService : CallScreeningService() {
  private val executor = Executors.newSingleThreadExecutor()

  override fun onScreenCall(details: Call.Details) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && details.callDirection != Call.Details.DIRECTION_INCOMING) {
      allow(details)
      return
    }
    val number = PhoneUtil.normalize(details.handle?.schemeSpecificPart)
    if (number == null) {
      allow(details)
      return
    }
    executor.execute {
      try {
        screen(details, number)
      } catch (e: Exception) {
        allow(details)
      }
    }
  }

  private fun screen(details: Call.Details, number: String) {
    val store = Store(this)
    val expected = store.expectedCall()

    // 1. Appel annoncé : même numéro, ou numéro non transmis par la banque.
    if (expected != null && (expected.callerNumber == null || expected.callerNumber == number)) {
      allow(details)
      Notifier.callCertified(this, expected)
      return
    }

    val bank = store.bankNumbers()[number]
    if (bank != null) {
      if (bank.partner) {
        // Dernière chance : l'annonce est peut-être arrivée sur le serveur sans notification.
        val check = Api.get(store, "/me/calls/check?number=${Api.enc(number)}", 2500)
        val call = check?.optJSONObject("call")
        if (check?.optBoolean("certified") == true && call != null) {
          allow(details)
          Notifier.callCertified(
            this,
            Store.ExpectedCall(call.getString("id"), number, call.getString("bankName"), call.getString("advisorName"), call.getString("agency"), 0),
          )
          return
        }
        if (store.autoHangup) {
          reject(details)
          Notifier.callUncertified(this, bank.bankName, number, blocked = true)
        } else {
          allow(details)
          Notifier.callUncertified(this, bank.bankName, number, blocked = false)
        }
      } else {
        allow(details)
        Notifier.callUnverifiable(this, bank.bankName)
      }
      return
    }

    val reports = store.reportedNumbers()[number]
    if (reports != null) {
      // Seuil plus élevé pour un rejet automatique, pour éviter de bloquer un appel légitime.
      if (store.autoHangup && reports >= 5) {
        reject(details)
        Notifier.callReported(this, number, reports, blocked = true)
      } else {
        allow(details)
        Notifier.callReported(this, number, reports, blocked = false)
      }
      return
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
      details.callerNumberVerificationStatus == android.telecom.Connection.VERIFICATION_STATUS_FAILED
    ) {
      allow(details)
      Notifier.callSpoofSuspected(this, number)
      return
    }

    allow(details)
  }

  private fun allow(details: Call.Details) {
    respondToCall(details, CallResponse.Builder().build())
  }

  private fun reject(details: Call.Details) {
    respondToCall(
      details,
      CallResponse.Builder()
        .setDisallowCall(true)
        .setRejectCall(true)
        .setSkipNotification(true)
        .build(),
    )
  }
}
