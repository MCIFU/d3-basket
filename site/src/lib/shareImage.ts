/** Tarjeta de jugador en imagen (1080×1350) para compartir: se dibuja en un lienzo, sin capturar la página. */
import { src } from '../components/ui'

export interface CardData {
  name: string
  first: string
  last: string
  team: string
  season: string
  comp: string
  dk: string
  lt: string
  photo?: string | null
  crest?: string | null
  stats: [string, string][]
  extra?: string
}

const loadImg = (url: string) =>
  new Promise<HTMLImageElement | null>((res) => {
    const im = new Image()
    im.crossOrigin = 'anonymous'
    im.onload = () => res(im)
    im.onerror = () => res(null)
    im.src = url
  })

/** Una imagen solo sirve si no «ensucia» el lienzo (servidores sin CORS): se prueba en uno aparte. */
async function usable(url?: string | null) {
  if (!url) return null
  const im = await loadImg(src(url)!)
  if (!im) return null
  try {
    const c = document.createElement('canvas')
    c.width = c.height = 2
    const x = c.getContext('2d')!
    x.drawImage(im, 0, 0, 2, 2)
    x.getImageData(0, 0, 1, 1)
    return im
  } catch {
    return null
  }
}

export async function playerCard(d: CardData): Promise<Blob> {
  await document.fonts.ready
  const W = 1080
  const H = 1350
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!
  // Fondo: color del club con brillo arriba a la derecha y viñeta.
  const g = x.createRadialGradient(W * 0.85, H * 0.12, 40, W * 0.6, H * 0.4, H)
  g.addColorStop(0, d.lt)
  g.addColorStop(0.35, d.dk)
  g.addColorStop(1, '#05070b')
  x.fillStyle = g
  x.fillRect(0, 0, W, H)
  // Líneas de la pista (media pista FIBA) en blanco tenue.
  x.save()
  x.translate(W - 560, H - 760)
  x.scale(1.25, 1.25)
  x.strokeStyle = 'rgba(255,255,255,.12)'
  x.lineWidth = 2.5
  x.strokeRect(0, 0, 500, 467)
  x.strokeRect(168.5, 274, 163, 193)
  x.beginPath()
  x.arc(250, 274, 60, 0, Math.PI * 2)
  x.moveTo(30, 467)
  x.lineTo(30, 368)
  x.arc(250, 415, 225, Math.PI + 0.214, -0.214)
  x.lineTo(470, 467)
  x.stroke()
  x.restore()
  // Apellido gigante de fondo.
  x.fillStyle = 'rgba(255,255,255,.07)'
  x.font = '800 300px "Barlow Condensed"'
  x.fillText(d.last.toUpperCase(), 40, 760)
  // Foto (si el servidor la deja usar) o escudo.
  const photo = await usable(d.photo)
  const crest = await usable(d.crest)
  if (photo) {
    const h = 640
    const w = (photo.width / photo.height) * h
    x.drawImage(photo, W - w - 30, 110, w, h)
  } else if (crest) {
    x.globalAlpha = 0.9
    x.drawImage(crest, W - 400, 170, 320, 320)
    x.globalAlpha = 1
  }
  // Textos
  x.fillStyle = '#fff'
  x.font = '700 34px "Barlow Condensed"'
  x.fillText(`${d.comp} · ${d.season}`.toUpperCase(), 64, 110)
  x.font = '600 74px "Barlow Condensed"'
  x.fillText(d.first.toUpperCase(), 64, 520)
  x.font = '800 168px "Barlow Condensed"'
  let size = 168
  while (x.measureText(d.last.toUpperCase()).width > W - 128 && size > 80) x.font = `800 ${(size -= 8)}px "Barlow Condensed"`
  x.fillText(d.last.toUpperCase(), 60, 520 + size * 0.95)
  x.font = '700 40px "Barlow Condensed"'
  if (crest) x.drawImage(crest, 64, 760, 56, 56)
  x.fillText(d.team.toUpperCase(), crest ? 136 : 64, 802)
  // Cifras
  const top = 900
  const cw = (W - 128) / d.stats.length
  x.fillStyle = 'rgba(255,255,255,.96)'
  roundRect(x, 64, top, W - 128, 230, 28)
  x.fill()
  d.stats.forEach(([k, v], i) => {
    const cx = 64 + cw * i
    x.fillStyle = '#0f1216'
    x.font = '700 110px "Barlow Condensed"'
    x.fillText(v, cx + 36, top + 135)
    x.fillStyle = '#535b67'
    x.font = '600 30px "Barlow Condensed"'
    x.fillText(k.toUpperCase(), cx + 38, top + 185)
    if (i) {
      x.fillStyle = '#e3e6eb'
      x.fillRect(cx, top + 34, 2, 162)
    }
  })
  if (d.extra) {
    x.fillStyle = '#ffe08a'
    x.font = '700 38px "Barlow Condensed"'
    x.fillText(d.extra.toUpperCase(), 64, 1205)
  }
  // Firma
  x.fillStyle = '#ff6b1a'
  x.beginPath()
  x.arc(84, 1268, 20, 0, Math.PI * 2)
  x.fill()
  x.fillStyle = '#fff'
  x.font = '800 40px "Barlow Condensed"'
  x.fillText('D3 BASKET', 118, 1282)
  x.fillStyle = 'rgba(255,255,255,.6)'
  x.font = '500 26px Inter'
  x.fillText('medias por partido', W - 300, 1280)
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
}

function roundRect(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number) {
  x.beginPath()
  x.moveTo(X + r, Y)
  x.arcTo(X + w, Y, X + w, Y + h, r)
  x.arcTo(X + w, Y + h, X, Y + h, r)
  x.arcTo(X, Y + h, X, Y, r)
  x.arcTo(X, Y, X + w, Y, r)
  x.closePath()
}

/** Comparte la imagen (móvil) o la descarga (ordenador). */
export async function shareOrDownload(blob: Blob, name: string) {
  const file = new File([blob], `${name}.png`, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name })
      return
    } catch {}
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${name}.png`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
