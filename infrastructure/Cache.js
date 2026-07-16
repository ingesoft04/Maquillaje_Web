const redis = require('../redis');

class Cache {
  get(key) { return redis.getCache(key); }
  set(key, value, ttl) { return redis.setCache(key, value, ttl); }
  delete(key) { return redis.delCache(key); }
  deletePattern(pattern) { return redis.delPattern(pattern); }
}

module.exports = { Cache };
