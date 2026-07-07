/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface StoreConfig {
  storeName: string;
  address?: string;
  phone?: string;
  whatsappNumber?: string;
  whatsappCustomMessage?: string;
  locationUrl?: string;
  showPrices: boolean;
  hideOutOfStock?: boolean; // Hide out-of-stock products for public views
  showLocation?: boolean;   // Enable/disable the location map and branch tab
  bannerStyle?: "classic" | "compact"; // Slogan banner styling style
  promoBannerText?: string;  // Upper marquee promotion slider text
  storeImages?: string[]; // Multiple photos of the store itself
  errorNotificationEmail?: string; // Designated email address for error alerts and notifications
  updatedAt?: any; // Firestore Timestamp or Date ISO string
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  retailPrice: number; // Precio por unidad
  wholesalePrice: number; // Precio al por mayor
  images: string[]; // List of URLs
  backupImages?: string[]; // Highly compressed base64 local fallbacks for zero-loss container restart recovery
  videoUrl?: string; // YouTube, Vimeo or Direct video link
  isAvailable: boolean;
  hidePrice?: boolean; // Hide price for this specific product
  isHidden?: boolean; // Hide catalog item entirely from customers without deleting
  createdAt?: any;
  updatedAt?: any;
  views?: number;
  whatsappClicks?: number;
}

export interface AdminUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAdmin: boolean;
  role?: string;
}

export interface VipAccess {
  id: string;
  clientName: string;
  pinHash: string;
  pinLastDigits?: string; // e.g. "****" or last digit
  allowedDepartments: string[];
  sessionDurationMinutes: number;
  status: "active" | "used" | "expired" | "blocked" | "revoked";
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  firstUsedAt?: string | null;
  sessionStartedAt?: string | null;
  sessionExpiresAt?: string | null;
  deviceTokenHash?: string | null;
  deviceInfo?: {
    userAgent: string;
    platform: string;
    screenResolution?: string;
  } | null;
  failedAttempts: number;
  maxFailedAttempts: number;
  lastAttemptAt?: string | null;
  notes?: string;
  whatsappLastGeneratedAt?: string;
}

export interface VipAnalyticsEvent {
  id: string;
  accessId: string;
  clientName: string;
  eventType: "session_start" | "product_view" | "product_view_duration" | "image_click" | "whatsapp_click" | "search" | "order_created" | "session_end" | "session_expired";
  productId?: string;
  productName?: string;
  departmentId?: string;
  timestamp: string;
  durationSeconds?: number;
  metadata?: any;
}

export interface VipOrder {
  id: string;
  accessId: string;
  clientName: string;
  items: {
    productId: string;
    name: string;
    sku: string;
    price: number;
    quantity: number;
    category: string;
  }[];
  total: number;
  status: "pending" | "completed" | "cancelled";
  createdAt: string;
  whatsappMessage?: string;
  departmentSummary?: string;
}
