export interface Category {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  description?: string;
  isPrivate?: boolean;
}

export interface Bookmark {
  id: string;
  title: string;
  url: string;
  description?: string;
  categoryId: string;
  icon?: string;
  tags: string[];
  clicks: number;
  sortOrder: number;
  isPinned?: boolean;
  createdAt: string;
}

export interface SiteSettings {
  siteName: string;
  siteSubtitle: string;
  defaultViewMode: 'grid' | 'list' | 'bento' | 'compact';
  allowPublicSubmit: boolean;
  enableWeather: boolean;
  enableSearchEngine: boolean;
  defaultSearchEngine: 'baidu' | 'google' | 'bing' | 'github';
  announcement?: string;
  // Secure presence indicators (server never returns raw secret keys)
  hasGeminiApiKey?: boolean;
  hasCfApiToken?: boolean;
  // Non-sensitive infrastructure identifiers for wrangler snippet generation
  cfAccountId?: string;
  cfD1DatabaseId?: string;
  cfKvNamespaceId?: string;
  // Write-only fields when submitting from admin settings panel
  geminiApiKey?: string;
  cfApiToken?: string;
}

export interface CloudflareSystemStatus {
  d1Bound: boolean;
  kvBound: boolean;
  environment: string;
  runtime: string;
  warnings: string[];
  quotas?: {
    workers?: any;
    d1?: any;
    kv?: any;
    pages?: any;
  };
}

export type ViewMode = 'grid' | 'list' | 'bento' | 'compact';
