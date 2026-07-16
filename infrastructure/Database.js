const database = require('../db');

class Database {
  query(sql, params) {
    return database.query(sql, params);
  }

  transaction(work) {
    return database.withTransaction(work);
  }
}

module.exports = { Database };
