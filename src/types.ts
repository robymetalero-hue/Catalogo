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
  videoUrl?: string; // YouTube, Vimeo or Direct video link
  isAvailable: boolean;
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
}
