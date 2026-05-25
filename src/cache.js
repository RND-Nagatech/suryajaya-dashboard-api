const Redis = require("ioredis");

let redis = null;
let enabled = false;

function connectCache(redisUrl) {
  enabled = String(process.env.REDIS_ENABLED || "true").toLowerCase() !== "false";
  if (!enabled) {
    console.log("Redis cache disabled via REDIS_ENABLED");
    return;
  }

  const url = redisUrl || process.env.REDIS_URL || "redis://localhost:6379";
  redis = new Redis(url, {
    maxRetriesPerRequest: 2,
    retryStrategy(times) {
      if (times > 3) {
        console.warn("Redis connection failed after 3 retries, cache disabled");
        enabled = false;
        return null;
      }
      return Math.min(times * 200, 1000);
    },
    lazyConnect: true
  });

  redis.on("error", (err) => {
    console.warn("Redis error, cache disabled:", err.message);
    enabled = false;
  });

  redis.on("connect", () => {
    enabled = true;
    console.log("Redis cache connected");
  });

  return redis.connect().catch((err) => {
    console.warn("Redis connection failed, cache disabled:", err.message);
    enabled = false;
  });
}

function buildKey(req) {
  const params = new URLSearchParams(req.query || {});
  params.sort();
  const queryString = params.toString();
  const path = req.originalUrl || req.path || req.url;
  const base = path.split("?")[0];
  return `cache:${base}${queryString ? "?" + queryString : ""}`;
}

async function getCache(key) {
  if (!enabled || !redis) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

async function setCache(key, value, ttlSeconds) {
  if (!enabled || !redis) return;
  try {
    await redis.set(key, value, "EX", ttlSeconds);
  } catch {
    // silently ignore cache write failures
  }
}

async function invalidatePattern(pattern) {
  if (!enabled || !redis) return;
  try {
    let cursor = "0";
    const keysToDelete = [];
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      keysToDelete.push(...keys);
    } while (cursor !== "0");

    if (keysToDelete.length > 0) {
      await redis.del(...keysToDelete);
    }
  } catch {
    // silently ignore
  }
}

async function invalidateKeys(...patterns) {
  for (const pattern of patterns) {
    await invalidatePattern(pattern);
  }
}

function cacheMiddleware(ttlSeconds = 30) {
  return async (req, res, next) => {
    if (!enabled || !redis) return next();

    const key = buildKey(req);

    try {
      const cached = await getCache(key);
      if (cached !== null) {
        res.setHeader("X-Cache", "HIT");
        return res.json(JSON.parse(cached));
      }
    } catch {
      // cache read error, proceed normally
    }

    res.setHeader("X-Cache", "MISS");
    const originalJson = res.json.bind(res);
    res.json = function (body) {
      // Only cache successful responses (status 2xx)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        setCache(key, JSON.stringify(body), ttlSeconds);
      }
      return originalJson(body);
    };
    next();
  };
}

function cacheMiddlewareNoTTL() {
  return cacheMiddleware(5);
}

function cacheMiddlewareShort() {
  return cacheMiddleware(30);
}

function cacheMiddlewareLong() {
  return cacheMiddleware(300);
}

module.exports = {
  connectCache,
  getCache,
  setCache,
  cacheMiddleware,
  cacheMiddlewareNoTTL,
  cacheMiddlewareShort,
  cacheMiddlewareLong,
  invalidateKeys,
  invalidatePattern
};
