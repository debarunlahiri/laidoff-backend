// Tiny in-memory TTL cache for GET endpoints whose answer is the same for everyone
// (topic list, workforce insights, daily reminder). Never use it for per-user data.
const store = new Map();
const MAX_ENTRIES = 300;

export function cacheResponses(ttlMs) {
  return (req, res, next) => {
    if (req.method !== "GET") return next();
    const key = req.originalUrl;
    const hit = store.get(key);
    if (hit && hit.expires > Date.now()) {
      res.set("X-Cache", "HIT");
      return res.status(hit.status).json(hit.body);
    }
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value);
        store.set(key, { body, status: 200, expires: Date.now() + ttlMs });
      }
      res.set("X-Cache", "MISS");
      return json(body);
    };
    next();
  };
}
export function clearResponseCache(prefix = "") {
  for (const key of store.keys()) if (key.includes(prefix)) store.delete(key);
}
