import {
  sanitizeSettingsForPublic,
  sanitizeSettingsForAdmin,
  PUBLIC_SETTINGS_KEYS,
  ADMIN_SAFE_SETTINGS_KEYS,
  IMPORT_SETTINGS_WHITELIST
} from "../utils/security.ts";
import { SettingsSchema } from "./schemas.ts";

export class SettingsService {
  /**
   * Cleanses raw settings for public unauthenticated visitors.
   */
  static getPublicView(rawSettings: Record<string, any>): Record<string, any> {
    return sanitizeSettingsForPublic(rawSettings);
  }

  /**
   * Cleanses raw settings for authenticated administrator.
   */
  static getAdminView(
    rawSettings: Record<string, any>,
    envOptions?: { hasEnvGeminiKey?: boolean; hasEnvCfToken?: boolean }
  ): Record<string, any> {
    return sanitizeSettingsForAdmin(rawSettings, envOptions);
  }

  /**
   * Validates and sanitizes settings update payload from admin with Zod SettingsSchema.
   */
  static sanitizeUpdatePayload(payload: Record<string, any>): Record<string, any> {
    if (!payload || typeof payload !== "object") return {};
    
    // Validate with Zod schema
    const parseResult = SettingsSchema.safeParse(payload);
    const validData = parseResult.success ? parseResult.data : {};

    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(validData)) {
      if (value !== undefined) {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}
