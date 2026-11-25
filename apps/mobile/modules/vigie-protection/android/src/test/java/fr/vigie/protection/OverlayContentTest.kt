package fr.vigie.protection

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OverlayContentTest {
  @Test
  fun certifiedIsGreenWithRuleAndNoButtons() {
    val c = OverlayContent.certified("Claire Martin", "Banque Horizon", "Agence Lyon", "point épargne")
    assertEquals(OverlayContent.Tone.GREEN, c.tone)
    assertEquals("Appel certifié", c.title)
    assertEquals("Claire Martin · Banque Horizon", c.headline)
    assertEquals("Agence Lyon\nMotif : point épargne", c.detail)
    assertEquals(OverlayContent.RULE, c.rule)
    assertFalse(c.showHangup)
  }

  @Test
  fun certifiedWithoutReasonOmitsMotif() {
    assertEquals("Agence Lyon", OverlayContent.certified("A", "B", "Agence Lyon", "").detail)
  }

  @Test
  fun uncertifiedIsAlwaysRedWithCallback() {
    val c = OverlayContent.uncertifiedBank("Banque Horizon", canHangup = true)
    assertEquals(OverlayContent.Tone.RED, c.tone)
    assertTrue(c.showHangup && c.showCallback)
    assertNull(c.rule)
    assertFalse(OverlayContent.uncertifiedBank("B", canHangup = false).showHangup)
  }

  @Test
  fun unannouncedWithOneBankIsNeutralWithoutButtons() {
    val c = OverlayContent.unannounced(listOf("Banque Horizon"))
    assertEquals(OverlayContent.Tone.NEUTRAL, c.tone)
    assertEquals("Banque Horizon n'a annoncé aucun appel", c.title)
    assertEquals("Si on vous dit appeler de sa part, raccrochez.", c.detail)
    assertNull(c.headline)
    assertNull(c.rule)
    assertFalse(c.showHangup || c.showCallback)
  }

  @Test
  fun unannouncedWithSeveralBanksIsPlural() {
    val c = OverlayContent.unannounced(listOf("Banque Horizon", "Crédit Nord"))
    assertEquals(OverlayContent.Tone.NEUTRAL, c.tone)
    assertEquals("Vos banques n'ont annoncé aucun appel", c.title)
    assertEquals("Si on vous dit appeler de leur part, raccrochez.", c.detail)
  }

  @Test
  fun reportedIsRedWithoutCallback() {
    val c = OverlayContent.reported("01 99 00 00 00", 3, canHangup = true)
    assertEquals(OverlayContent.Tone.RED, c.tone)
    assertFalse(c.showCallback)
  }

  @Test
  fun unverifiedBankIsRedWithCallback() {
    val c = OverlayContent.unverifiedBank("Banque Horizon", canHangup = true)
    assertEquals(OverlayContent.Tone.RED, c.tone)
    assertEquals("Appel non vérifié", c.title)
    assertEquals("Pas de connexion : SmartSecure ne peut pas vérifier cet appel de Banque Horizon. Raccrochez et rappelez votre banque.", c.detail)
    assertTrue(c.showHangup && c.showCallback)
    assertFalse(OverlayContent.unverifiedBank("B", canHangup = false).showHangup)
    assertNull(c.rule)
  }

  @Test
  fun offlineUnknownIsNeutralAndNamesOneBankOnly() {
    val one = OverlayContent.offlineUnknown(listOf("Banque Horizon"))
    assertEquals(OverlayContent.Tone.NEUTRAL, one.tone)
    assertEquals("Pas de connexion : appel non vérifié", one.title)
    assertEquals("Si on vous dit appeler de Banque Horizon, raccrochez et rappelez-la.", one.detail)
    assertFalse(one.showHangup || one.showCallback)
    val many = OverlayContent.offlineUnknown(listOf("Banque Horizon", "Crédit Nord"))
    assertEquals("Si on vous dit appeler de votre banque, raccrochez et rappelez-la.", many.detail)
  }

  @Test
  fun contactAnnouncedIsNeverGreen() {
    val c = OverlayContent.contactAnnounced("Banque Horizon")
    assertEquals(OverlayContent.Tone.NEUTRAL, c.tone)
    assertEquals("Banque Horizon a annoncé un appel", c.title)
    assertEquals("Ce numéro est dans vos contacts : SmartSecure ne peut pas le vérifier. En cas de doute, raccrochez et rappelez votre banque.", c.detail)
    assertFalse(c.showHangup || c.showCallback)
    assertNull(c.rule)
  }
}
