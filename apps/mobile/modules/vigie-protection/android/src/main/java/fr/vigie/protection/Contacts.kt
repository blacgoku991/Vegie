package fr.vigie.protection

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.ContactsContract
import androidx.core.content.ContextCompat

/**
 * Recherche « ce numéro est-il enregistré dans les contacts ? ». Aucun nom n'est lu, rien n'est stocké ni transmis :
 * seul l'identifiant technique d'une éventuelle correspondance est demandé, pour savoir si elle existe.
 */
object Contacts {
  fun granted(ctx: Context): Boolean =
    ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS) == PackageManager.PERMISSION_GRANTED

  fun isContact(ctx: Context, number: String): Boolean {
    if (number.isBlank() || !granted(ctx)) return false
    return try {
      val uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(number))
      ctx.contentResolver.query(uri, arrayOf(ContactsContract.PhoneLookup._ID), null, null, null)?.use { it.moveToFirst() } ?: false
    } catch (e: Exception) {
      false
    }
  }
}
