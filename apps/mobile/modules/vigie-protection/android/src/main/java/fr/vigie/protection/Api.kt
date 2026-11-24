package fr.vigie.protection

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder

/** Petit client HTTP pour les services natifs (pas de dépendance réseau supplémentaire). */
object Api {
  fun get(store: Store, path: String, timeoutMs: Int): JSONObject? = request(store, "GET", path, null, timeoutMs)

  fun post(store: Store, path: String, body: JSONObject, timeoutMs: Int): JSONObject? = request(store, "POST", path, body, timeoutMs)

  fun enc(v: String): String = URLEncoder.encode(v, "UTF-8")

  private fun request(store: Store, method: String, path: String, body: JSONObject?, timeoutMs: Int): JSONObject? {
    val base = store.apiUrl ?: return null
    val token = store.token ?: return null
    var conn: HttpURLConnection? = null
    return try {
      conn = (URI("$base/v1$path").toURL().openConnection() as HttpURLConnection).apply {
        requestMethod = method
        connectTimeout = timeoutMs
        readTimeout = timeoutMs
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Accept", "application/json")
        if (body != null) {
          doOutput = true
          setRequestProperty("Content-Type", "application/json")
          outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        }
      }
      if (conn.responseCode !in 200..299) null
      else JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
    } catch (e: Exception) {
      null
    } finally {
      conn?.disconnect()
    }
  }
}
