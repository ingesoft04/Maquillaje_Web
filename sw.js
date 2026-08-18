const CACHE='arte-belleza-v4';
const ESTATICOS=['/','/citas','/manifest.webmanifest','/icon.svg'];

self.addEventListener('install',evento=>{
  evento.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ESTATICOS)));
  self.skipWaiting();
});
self.addEventListener('activate',evento=>{
  evento.waitUntil(caches.keys().then(claves=>Promise.all(claves.filter(c=>c!==CACHE).map(c=>caches.delete(c)))));
  self.clients.claim();
});
self.addEventListener('fetch',evento=>{
  const url=new URL(evento.request.url);
  if(evento.request.method!=='GET'||url.pathname.startsWith('/api/')||url.pathname==='/health'||url.pathname==='/metrics')return;
  evento.respondWith(fetch(evento.request).then(respuesta=>{
    const copia=respuesta.clone();caches.open(CACHE).then(cache=>cache.put(evento.request,copia));return respuesta;
  }).catch(()=>caches.match(evento.request).then(r=>r||caches.match('/'))));
});
