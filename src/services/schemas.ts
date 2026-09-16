import { z } from "zod";
import { isSafeUrl, isSafeDomain, MIN_ADMIN_PASSWORD_LENGTH } from "../utils/security.ts";

/**
 * Zod validation schemas for OmniMark.
 * Standardizes validation across Node.js backend, Cloudflare Workers, and Frontend.
 */

// 1. Bookmark Schema
export const BookmarkSchema = z.object({
  id: z.string().max(100).optional(),
  title: z
    .string()
    .trim()
    .min(1, "书签名称不能为空")
    .max(200, "书签名称不能超过 200 个字符"),
  url: z
    .string()
    .trim()
    .min(1, "网址 URL 不能为空")
    .max(2000, "网址 URL 长度不能超过 2000 个字符")
    .transform((val) => {
      if (!val.startsWith("http://") && !val.startsWith("https://")) {
        return "https://" + val;
      }
      return val;
    })
    .refine((val) => isSafeUrl(val), {
      message: "目标网址不安全或协议不受支持（仅支持安全的 HTTP/HTTPS）"
    }),
  categoryId: z
    .string()
    .trim()
    .min(1, "必须指定所属分类")
    .max(100, "分类 ID 过长"),
  description: z
    .string()
    .trim()
    .max(500, "描述不能超过 500 个字符")
    .default("")
    .optional(),
  icon: z
    .string()
    .trim()
    .max(10000, "图标链接过长")
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        return (
          val.startsWith("data:image/") ||
          val.startsWith("/api/icon-proxy") ||
          isSafeUrl(val)
        );
      },
      { message: "书签图标必须为合法的安全图片链接或 data:image" }
    ),
  tags: z
    .array(z.string().trim().max(30, "标签长度不能超过 30 个字符"))
    .max(15, "标签数量最多 15 个")
    .default([])
    .optional(),
  isPinned: z.boolean().default(false).optional(),
  sortOrder: z.number().int().default(0).optional(),
  clicks: z.number().int().nonnegative().default(0).optional()
});

export type BookmarkInput = z.infer<typeof BookmarkSchema>;

// 2. Category Schema
export const CategorySchema = z.object({
  id: z.string().max(100).optional(),
  name: z
    .string()
    .trim()
    .min(1, "分类名称不能为空")
    .max(50, "分类名称不能超过 50 个字符"),
  icon: z
    .string()
    .trim()
    .max(50, "图标标识符不能超过 50 个字符")
    .default("Folder")
    .optional(),
  description: z
    .string()
    .trim()
    .max(200, "分类描述不能超过 200 个字符")
    .default("")
    .optional(),
  sortOrder: z.number().int().default(0).optional(),
  isPrivate: z.boolean().default(false).optional()
});

export type CategoryInput = z.infer<typeof CategorySchema>;

// 3. Login Schema
export const LoginSchema = z.object({
  password: z
    .string()
    .min(1, "管理员密码不能为空")
    .max(128, "密码长度异常")
});

export type LoginInput = z.infer<typeof LoginSchema>;

// 4. Password Change Schema
export const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码"),
  newPassword: z
    .string()
    .min(MIN_ADMIN_PASSWORD_LENGTH, `新密码长度不能少于 ${MIN_ADMIN_PASSWORD_LENGTH} 位`)
    .max(128, "新密码长度过长")
});

// 5. Settings Schema
export const SettingsSchema = z.object({
  siteName: z.string().trim().min(1, "站点名称不能为空").max(100, "站点名称过长").optional(),
  siteSubtitle: z.string().trim().max(200, "站点标语过长").optional(),
  announcement: z.string().trim().max(1000, "公告信息过长").optional(),
  defaultViewMode: z.enum(["grid", "list", "bento", "compact"]).default("grid").optional(),
  allowPublicSubmit: z.boolean().default(false).optional(),
  enableWeather: z.boolean().default(true).optional(),
  enableSearchEngine: z.boolean().default(true).optional(),
  defaultSearchEngine: z.enum(["baidu", "google", "bing", "github"]).default("google").optional(),
  cfAccountId: z.string().trim().max(100).optional(),
  cfD1DatabaseId: z.string().trim().max(100).optional(),
  cfKvNamespaceId: z.string().trim().max(100).optional(),
  geminiApiKey: z.string().trim().max(500).optional(),
  cfApiToken: z.string().trim().max(500).optional()
});

export type SettingsInput = z.infer<typeof SettingsSchema>;

// 6. Metadata Extract Schema (SSRF defense validation)
export const MetadataExtractSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "网址不能为空")
    .max(2000, "网址过长")
    .refine((val) => isSafeUrl(val), {
      message: "网址格式不安全，仅支持合法的公网 HTTP/HTTPS 协议"
    })
});

// 7. Icon Proxy Schema (SSRF defense validation)
export const IconProxySchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1, "域名不能为空")
    .max(253, "域名过长")
    .refine((d) => isSafeDomain(d), {
      message: "域名不安全或指向受保护的本地/私有/内部网络"
    })
});

// 8. Reorder Schema
export const ReorderSchema = z.object({
  orderedIds: z
    .array(z.string().trim().min(1))
    .min(1, "重排序列表不能为空")
    .max(1000, "重排序列表项过多")
});

// 9. Import Schema
export const ImportSchema = z.object({
  format: z.enum(["json", "html"]).default("json"),
  data: z.any().refine((val) => val !== undefined && val !== null, {
    message: "导入数据不能为空"
  }),
  mode: z.enum(["merge", "overwrite"]).default("merge")
});
