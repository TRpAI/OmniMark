import { CategoryModel } from "./types.ts";
import { CategorySchema } from "./schemas.ts";

export interface CategoryValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: Partial<CategoryModel>;
}

export class CategoryService {
  /**
   * Validates and cleanses category creation/update payload with Zod CategorySchema.
   */
  static validate(data: Partial<CategoryModel>): CategoryValidationResult {
    if (!data || typeof data !== "object") {
      return { valid: false, error: "分类数据格式无效" };
    }

    const parseResult = CategorySchema.safeParse(data);
    if (!parseResult.success) {
      const firstIssue = parseResult.error.issues[0];
      return {
        valid: false,
        error: firstIssue?.message || "分类输入校验失败"
      };
    }

    const val = parseResult.data;
    return {
      valid: true,
      sanitized: {
        name: val.name,
        icon: val.icon,
        sortOrder: typeof val.sortOrder === "number" ? val.sortOrder : 0
      }
    };
  }

  /**
   * Verifies if a category can be safely deleted.
   * If there are bookmarks attached to this category, it should be rejected.
   */
  static canDelete(categoryId: string, bookmarkCountForCategory: number): { safe: boolean; error?: string } {
    if (bookmarkCountForCategory > 0) {
      return {
        safe: false,
        error: `无法删除此分类：该分类下尚有 ${bookmarkCountForCategory} 个书签，请先移动或删除分类下的书签`
      };
    }
    return { safe: true };
  }
}
