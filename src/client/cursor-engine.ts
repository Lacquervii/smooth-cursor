/**
 * Custom caret engine for the chat composer textarea, ported from the Obsidian
 * "animated cursor" plugin (likemuuxi/animated-cursor) that runs in the user's
 * vault. Its CodeMirror hooks have no textarea equivalent, so the RENDER is
 * reproduced 1:1 on an overlay <canvas> while the caret target coordinates
 * come from the textarea's own layout via the mirror-measure technique.
 *
 * Comet mode, exactly as the plugin: the caret is a small rectangle that eases
 * toward the target with a soft lerp; while it travels it leaves a tapered,
 * fading stroke trail. (The plugin's Blink mode is removed at the user's
 * request — this feature is comet-only.)
 *
 * IME is handled by re-measuring every frame while a composition is active
 * (the browser can lay the preview out differently than the mirror).
 *
 * All state is re-read each animation frame — `document.activeElement`, the
 * textarea's selection/scroll, and its bounding rect — so nothing needs
 * per-element attach/dispose and the composer can remount freely. Every owned
 * node and listener is removed on dispose, keeping plugin reloads (HMR) clean.
 */
import type { CursorSettings, CursorSize } from './cursor-settings.ts'

const OVERLAY_ID = 'dsh-client-cursor-overlay'
const STYLE_ID = 'dsh-client-cursor-style'

/** The chat composer textarea, identified by its phase attribute. */
const COMPOSER_SELECTOR = 'textarea[data-phase]'

/** Comet-mode caret width per size. */
const COMET_WIDTH: Record<CursorSize, number> = { small: 1.5, medium: 2, large: 2.5 }
/** Comet trail length per size (the plugin's default is 5). */
const COMET_TRAIL: Record<CursorSize, number> = { small: 5, medium: 7, large: 10 }

/** Smoothness of the glide (the plugin's comet 0.2). */
const COMET_SMOOTHNESS = 0.2
/** Distance below which the eased caret snaps onto the target. */
const SNAP_EPSILON = 0.1
/** Comet mode: travel below this counts as "resting" (no new trail). */
const COMET_MOVE_THRESHOLD = 0.2

const CARET_CSS = `
#${OVERLAY_ID} {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  pointer-events: none;
}
#${OVERLAY_ID}[data-active='false'] { display: none; }
/* Hide the composer's native caret while the effect owns it. */
html.dsh-cursor-active textarea[data-phase] { caret-color: transparent; }
`

/** requestAnimationFrame with a setTimeout fallback (jsdom/tests). */
const raf = (callback: FrameRequestCallback): number =>
  typeof window.requestAnimationFrame === 'function'
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(() => { callback(performance.now()) }, 16)

/** cancelAnimationFrame matching {@link raf}'s two implementations. */
const caf = (id: number): void => {
  if (typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(id)
  else window.clearTimeout(id)
}

/** A caret position in the textarea's content coordinate space. */
interface CursorPoint {
  /** Horizontal offset (px) from the content origin. */
  left: number
  /** Vertical offset (px) from the content origin. */
  top: number
  /** Line height in px (the caret's height). */
  height: number
}

/**
 * Measure the caret position inside a textarea using the mirror technique:
 * a hidden replica of the textarea reflows the text up to `selectionStart`,
 * and a marker span reports where that line lands — covering wrap, line
 * height, padding, and scroll the way `getComputedStyle` alone cannot.
 */
function measureCaret(textarea: HTMLTextAreaElement): CursorPoint | null {
  const start = textarea.selectionStart
  const value = textarea.value
  if (start < 0 || start > value.length) return null

  const style = window.getComputedStyle(textarea)
  const mirror = document.createElement('div')
  mirror.setAttribute('aria-hidden', 'true')
  const mirrorStyle = mirror.style as unknown as Record<string, string>
  for (const prop of MIRROR_STYLE_PROPS) {
    const value = style[prop]
    if (typeof value === 'string') mirrorStyle[prop] = value
  }
  // The mirror box must wrap at the textarea's exact content width (boxSizing
  // is copied — the composer uses border-box), so clientWidth is enough.
  mirror.style.width = `${textarea.clientWidth}px`
  mirror.style.whiteSpace = 'pre-wrap'
  mirror.style.position = 'absolute'
  mirror.style.top = '0'
  mirror.style.visibility = 'hidden'

  const prefix = value.slice(0, start)
  mirror.textContent = prefix.endsWith('\n') ? `${prefix.replace(/\n$/, '')} \n` : prefix

  const marker = document.createElement('span')
  marker.style.position = 'absolute'
  marker.textContent = '\u200b'
  mirror.appendChild(marker)

  document.body.appendChild(mirror)
  mirror.scrollTop = textarea.scrollTop
  mirror.scrollLeft = textarea.scrollLeft

  const borderTop = parseFloat(style.borderTopWidth) || 0
  const borderLeft = parseFloat(style.borderLeftWidth) || 0
  const left = (marker.offsetLeft + borderLeft - textarea.scrollLeft) || 0
  const top = (marker.offsetTop + borderTop - textarea.scrollTop) || 0
  const height = parseFloat(style.lineHeight) || 20

  mirror.remove()
  return { left, top, height }
}

/** Textarea presentation props the mirror must reproduce for a faithful reflow. */
const MIRROR_STYLE_PROPS: readonly (keyof CSSStyleDeclaration & string)[] = [
  'boxSizing', 'overflowWrap', 'wordBreak', 'whiteSpace', 'lineHeight',
  'wordSpacing', 'letterSpacing', 'fontFamily', 'fontSize', 'fontWeight',
  'fontStyle', 'textTransform', 'textIndent', 'textAlign',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
]

/**
 * Canvas caret engine. Constructor mounts the overlay canvas + style + the
 * document-capture IME listeners when a browser document exists (node runs
 * see none and become no-ops); {@link apply} drives visibility, color,
 * thickness, and the trail switch; {@link dispose} tears everything.
 */
export class CursorEngine {
  private settings: CursorSettings
  private readonly overlay: HTMLCanvasElement | undefined
  private readonly ctx: CanvasRenderingContext2D | undefined
  private readonly style: HTMLStyleElement | undefined

  private raf = 0
  /** Whether the draw loop is scheduled (started on the first enabling apply). */
  private running = false
  private dpr = 1

  // Eased caret + target (viewport px).
  private currentX = 0
  private currentY = 0
  private targetX = 0
  private targetY = 0
  private currentHeight = 20
  private initialized = false

  // Comet trail (plugin state).
  private trailPts: { x: number; y: number }[] = []

  private composing = false
  private lastSignature = ''
  private caret: CursorPoint | null = null

  private readonly onCompositionStart = (event: Event): void => {
    const target = event.target
    if (!(target instanceof HTMLTextAreaElement) || !target.matches(COMPOSER_SELECTOR)) return
    this.composing = true
    this.lastSignature = ''
  }

  private readonly onCompositionEnd = (event: Event): void => {
    const target = event.target
    if (!(target instanceof HTMLTextAreaElement) || !target.matches(COMPOSER_SELECTOR)) return
    this.composing = false
    this.lastSignature = ''
  }

  /** @param settings - initial effect preference (first apply re-applies). */
  constructor(settings: CursorSettings) {
    this.settings = settings
    if (typeof document === 'undefined' || typeof window === 'undefined') return

    this.style = document.createElement('style')
    this.style.id = STYLE_ID
    this.style.textContent = CARET_CSS
    document.head.appendChild(this.style)

    this.overlay = document.createElement('canvas')
    this.overlay.id = OVERLAY_ID
    this.overlay.dataset.active = 'false'
    this.ctx = this.overlay.getContext('2d') ?? undefined
    document.body.appendChild(this.overlay)

    document.addEventListener('compositionstart', this.onCompositionStart, { capture: true })
    document.addEventListener('compositionend', this.onCompositionEnd, { capture: true })
  }

  /**
   * Apply one effect preference: color, thickness, trail switch, and the
   * native-caret lock. While enabled, a synchronous pass renders
   * immediately against the current focus.
   */
  apply(settings: CursorSettings): void {
    this.settings = settings
    if (this.overlay === undefined) return
    this.overlay.dataset.color = settings.color
    this.overlay.dataset.size = settings.size

    const root = document.documentElement
    root.classList.toggle('dsh-cursor-active', settings.enabled)
    if (!settings.enabled) {
      caf(this.raf)
      this.running = false
      this.overlay.dataset.active = 'false'
      this.clear()
      return
    }
    this.overlay.dataset.active = 'true'
    if (!this.running) {
      this.running = true
      this.initialized = false
      this.lastSignature = ''
      this.raf = raf(this.loop)
    }
    this.renderOnce()
  }

  /** Remove the overlay, style, listeners, and native-caret lock. */
  dispose(): void {
    if (this.overlay === undefined) return
    this.running = false
    caf(this.raf)
    document.removeEventListener('compositionstart', this.onCompositionStart, { capture: true })
    document.removeEventListener('compositionend', this.onCompositionEnd, { capture: true })
    this.overlay.remove()
    this.style?.remove()
    document.documentElement.classList.remove('dsh-cursor-active')
  }

  /** One animation frame: size, measure, ease, draw. */
  private readonly loop = (): void => {
    this.renderOnce()
    this.raf = raf(this.loop)
  }

  /** Synchronous render pass (also the per-frame body). */
  private renderOnce(): void {
    const ctx = this.ctx
    if (this.overlay === undefined || ctx === undefined) return
    if (!this.settings.enabled) return

    this.resize()
    const width = window.innerWidth
    const height = window.innerHeight
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const textarea = this.focusedComposer()
    if (textarea === null) {
      // The composer lost focus (e.g. Settings opened): draw nothing and drop
      // the stale caret/trail, so the effect never floats over other chrome.
      this.clear()
      this.trailPts = []
      this.initialized = false
      this.lastSignature = ''
      return
    }

    // Re-measure every frame while composing; otherwise on signature change.
    if (this.composing || this.signature(textarea) !== this.lastSignature) {
      this.lastSignature = this.composing ? '' : this.signature(textarea)
      this.caret = measureCaret(textarea)
    }
    if (this.caret === null) {
      this.clear()
      return
    }
    const rect = textarea.getBoundingClientRect()
    this.targetX = rect.left + this.caret.left
    this.targetY = rect.top + this.caret.top
    this.currentHeight = this.caret.height

    if (!this.initialized) {
      this.currentX = this.targetX
      this.currentY = this.targetY
      this.initialized = true
    }

    this.renderComet(ctx)
  }

  /** Resize the backing canvas to the viewport × devicePixelRatio. */
  private resize(): void {
    if (this.overlay === undefined) return
    const dpr = window.devicePixelRatio || 1
    // A <canvas> element renders at its buffer size in CSS pixels unless its
    // style is pinned, so set BOTH: buffer = viewport × dpr, CSS = viewport.
    const cssWidth = window.innerWidth
    const cssHeight = window.innerHeight
    const width = Math.max(1, Math.round(cssWidth * dpr))
    const height = Math.max(1, Math.round(cssHeight * dpr))
    if (this.overlay.width !== width || this.overlay.height !== height) {
      this.overlay.width = width
      this.overlay.height = height
      this.dpr = dpr
    }
    if (this.overlay.style.width !== `${cssWidth}px`) this.overlay.style.width = `${cssWidth}px`
    if (this.overlay.style.height !== `${cssHeight}px`) this.overlay.style.height = `${cssHeight}px`
  }

  /** Comet mode: lerp 0.2, tapered stroke trail, rectangle head (plugin `S`). */
  private renderComet(ctx: CanvasRenderingContext2D): void {
    const target = this.targetX
    if (Math.abs(this.targetX - this.currentX) < SNAP_EPSILON) this.currentX = this.targetX
    else this.currentX += (target - this.currentX) * COMET_SMOOTHNESS
    if (Math.abs(this.targetY - this.currentY) < SNAP_EPSILON) this.currentY = this.targetY
    else this.currentY += (this.targetY - this.currentY) * COMET_SMOOTHNESS

    const moving = Math.hypot(this.targetX - this.currentX, this.targetY - this.currentY) > COMET_MOVE_THRESHOLD
    if (moving && this.settings.trail) {
      this.trailPts.push({ x: this.currentX, y: this.currentY })
      if (this.trailPts.length > COMET_TRAIL[this.settings.size]) this.trailPts.shift()
      this.drawCometTrail(ctx)
    } else {
      this.trailPts = []
    }
    this.drawCometHead(ctx, moving)
  }

  private drawCometTrail(ctx: CanvasRenderingContext2D): void {
    if (this.trailPts.length < 2) return
    const color = this.settings.color
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.shadowBlur = 8
    ctx.shadowColor = color
    const width = COMET_WIDTH[this.settings.size]
    for (let s = 0; s < this.trailPts.length - 1; s += 1) {
      const from = this.trailPts[s]
      const to = this.trailPts[s + 1]
      if (from === undefined || to === undefined) continue
      const a = s / this.trailPts.length
      ctx.beginPath()
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(to.x, to.y)
      ctx.lineWidth = width + a * 2
      ctx.strokeStyle = this.hexToRgba(color, a)
      ctx.stroke()
    }
  }

  private drawCometHead(ctx: CanvasRenderingContext2D, moving: boolean): void {
    const color = this.settings.color
    const width = COMET_WIDTH[this.settings.size]
    const n = Math.max(8, this.currentHeight || 24)
    ctx.fillStyle = color
    ctx.shadowBlur = moving ? 10 : 0
    ctx.shadowColor = color
    ctx.fillRect(this.currentX - width / 2, this.currentY, width, n)
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = Number.parseInt(hex.slice(1, 3), 16)
    const g = Number.parseInt(hex.slice(3, 5), 16)
    const b = Number.parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  private clear(): void {
    if (this.ctx === undefined || this.overlay === undefined) return
    // Reset the transform first, then blank the whole backing store.
    this.ctx.setTransform(1, 0, 0, 1, 0, 0)
    this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height)
  }

  /** The composer textarea when it has focus, else null. */
  private focusedComposer(): HTMLTextAreaElement | null {
    const active = document.activeElement
    if (!(active instanceof HTMLTextAreaElement)) return null
    if (!active.matches(COMPOSER_SELECTOR)) return null
    return active
  }

  /** Track the pieces that change where the caret line lands. */
  private signature(textarea: HTMLTextAreaElement): string {
    return `${textarea.selectionStart}|${textarea.value.length}|${textarea.scrollTop}|${textarea.scrollLeft}|${textarea.clientWidth}`
  }
}
