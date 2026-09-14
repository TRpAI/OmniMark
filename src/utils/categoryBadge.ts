export interface CategoryBadgePalette {
  badge: string;
  dot: string;
  hover: string;
  border: string;
  text: string;
  bg: string;
}

const PALETTES: CategoryBadgePalette[] = [
  // 1. Blue
  {
    badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 dark:border-blue-400/30",
    dot: "bg-blue-500",
    hover: "hover:bg-blue-500/20 hover:border-blue-500/40",
    border: "border-blue-500/30",
    text: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/10 dark:bg-blue-500/20",
  },
  // 2. Emerald / Green
  {
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 dark:border-emerald-400/30",
    dot: "bg-emerald-500",
    hover: "hover:bg-emerald-500/20 hover:border-emerald-500/40",
    border: "border-emerald-500/30",
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
  },
  // 3. Violet / Purple
  {
    badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20 dark:border-violet-400/30",
    dot: "bg-violet-500",
    hover: "hover:bg-violet-500/20 hover:border-violet-500/40",
    border: "border-violet-500/30",
    text: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/10 dark:bg-violet-500/20",
  },
  // 4. Amber / Warm Orange
  {
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 dark:border-amber-400/30",
    dot: "bg-amber-500",
    hover: "hover:bg-amber-500/20 hover:border-amber-500/40",
    border: "border-amber-500/30",
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10 dark:bg-amber-500/20",
  },
  // 5. Rose / Pink
  {
    badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 dark:border-rose-400/30",
    dot: "bg-rose-500",
    hover: "hover:bg-rose-500/20 hover:border-rose-500/40",
    border: "border-rose-500/30",
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10 dark:bg-rose-500/20",
  },
  // 6. Teal / Cyan
  {
    badge: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20 dark:border-teal-400/30",
    dot: "bg-teal-500",
    hover: "hover:bg-teal-500/20 hover:border-teal-500/40",
    border: "border-teal-500/30",
    text: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-500/10 dark:bg-teal-500/20",
  },
  // 7. Indigo / Deep Blue
  {
    badge: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20 dark:border-indigo-400/30",
    dot: "bg-indigo-500",
    hover: "hover:bg-indigo-500/20 hover:border-indigo-500/40",
    border: "border-indigo-500/30",
    text: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-500/10 dark:bg-indigo-500/20",
  },
  // 8. Cyan / Sky
  {
    badge: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20 dark:border-cyan-400/30",
    dot: "bg-cyan-500",
    hover: "hover:bg-cyan-500/20 hover:border-cyan-500/40",
    border: "border-cyan-500/30",
    text: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-500/10 dark:bg-cyan-500/20",
  },
  // 9. Fuchsia / Magenta
  {
    badge: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20 dark:border-fuchsia-400/30",
    dot: "bg-fuchsia-500",
    hover: "hover:bg-fuchsia-500/20 hover:border-fuchsia-500/40",
    border: "border-fuchsia-500/30",
    text: "text-fuchsia-600 dark:text-fuchsia-400",
    bg: "bg-fuchsia-500/10 dark:bg-fuchsia-500/20",
  },
  // 10. Orange / Tangerine
  {
    badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20 dark:border-orange-400/30",
    dot: "bg-orange-500",
    hover: "hover:bg-orange-500/20 hover:border-orange-500/40",
    border: "border-orange-500/30",
    text: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500/10 dark:bg-orange-500/20",
  },
];

/**
 * Automatically generates a harmonious, distinct color badge palette from a category name.
 * Uses semantic matching for common domain categories, with a robust string hash fallback.
 */
export function getCategoryBadgeStyle(categoryName: string): CategoryBadgePalette {
  if (!categoryName) return PALETTES[0];

  const lower = categoryName.toLowerCase().trim();

  // Semantic mappings for intuitive coloring
  if (lower.includes("ai") || lower.includes("智能") || lower.includes("gpt") || lower.includes("模型")) {
    return PALETTES[2]; // Violet
  }
  if (lower.includes("开发") || lower.includes("代码") || lower.includes("技术") || lower.includes("dev") || lower.includes("code")) {
    return PALETTES[0]; // Blue
  }
  if (lower.includes("设计") || lower.includes("灵感") || lower.includes("ui") || lower.includes("ux") || lower.includes("art")) {
    return PALETTES[4]; // Rose
  }
  if (lower.includes("效率") || lower.includes("工具") || lower.includes("办公") || lower.includes("tool")) {
    return PALETTES[3]; // Amber
  }
  if (lower.includes("资源") || lower.includes("学习") || lower.includes("教程") || lower.includes("learn") || lower.includes("book")) {
    return PALETTES[1]; // Emerald
  }
  if (lower.includes("影音") || lower.includes("娱乐") || lower.includes("视频") || lower.includes("music") || lower.includes("media")) {
    return PALETTES[8]; // Fuchsia
  }
  if (lower.includes("社交") || lower.includes("社区") || lower.includes("论坛") || lower.includes("chat")) {
    return PALETTES[6]; // Indigo
  }
  if (lower.includes("生活") || lower.includes("健康") || lower.includes("运动")) {
    return PALETTES[5]; // Teal
  }

  // Consistent deterministic hashing for custom category names
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = (hash << 5) - hash + categoryName.charCodeAt(i);
    hash |= 0;
  }

  const index = Math.abs(hash) % PALETTES.length;
  return PALETTES[index];
}
