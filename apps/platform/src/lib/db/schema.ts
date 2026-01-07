import { pgTable, uuid, varchar, timestamp, text } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 50 }).notNull(),
  endpoint: varchar("endpoint", { length: 255 }),
  pythonVersion: varchar("python_version", { length: 20 }),
  entrypoint: varchar("entrypoint", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const secrets = pgTable("secrets", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  agentId: uuid("agent_id").references(() => agents.id),
  name: varchar("name", { length: 255 }).notNull(),
  value: text("value").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const deployments = pgTable("deployments", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id").references(() => agents.id),
  status: varchar("status", { length: 50 }).notNull(),
  logs: text("logs"),
  createdAt: timestamp("created_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
});
