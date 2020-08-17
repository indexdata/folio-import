/* Use this script to create a database and table to work with winston-cl-pg.js library */

DROP DATABASE IF EXISTS winston;
CREATE DATABASE winston;
\c winston;
DROP TABLE IF EXISTS winston_logs;
CREATE TABLE winston_logs
(
  timestamp timestamp without time zone DEFAULT now(),
  level text,
  message text,
  filename text
)
