const { Pool } = require("pg");

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "togethr_db",
  password: "nishu2001", 
  port: 5432,
});

module.exports = pool;
