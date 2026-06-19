import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.ts";

const { Pool } = pg;

// Function to create a new connection pool.
export const createPool = () => {
  return new Pool({
    host: process.env.SQL_HOST,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    database: process.env.SQL_DB_NAME,
    connectionTimeoutMillis: 10000, // 10s connection timeout limit
    max: 15,                         // reasonable pool size for Cloud Run scale
    idleTimeoutMillis: 10000,       // close idle connection after 10s to bypass GCP idle timeout severing
    keepAlive: true,                // enable TCP keepAlive packets to keep connections healthy
  });
};

// Create a pool instance.
const pool = createPool();

// Prevent unhandled pool-level errors from crashing the application
pool.on("error", (err) => {
  console.error("Unexpected error on idle SQL pool client:", err);
});

// Initialize Drizzle with the pool and schema.
export const db = drizzle(pool, { schema });

// Robust database execution wrapper with auto-reconnecting retry mechanisms
export async function withDBRetry<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  let lastErr: any = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const errCode = err.code ? String(err.code).toUpperCase() : "";
      const errMsg = String(err.message || err).toLowerCase();
      
      // Categorize classic TCP, stale pooled socket, database crash/restart and query runner wrappers
      const isConnectionErr = 
        !err.code ||                   // If no database engine error code, it is a low-level socket exception
        errCode.startsWith("08") ||     // Connection Exception SQLSTATE class (08000, 08003, etc.)
        errCode === "57P01" ||         // Admin shutdown / database restart
        errCode === "57P03" ||         // Cannot connect now
        errMsg.includes("connection") || 
        errMsg.includes("econnreset") || 
        errMsg.includes("socket") || 
        errMsg.includes("closed") || 
        errMsg.includes("terminated") || 
        errMsg.includes("timeout") ||
        errMsg.includes("handshake") ||
        errMsg.includes("not queryable") ||
        errMsg.includes("failed query"); // Catch drizzle Query failed wrapper errors

      if (isConnectionErr && attempt < retries) {
        console.warn(`[SQL Retry] Intento ${attempt}/${retries} fallido debido a error de conexión transitorio: "${err.message || err}". Reintentando en ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // exponential backoff
      } else {
        throw err;
      }
    }
  }
  throw lastErr;
}
