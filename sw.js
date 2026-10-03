/* Service Worker —— 让 App 离线可用、可安装到桌面
   策略：应用外壳（HTML/JS/manifest/图标）预缓存；同源静态资源「网络优先，失败回落缓存」。
   注意：Service Worker 只在 https 或 localhost 下生效；file:// 打开时浏览器会忽略注册（App 内 WebView 不需要它）。 */
const CACHE = "bodycomp-v3";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./styles-v2.css",
  "./01-data.js",
  "./02-derive.js",
  "./03-charts.js",
  "./04-views.js",
  "./06-fx.js",
  "./05-app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon-32.png",
  /* 手机安装用的三件套也缓存 —— 断网也能翻看安装步骤与自检清单。
     注意：这些文件由服务器的 /download/ 路由提供（文件本身在 files/，不在 www/ 里，
     否则 cap sync 会把 apk 打进 apk —— 这个坑踩过一次）。
     预缓存失败也不影响安装（每个都 catch 成 null）。 */
  "./download/",
  "./download/自检.html",
  "./download/bodycomp-ca.crt",
  "./download/每日打卡提醒.ics"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => null)))
    )
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});

/* 允许页面主动触发「立即更新」 */
self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});
