const Transport = require('winston-transport');
const { Pool } = require('pg');

module.exports = class PostgreSQL extends Transport {
  
  constructor(opts) {
    super(opts);
    // console.log(opts);

    this.tableName = opts.tableName;
    this.connectionString = opts.connectionString

    this.pool = new Pool({
      connectionString: this.connectionString,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000
    });

    this.sql = `INSERT INTO ${this.tableName}(timestamp, level, message, filename) VALUES(now(), $1, $2, $3)`;
    
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    let values = [ info.level, info.message, info.filename ];

    this.pool.query(this.sql, values, (err, res) => {
      if (err) {
        throw new Error(err.message);
      }
      this.pool._release;
    });

    callback();
  }
};