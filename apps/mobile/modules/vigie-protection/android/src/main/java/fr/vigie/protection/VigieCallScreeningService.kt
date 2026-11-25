package fr.vigie.protection

import android.os.Build
import android.os.SystemClock
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.CallScreeningService.CallResponse
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

/**
 * Filtrage des appels entrants (rôle « appli de filtrage des appels », Android 10+).
 * Android impose une réponse en moins de 5 s. Une seule réponse (autoriser ou rejeter) est donnée par appel.
 *
 * Délais :
 *  - Numéro qui n'est PAS un numéro officiel de banque : il n'est jamais rejeté, l'appel est donc autorisé
 *    tout de suite, avant toute requête. Les requêtes (annonce ouverte : 3 s, validation du numéro : 3 s)
 *    se font ensuite, et la carte s'affiche à l'arrivée de la réponse (réseaux lents 2G/EDGE).
 *  - Numéro officiel d'une banque : l'appel peut être rejeté, il reste donc retenu pendant la validation (2 s au plus).
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
 *  Contacts : Android n'appelle ce service pour un numéro enregistré que si l'accès aux contacts est accordé
 *  (Android 11+). Pour un contact, seules les cartes liées à la banque sont gardées (règles 1 à 5) : jamais le
 *  bandeau « aucun appel annoncé » ni la notification « annoncé pour un autre numéro ». Sans cet accès, le
 *  récepteur d'état du téléphone prend le relais (PhoneStateReceiver).
 */
class VigieCallScreeningService : CallScreeningService() {
  private val executor = Executors.newSingleThreadExecutor()

  override fun onScreenCall(details: Call.Details) {
    // Nouvel appel : une carte encore affichée pour l'appel précédent (elle reste 45 s) ne doit jamais
    // sembler s'appliquer à celui-ci, surtout une carte verte.
    CallOverlay.dismiss()
    val responder = Responder(details)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && details.callDirection != Call.Details.DIRECTION_INCOMING) {
      responder.allow()
      return
    }
    // Le récepteur d'état du téléphone s'en sert pour repérer les appels que le filtrage n'a pas vus (contacts).
    CallSignals.lastScreenAtMs = SystemClock.elapsedRealtime()
    // Appel masqué ou numéro illisible : chaîne vide. Il ne concorde avec aucune annonce ni aucun annuaire et suit
    // donc le chemin « numéro inconnu » (bandeau gris), car une banque partenaire n'appelle jamais en masqué.
    val number = PhoneUtil.normalize(details.handle?.schemeSpecificPart) ?: ""
    executor.execute {
      try {
        screen(responder, details, number)
      } catch (e: Exception) {
        responder.allow()
      }
      refreshOldDirectory()
    }
  }

  /**
   * Annuaire simplement ancien (plus de 12 h) : rafraîchi après la décision, sans la rejouer. Sur un autre fil,
   * pour ne pas retarder le filtrage de l'appel suivant, et au plus une tentative toutes les 10 minutes.
   */
  private fun refreshOldDirectory() {
    try {
      val now = SystemClock.elapsedRealtime()
      val last = CallSignals.lastDirectoryRefreshTryMs
      if (last >= 0L && now - last < 10 * 60_000L) return
      val app = applicationContext
      if (!Store(app).directoryIsStale()) return
      CallSignals.lastDirectoryRefreshTryMs = now
      Thread {
        try {
          refreshDirectory(Store(app))
        } catch (e: Exception) {
          // Sans effet sur l'appel.
        }
      }.start()
    } catch (e: Exception) {
      // Sans effet sur l'appel.
    }
  }

  /** Recharge l'annuaire des numéros publics depuis le serveur et l'enregistre. Vrai si l'annuaire a été remplacé. */
  private fun refreshDirectory(store: Store): Boolean {
    val directory = Api.get(store, "/me/phone-directory", 3000) ?: return false
    store.saveDirectory(directory)
    return true
  }

  private fun screen(responder: Responder, details: Call.Details, number: String, retried: Boolean = false) {
    val store = Store(this)
    var expected = store.expectedCall()
    val verificationFailed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
      details.callerNumberVerificationStatus == android.telecom.Connection.VERIFICATION_STATUS_FAILED
    val bank = store.bankNumbers()[number]
    // Hors numéro de banque, l'appel n'est jamais rejeté : on le laisse sonner avant les requêtes réseau.
    if (bank == null) responder.allow()

    // Annonce inconnue du téléphone, ou mémorisée pour un autre numéro (notification non reçue, app pas rouverte
    // depuis l'annonce) : on demande au serveur s'il y a une annonce ouverte. Le numéro entrant n'est PAS envoyé :
    // il est comparé ici, puis confirmé par /me/calls/check seulement s'il concorde. Hors ligne, l'état local reste.
    var remote: JSONObject? = null
    if (!verificationFailed && bank == null && expected?.callerNumber != number) {
      remote = Api.get(store, "/me/calls/expected", 3000)
      if (remote != null) {
        store.expectedCallJson = remote.optJSONObject("call")?.toString()
        expected = store.expectedCall()
        // Annuaire périmé côté banque : on le recharge et on rejoue la décision avant d'afficher quoi que ce soit.
        if (!retried && store.hasNewBankNumbersVersion(remote) && refreshDirectory(store)) {
          screen(responder, details, number, retried = true)
          return
        }
      }
    }

    // 1. Appel annoncé : le numéro entrant doit être exactement le numéro annoncé.
    //    Une annonce sans numéro ne valide aucun appel.
    val exact = expected?.callerNumber == number
    // Une annonce locale peut avoir été retirée ou déjà utilisée sur un autre appareil.
    // Le serveur arbitre l'usage unique. Hors ligne, on laisse sonner sans certification.
    val check = if (!verificationFailed && (exact || bank?.partner == true))
      Api.get(store, "/me/calls/check?number=${Api.enc(number)}", if (bank == null) 3000 else 2000) else null
    val call = check?.optJSONObject("call")
    val certifiedByServer = !verificationFailed && check?.optBoolean("certified") == true && call != null && call.optString("callerNumber") == number
    // Annuaire périmé côté banque (sauf appel certifié, affiché d'abord) : rechargé, puis décision rejouée.
    if (!retried && !certifiedByServer && store.hasNewBankNumbersVersion(check)) {
      // Android n'attend la réponse que 5 s : on laisse sonner avant de recharger. Le rejet automatique ne
      // s'applique donc pas à ce premier appel après un changement d'annuaire ; la carte s'affiche quand même.
      responder.allow()
      if (refreshDirectory(store)) {
        screen(responder, details, number, retried = true)
        return
      }
    }
    if (certifiedByServer && call != null) {
      store.consumedCallId = call.getString("id")
      responder.allow()
      val certifiedCall = Store.ExpectedCall(call.getString("id"), number, call.getString("bankName"), call.getString("advisorName"), call.getString("agency"), 0, call.optString("reason"))
      // Vert uniquement ici : numéro validé par le serveur (usage unique, fenêtre de l'annonce).
      val shown = CallOverlay.show(this, OverlayContent.certified(certifiedCall.advisorName, certifiedCall.bankName, certifiedCall.agency, certifiedCall.reason), number)
      if (!shown) Notifier.callCertified(this, certifiedCall)
      // Carte déjà affichée : l'annuaire est rechargé ensuite, sans rejouer la décision.
      if (store.hasNewBankNumbersVersion(check)) refreshDirectory(store)
      return
    }
    val announcedElsewhere = expected != null && !exact
    // Interrogé seulement là où il change la décision (numéro inconnu, sans carte liée à la banque).
    val contact by lazy(LazyThreadSafetyMode.NONE) { Contacts.isContact(this, number) }
    if (exact && !verificationFailed) {
      responder.allow()
      Notifier.callUnverifiable(this, expected!!.bankName)
      return
    }
    if (bank != null) {
      if (bank.partner) {
        // Pas de validation : soit rien n'était annoncé, soit l'annonce vient d'un autre numéro (ou la
        // vérification opérateur a échoué). Une annonce en cours ne suspend pas le rejet automatique.
        // Le rejet n'est annoncé que s'il a réellement été envoyé : si l'appel était déjà autorisé (numéro pas encore
        // connu comme numéro de banque au premier passage), on suit la branche « appel autorisé » (carte).
        if (store.autoHangup && (check != null || verificationFailed) && responder.reject()) {
          Notifier.callUncertified(this, bank.bankName, number, blocked = true)
        } else {
          responder.allow()
          if (!verificationFailed && check == null) {
            // Serveur injoignable : on ne peut rien confirmer. Carte rouge, notification si elle ne peut pas s'afficher.
            if (!CallOverlay.show(this, OverlayContent.unverifiedBank(bank.bankName, canHangup()), number)) Notifier.callUnverifiable(this, bank.bankName)
          }
          else if (!verificationFailed && call != null) {
            // Le serveur a répondu (check != null ici) et c'est lui qui dit si une annonce est encore ouverte : l'état
            // local peut dater (annonce terminée ou annulée depuis). Annonce ouverte pour un autre numéro : carte rouge,
            // notification seulement si elle ne peut pas s'afficher.
            if (!CallOverlay.show(this, OverlayContent.announcedOtherNumber(bank.bankName, canHangup()), number)) Notifier.callAnnouncedOtherNumber(this, bank.bankName)
          }
          else if (!CallOverlay.show(this, OverlayContent.uncertifiedBank(bank.bankName, canHangup()), number)) Notifier.callUncertified(this, bank.bankName, number, blocked = false)
        }
      } else {
        responder.allow()
        Notifier.callUnverifiable(this, bank.bankName)
      }
      return
    }

    val reports = store.reportedNumbers()[number]
    if (reports != null) {
      responder.allow()
      if (!CallOverlay.show(this, OverlayContent.reported(PhoneUtil.display(number), reports, canHangup()), number)) Notifier.callReported(this, number, reports)
      return
    }

    if (verificationFailed) {
      responder.allow()
      Notifier.callSpoofSuspected(this, number)
      return
    }

    // Un contact (ta fille qui appelle pendant une annonce) ne déclenche aucune carte hors banque.
    if (announcedElsewhere) {
      if (!contact) {
        val bankName = expected!!.bankName
        // Bandeau gris si le réglage est actif ; notification en repli (carte impossible ou réglage coupé).
        val shown = store.unknownCallBanner && CallOverlay.show(this, OverlayContent.otherNumberUnknown(bankName), number)
        if (!shown) Notifier.callAnnouncedOtherNumber(this, bankName)
      }
      return
    }
    if (!store.unknownCallBanner || contact) return
    // Numéro inconnu : le serveur a répondu qu'aucune annonce n'est ouverte. Hors ligne (remote == null),
    // on n'affirme rien. Pas de notification de repli si la carte ne peut pas s'afficher.
    if (remote != null && remote.isNull("call") && store.unknownCallBanner) {
      val names = CallSignals.announcerNames(remote)
      if (names.isNotEmpty()) CallOverlay.show(this, OverlayContent.unannounced(names), number)
    } else if (remote == null && store.unknownCallBanner && store.token != null && store.apiUrl != null) {
      // Serveur injoignable : on s'appuie sur l'annuaire synchronisé et on n'affirme rien.
      val names = store.announcers()
      if (names.isNotEmpty()) CallOverlay.show(this, OverlayContent.offlineUnknown(names), number)
    }
  }

  private fun canHangup(): Boolean = CallActionReceiver.canEndCall(this)

  /** Une seule réponse par appel, quel que soit le chemin de sortie (y compris après une exception). */
  private inner class Responder(private val details: Call.Details) {
    private val responded = AtomicBoolean(false)

    fun allow() {
      if (responded.compareAndSet(false, true)) respondToCall(details, CallResponse.Builder().build())
    }

    /** Vrai seulement si le rejet a réellement été envoyé (faux si l'appel était déjà autorisé). */
    fun reject(): Boolean {
      if (!responded.compareAndSet(false, true)) return false
      respondToCall(
        details,
        CallResponse.Builder()
          .setDisallowCall(true)
          .setRejectCall(true)
          .setSkipNotification(true)
          .build(),
      )
      return true
    }
  }
}
