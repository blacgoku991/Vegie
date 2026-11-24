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
 *  1. Appel venant du numéro annoncé par la banque → « Appel annoncé » (vert). L'annonce est consommée
 *     au premier appel qui correspond. Un numéro différent ou inconnu n'est JAMAIS validé : message neutre,
 *     « raccrochez et rappelez votre banque ». Une annonce ne suspend JAMAIS le rejet automatique d'un appel
 *     « de la banque » venant d'un autre numéro : seul le numéro annoncé exact est épargné.
 *     Vérification opérateur (STIR/SHAKEN) en échec : jamais validé, même si le numéro correspond.
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
    val verificationFailed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
      details.callerNumberVerificationStatus == android.telecom.Connection.VERIFICATION_STATUS_FAILED

    // 1. Appel annoncé : le numéro entrant doit être exactement le numéro annoncé.
    //    Une annonce sans numéro ne valide aucun appel.
    val exact = expected?.callerNumber == number
    val bank = store.bankNumbers()[number]
    // Une annonce locale peut avoir été retirée ou déjà utilisée sur un autre appareil.
    // Le serveur arbitre l'usage unique. Hors ligne, on laisse sonner sans certification.
    val check = if (!verificationFailed && (exact || bank?.partner == true))
      Api.get(store, "/me/calls/check?number=${Api.enc(number)}", 1000) else null
    val call = check?.optJSONObject("call")
    if (!verificationFailed && check?.optBoolean("certified") == true && call != null && call.optString("callerNumber") == number) {
      store.consumedCallId = call.getString("id")
      allow(details)
      Notifier.callCertified(this, Store.ExpectedCall(call.getString("id"), number, call.getString("bankName"), call.getString("advisorName"), call.getString("agency"), 0))
      return
    }
    val announcedElsewhere = expected != null && !exact
    if (exact && !verificationFailed) {
      allow(details)
      Notifier.callUnverifiable(this, expected!!.bankName)
      return
    }
    if (bank != null) {
      if (bank.partner) {
        // Pas de validation : soit rien n'était annoncé, soit l'annonce vient d'un autre numéro (ou la
        // vérification opérateur a échoué). Une annonce en cours ne suspend pas le rejet automatique.
        if (store.autoHangup && (check != null || verificationFailed)) {
          reject(details)
          Notifier.callUncertified(this, bank.bankName, number, blocked = true)
        } else {
          allow(details)
          if (!verificationFailed && check == null) Notifier.callUnverifiable(this, bank.bankName)
          else if (!verificationFailed && (announcedElsewhere || call != null)) Notifier.callAnnouncedOtherNumber(this, bank.bankName)
          else Notifier.callUncertified(this, bank.bankName, number, blocked = false)
        }
      } else {
        allow(details)
        Notifier.callUnverifiable(this, bank.bankName)
      }
      return
    }

    val reports = store.reportedNumbers()[number]
    if (reports != null) {
      allow(details)
      Notifier.callReported(this, number, reports)
      return
    }

    if (verificationFailed) {
      allow(details)
      Notifier.callSpoofSuspected(this, number)
      return
    }

    allow(details)
    if (announcedElsewhere) Notifier.callAnnouncedOtherNumber(this, expected!!.bankName)
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
