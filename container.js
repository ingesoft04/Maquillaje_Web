const { Database } = require('./infrastructure/Database');
const { Cache } = require('./infrastructure/Cache');
const { ComparacionRepository } = require('./repositories/ComparacionRepository');
const { ComparacionService } = require('./services/ComparacionService');
const { TTL } = require('./redis');

const database = new Database();
const cache = new Cache();

const comparacionRepository = new ComparacionRepository(database);
const comparacionService = new ComparacionService(comparacionRepository, cache, TTL.CATALOGO);

module.exports = {
  database,
  cache,
  comparacionRepository,
  comparacionService
};
