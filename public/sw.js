// d3 basket sin conexión: guarda la web, los datos y las imágenes que ya se han visto.
//  · página y datos (d/*.json): primero la red; sin red, la copia guardada
//  · código (assets/*, con huella en el nombre): la copia guardada si existe
//  · imágenes: la copia guardada al momento y se renueva en segundo plano
const V = 'v1'
const SHELL = `shell-${V}`
const DATA = `data-${V}`
const IMG = `img-${V}`
const MAX_IMG = 800

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './manifest.webmanifest'])).then(() => self.skipWaiting()))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => ![SHELL, DATA, IMG].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

const networkFirst = async (req, name) => {
  const c = await caches.open(name)
  try {
    const r = await fetch(req)
    if (r.ok) c.put(req, r.clone())
    return r
  } catch {
    return (await c.match(req)) ?? (req.mode === 'navigate' ? await c.match('./') : undefined) ?? Response.error()
  }
}
const cacheFirst = async (req, name) => {
  const c = await caches.open(name)
  const hit = await c.match(req)
  if (hit) return hit
  const r = await fetch(req)
  if (r.ok) c.put(req, r.clone())
  return r
}
const trim = async (c) => {
  const ks = await c.keys()
  for (const k of ks.slice(0, Math.max(0, ks.length - MAX_IMG))) await c.delete(k)
}
const staleWhileRevalidate = async (req, name) => {
  const c = await caches.open(name)
  const hit = await c.match(req)
  const net = fetch(req)
    .then((r) => {
      if (r.ok || r.type === 'opaque') c.put(req, r.clone()).then(() => trim(c))
      return r
    })
    .catch(() => hit)
  return hit ?? net
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const same = url.origin === self.location.origin
  if (req.mode === 'navigate') return e.respondWith(networkFirst(req, SHELL))
  if (same && url.pathname.includes('/d/')) return e.respondWith(networkFirst(req, DATA))
  if (same && url.pathname.includes('/assets/')) return e.respondWith(cacheFirst(req, SHELL))
  if (req.destination === 'image' || (same && url.pathname.includes('/media/'))) return e.respondWith(staleWhileRevalidate(req, IMG))
  if (same) return e.respondWith(networkFirst(req, SHELL))
})
