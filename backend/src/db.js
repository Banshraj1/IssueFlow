import mysql from 'mysql2/promise';
import 'dotenv/config';

const databaseUrl = new URL(process.env.DATABASE_URL || 'mysql://issueflow:change-me@localhost:3306/issueflow');
export const pool = mysql.createPool({
  host: databaseUrl.hostname,
  port: Number(databaseUrl.port || 3306),
  user: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  database: databaseUrl.pathname.slice(1),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: 'Z',
  decimalNumbers: true
});
