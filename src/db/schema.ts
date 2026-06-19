import { pgTable, text, timestamp, boolean, doublePrecision, integer, jsonb } from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: text("id").primaryKey(),
  sku: text("sku").notNull().default(""),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default(""),
  retailPrice: doublePrecision("retail_price").notNull().default(0),
  wholesalePrice: doublePrecision("wholesale_price").notNull().default(0),
  images: jsonb("images").$type<string[]>().notNull().default([]),
  videoUrl: text("video_url"),
  isAvailable: boolean("is_available").notNull().default(true),
  views: integer("views").notNull().default(0),
  whatsappClicks: integer("whatsapp_clicks").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const storeConfig = pgTable("store_config", {
  id: text("id").primaryKey().default("default"),
  storeName: text("store_name").notNull(),
  address: text("address"),
  phone: text("phone"),
  whatsappNumber: text("whatsapp_number"),
  whatsappCustomMessage: text("whatsapp_custom_message"),
  locationUrl: text("location_url"),
  showPrices: boolean("show_prices").notNull().default(true),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
