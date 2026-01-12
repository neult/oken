import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

let container: StartedPostgreSqlContainer | null = null;
let pool: Pool | null = null;
let testDb: NodePgDatabase | null = null;

export type TestDatabase = NodePgDatabase;

export async function setupTestDatabase(): Promise<{
  db: TestDatabase;
  connectionString: string;
}> {
  // Start PostgreSQL container
  container = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("oken_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  const connectionString = container.getConnectionUri();

  // Create connection pool
  pool = new Pool({ connectionString });
  testDb = drizzle(pool);

  // Run migrations
  await migrate(testDb, { migrationsFolder: "./drizzle" });

  return { db: testDb, connectionString };
}

export async function teardownTestDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (container) {
    await container.stop();
    container = null;
  }
  testDb = null;
}

export async function cleanDatabase(db: TestDatabase): Promise<void> {
  // Truncate all tables in correct order (respecting foreign keys)
  await db.execute(sql`
    TRUNCATE TABLE
      deployments,
      secrets,
      api_keys,
      device_auth_sessions,
      agents,
      users
    CASCADE
  `);
}

export function getTestDb(): TestDatabase {
  if (!testDb) {
    throw new Error(
      "Test database not initialized. Call setupTestDatabase first."
    );
  }
  return testDb;
}
