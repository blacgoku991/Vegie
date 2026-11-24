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
  fun reportedIsRedWithoutCallback() {
    val c = OverlayContent.reported("01 99 00 00 00", 3, canHangup = true)
    assertEquals(OverlayContent.Tone.RED, c.tone)
    assertFalse(c.showCallback)
  }
}
