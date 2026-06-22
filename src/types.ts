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
