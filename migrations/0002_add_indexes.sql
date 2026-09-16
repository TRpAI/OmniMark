-- Migration: 0002_add_indexes.sql
-- Description: Creates critical database indexes on foreign keys and sorting columns for high throughput

-- Index for category lookup of bookmarks
CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(categoryId);

-- Index for sorting bookmarks within navigation UI
CREATE INDEX IF NOT EXISTS idx_bookmarks_sort ON bookmarks(sortOrder);

-- Index for pinned bookmarks filter
CREATE INDEX IF NOT EXISTS idx_bookmarks_isPinned ON bookmarks(isPinned);

-- Index for sorting categories
CREATE INDEX IF NOT EXISTS idx_categories_sort ON categories(sortOrder);
