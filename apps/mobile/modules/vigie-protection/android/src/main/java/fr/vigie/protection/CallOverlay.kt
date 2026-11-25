package fr.vigie.protection

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Grand popup par-dessus l'écran d'appel (TYPE_APPLICATION_OVERLAY), construit en code.
 * Nécessite SYSTEM_ALERT_WINDOW ; sans elle, [show] renvoie false et l'appelant garde la notification.
 * Fenêtre non focalisable et non modale : le téléphone reste utilisable (répondre, refuser) sous la carte.
 * Fermeture : croix, toucher hors boutons, ou automatiquement après 45 s.
 */
object CallOverlay {
  private const val AUTO_CLOSE_MS = 45_000L
  private const val NEUTRAL_AUTO_CLOSE_MS = 20_000L
  private val main = Handler(Looper.getMainLooper())
  private var current: View? = null
  private var currentWm: WindowManager? = null
  private val autoClose = Runnable { dismissNow() }

  fun canDraw(ctx: Context): Boolean = Build.VERSION.SDK_INT < Build.VERSION_CODES.M || Settings.canDrawOverlays(ctx)

  /**
   * Affiche la carte. Renvoie true seulement si elle a bien été ajoutée à l'écran.
   * À appeler depuis un thread de travail (le filtrage d'appels en utilise un), jamais le thread principal.
   */
  fun show(ctx: Context, content: OverlayContent, number: String?): Boolean {
    val app = ctx.applicationContext
    if (!canDraw(app)) return false
    if (Looper.myLooper() == Looper.getMainLooper()) return add(app, content, number)
    val latch = CountDownLatch(1)
    // État partagé avec le thread principal : une seule décision (ajouter ou abandonner), prise par compareAndSet.
    // 0 = en attente, 1 = ajoutée, 2 = abandonnée (l'attente a expiré : l'appelant garde la notification).
    val state = java.util.concurrent.atomic.AtomicInteger(0)
    main.post {
      if (state.get() == 0) {
        val added = add(app, content, number)
        if (!state.compareAndSet(0, if (added) 1 else 2) && added) dismissNow() // abandonnée entre-temps : on retire la vue
      }
      latch.countDown()
    }
    latch.await(1500, TimeUnit.MILLISECONDS)
    // Si l'attente expire avant l'exécution, on abandonne : la vue ne s'ajoutera plus (pas de popup ET notification).
    state.compareAndSet(0, 2)
    return state.get() == 1
  }

  fun dismiss() {
    main.post { dismissNow() }
  }

  private fun add(app: Context, content: OverlayContent, number: String?): Boolean = try {
    dismissNow()
    val wm = app.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    val view = build(app, content, number)
    wm.addView(view, params(app))
    current = view
    currentWm = wm
    main.postDelayed(autoClose, if (content.tone == OverlayContent.Tone.NEUTRAL) NEUTRAL_AUTO_CLOSE_MS else AUTO_CLOSE_MS)
    true
  } catch (e: Exception) {
    // Permission retirée entre-temps, fenêtre refusée par le système : on retombe sur la notification.
    false
  }

  private fun dismissNow() {
    main.removeCallbacks(autoClose)
    val v = current ?: return
    try {
      currentWm?.removeViewImmediate(v)
    } catch (e: Exception) {
      // Déjà retirée.
    }
    current = null
    currentWm = null
  }

  @Suppress("DEPRECATION")
  private fun params(ctx: Context): WindowManager.LayoutParams {
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    else WindowManager.LayoutParams.TYPE_PHONE
    return WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.WRAP_CONTENT,
      type,
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL or
        WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
        // Téléphone verrouillé : l'écran d'appel s'affiche par-dessus le verrouillage, la carte doit le suivre
        // (sans ce drapeau, Android la cache tant que l'écran est verrouillé).
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED,
      PixelFormat.TRANSLUCENT,
    ).apply {
      // Sous le bandeau d'appel entrant (téléphone déverrouillé) et sous le nom de l'appelant (écran d'appel
      // plein écran), au-dessus des boutons Répondre / Refuser : vérifié sur émulateur Android 15.
      gravity = Gravity.TOP
      y = (ctx.resources.displayMetrics.heightPixels * 0.23f).toInt()
    }
  }

  private fun dp(ctx: Context, v: Int) = (v * ctx.resources.displayMetrics.density).toInt()

  private fun label(ctx: Context, s: String, sp: Float, bold: Boolean = false) = TextView(ctx).apply {
    text = s
    textSize = sp
    setTextColor(Color.WHITE)
    if (bold) setTypeface(typeface, Typeface.BOLD)
  }

  private fun round(color: Int, radiusDp: Float, ctx: Context) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = radiusDp * ctx.resources.displayMetrics.density
  }

  /** Bandeau gris discret (ton NEUTRAL) : une ligne d'en-tête, un détail, aucun bouton. */
  private fun buildCompact(ctx: Context, c: OverlayContent): View {
    val card = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      background = GradientDrawable().apply {
        setColor(0xFF1C1C1E.toInt())
        setStroke(dp(ctx, 1), 0xFF38383A.toInt())
        cornerRadius = 20f * ctx.resources.displayMetrics.density
      }
      setPadding(dp(ctx, 14), dp(ctx, 14), dp(ctx, 14), dp(ctx, 14))
      setOnClickListener { dismissNow() }
    }
    val header = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    val logo = ImageView(ctx).apply { setImageResource(R.drawable.smartsecure_logo) }
    header.addView(logo, LinearLayout.LayoutParams(dp(ctx, 20), dp(ctx, 20)))
    header.addView(label(ctx, c.title, 15f, bold = true).apply { setPadding(dp(ctx, 8), 0, dp(ctx, 8), 0) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    header.addView(
      label(ctx, "✕", 16f).apply {
        contentDescription = "Fermer"
        gravity = Gravity.CENTER
        setOnClickListener { dismissNow() }
      },
      LinearLayout.LayoutParams(dp(ctx, 28), dp(ctx, 28)),
    )
    card.addView(header)
    c.detail?.let {
      card.addView(label(ctx, it, 14f).apply {
        setTextColor(0xFFD1D1D6.toInt())
        setPadding(0, dp(ctx, 6), 0, 0)
      })
    }
    return FrameLayout(ctx).apply {
      setPadding(dp(ctx, 14), 0, dp(ctx, 14), 0)
      addView(card, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }
  }

  private fun build(ctx: Context, c: OverlayContent, number: String?): View {
    if (c.tone == OverlayContent.Tone.NEUTRAL) return buildCompact(ctx, c)
    val bg = if (c.tone == OverlayContent.Tone.GREEN) OverlayContent.GREEN_COLOR else OverlayContent.RED_COLOR
    val card = LinearLayout(ctx).apply {
      orientation = LinearLayout.VERTICAL
      background = round(bg, 28f, ctx)
      setPadding(dp(ctx, 18), dp(ctx, 16), dp(ctx, 18), dp(ctx, 18))
      // Pas d'ombre portée : la fenêtre a la taille de la carte, l'ombre y dessinait des coins gris sur fond clair.
      // Toucher hors des boutons : ferme la carte.
      setOnClickListener { dismissNow() }
    }

    // En-tête : logo + « SmartSecure » + croix.
    val header = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    val logo = ImageView(ctx).apply { setImageResource(R.drawable.smartsecure_logo) }
    header.addView(logo, LinearLayout.LayoutParams(dp(ctx, 24), dp(ctx, 24)))
    header.addView(label(ctx, "SmartSecure", 13.5f, bold = true).apply { setPadding(dp(ctx, 8), 0, 0, 0) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    header.addView(
      label(ctx, "✕", 20f).apply {
        contentDescription = "Fermer"
        gravity = Gravity.CENTER
        setOnClickListener { dismissNow() }
      },
      LinearLayout.LayoutParams(dp(ctx, 40), dp(ctx, 40)),
    )
    card.addView(header)

    // Titre avec pastille blanche (✓ ou !) : le verdict est aussi en toutes lettres.
    val titleRow = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
    val badge = TextView(ctx).apply {
      text = if (c.tone == OverlayContent.Tone.GREEN) "✓" else "!"
      gravity = Gravity.CENTER
      setTextColor(bg)
      textSize = 20f
      setTypeface(typeface, Typeface.BOLD)
      background = round(Color.WHITE, 18f, ctx)
    }
    titleRow.addView(badge, LinearLayout.LayoutParams(dp(ctx, 36), dp(ctx, 36)))
    titleRow.addView(label(ctx, c.title, 25f, bold = true).apply { setPadding(dp(ctx, 10), 0, 0, 0) })
    card.addView(titleRow, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(ctx, 6) })

    c.headline?.let { card.addView(label(ctx, it, 19f, bold = true).apply { setPadding(0, dp(ctx, 12), 0, 0) }) }
    c.detail?.let { card.addView(label(ctx, it, 15.5f).apply { setPadding(0, dp(ctx, 4), 0, 0) }) }
    c.rule?.let {
      val sep = View(ctx).apply { setBackgroundColor(0x47FFFFFF) }
      card.addView(sep, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(ctx, 1)).apply { topMargin = dp(ctx, 14) })
      card.addView(label(ctx, it, 14.5f).apply { setPadding(0, dp(ctx, 12), 0, 0) })
    }

    if (c.showHangup || c.showCallback) {
      val row = LinearLayout(ctx).apply { orientation = LinearLayout.HORIZONTAL }
      if (c.showHangup) {
        row.addView(
          button(ctx, "Raccrocher", Color.WHITE, 0xFFB3261E.toInt()) {
            // Même mécanisme que la notification : CallActionReceiver raccroche puis signale le numéro.
            val i = Intent(ctx, CallActionReceiver::class.java).apply {
              action = CallActionReceiver.ACTION_END_CALL
              putExtra(CallActionReceiver.EXTRA_NUMBER, number)
            }
            ctx.sendBroadcast(i)
            dismissNow()
          },
          LinearLayout.LayoutParams(0, dp(ctx, 50), 1f),
        )
      }
      if (c.showCallback) {
        row.addView(
          button(ctx, "Rappeler ma banque", 0x33FFFFFF, Color.WHITE) {
            val i = Intent(Intent.ACTION_VIEW, Uri.parse("smartsecure://callback")).apply {
              setPackage(ctx.packageName)
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            }
            try {
              ctx.startActivity(i)
            } catch (e: Exception) {
              // App indisponible : la carte reste fermable.
            }
            dismissNow()
          },
          LinearLayout.LayoutParams(0, dp(ctx, 50), 1f).apply { if (c.showHangup) leftMargin = dp(ctx, 10) },
        )
      }
      card.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(ctx, 16) })
    }

    // Marge latérale de 14 dp autour de la carte.
    return FrameLayout(ctx).apply {
      setPadding(dp(ctx, 14), 0, dp(ctx, 14), 0)
      addView(card, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }
  }

  private fun button(ctx: Context, text: String, bg: Int, fg: Int, onClick: () -> Unit) = TextView(ctx).apply {
    this.text = text
    gravity = Gravity.CENTER
    setTextColor(fg)
    textSize = 16f
    setTypeface(typeface, Typeface.BOLD)
    background = round(bg, 14f, ctx)
    setPadding(dp(ctx, 8), 0, dp(ctx, 8), 0)
    setOnClickListener { onClick() }
  }
}
