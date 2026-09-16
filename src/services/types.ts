/**
 * Unified Domain Models & Storage Interfaces for OmniMark
 * Shared across Node.js (Local/Express) and Cloudflare Workers (Edge/D1/KV)
 */

export interface CategoryModel {
  id: string;
  name: string;
  icon?: string;
  sortOrder: number;
  createdAt?: number;
}

export interface BookmarkModel {
  id: string;
  categoryId: string;
  title: string;
  url: string;
  icon?: string;
  description?: string;
  tags?: string[];
  isPinned?: boolean;
  sortOrder: number;
  clicks: number;
  createdAt?: number;
}

export interface AdminSessionModel {
  token?: string;
  tokenHash: string;
  expiresAt: number;
}

export interface SettingsModel {
  adminPasswordHash?: string;
  siteName?: string;
  siteSubtitle?: string;
  announcement?: string;
  defaultViewMode?: string;
  allowPublicSubmit?: boolean;
  enableWeather?: boolean;
  enableSearchEngine?: boolean;
  defaultSearchEngine?: string;
  geminiApiKey?: string;
  cfAccountId?: string;
  cfApiToken?: string;
  cfD1DatabaseId?: string;
  cfKvNamespaceId?: string;
  [key: string]: any;
}
