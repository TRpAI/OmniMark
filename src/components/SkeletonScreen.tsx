import React from "react";
import { ViewMode } from "../types";

interface SkeletonScreenProps {
  darkMode: boolean;
  viewMode?: ViewMode;
}

export const SkeletonScreen: React.FC<SkeletonScreenProps> = ({
  darkMode,
  viewMode = "grid",
}) => {
  const shimmerBlock = darkMode
    ? "bg-slate-800/70 animate-pulse"
    : "bg-slate-200/80 animate-pulse";
  const shimmerCard = darkMode
    ? "bg-slate-800/40 border-slate-700/80"
    : "bg-white border-slate-200/80 shadow-xs";

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 space-y-6 sm:space-y-8 w-full overflow-hidden">
      
      {/* 1. Hero Welcome & Info Banner Skeleton */}
      <div className={`p-5 sm:p-8 rounded-3xl border transition-all relative overflow-hidden ${
        darkMode ? "bg-slate-800/30 border-slate-700/60" : "bg-slate-50/80 border-slate-200/70"
      }`}>
        {/* Top right time placeholder on desktop */}
        <div className="absolute right-6 top-6 hidden md:flex items-center gap-2">
          <div className={`w-28 h-8 rounded-2xl ${shimmerBlock}`} />
        </div>

        <div className="max-w-3xl space-y-3">
          {/* Badge */}
          <div className={`w-32 h-5 rounded-full ${shimmerBlock}`} />
          {/* Main heading */}
          <div className={`w-3/4 sm:w-2/3 h-8 sm:h-10 rounded-xl ${shimmerBlock}`} />
          {/* Subtitle */}
          <div className="space-y-1.5 pt-1">
            <div className={`w-full max-w-lg h-4 rounded-lg ${shimmerBlock}`} />
            <div className={`w-4/5 max-w-md h-4 rounded-lg ${shimmerBlock}`} />
          </div>
        </div>
      </div>

      {/* 2. Pinned Bookmarks Skeleton */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-4 h-4 rounded-full ${shimmerBlock}`} />
            <div className={`w-20 h-4 rounded-lg ${shimmerBlock}`} />
          </div>
          <div className={`w-16 h-3 rounded-md ${shimmerBlock}`} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 sm:gap-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className={`p-3 sm:p-3.5 rounded-2xl border flex flex-col gap-2.5 ${shimmerCard}`}
            >
              <div className="flex items-center justify-between">
                <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-xl ${shimmerBlock}`} />
                <div className={`w-3.5 h-3.5 rounded ${shimmerBlock}`} />
              </div>
              <div className="space-y-1.5 min-w-0">
                <div className={`w-3/4 h-3.5 rounded-md ${shimmerBlock}`} />
                <div className={`w-1/2 h-2.5 rounded-md ${shimmerBlock}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Category Tabs & View Switcher Bar Skeleton */}
      <div className="space-y-3 border-b pb-4 border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2 w-full">
          {/* Category pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 flex-1">
            <div className={`w-24 h-8 sm:h-9 rounded-xl ${shimmerBlock}`} />
            <div className={`w-20 h-8 sm:h-9 rounded-xl ${shimmerBlock}`} />
            <div className={`w-20 h-8 sm:h-9 rounded-xl ${shimmerBlock}`} />
            <div className={`w-22 h-8 sm:h-9 rounded-xl ${shimmerBlock}`} />
            <div className={`w-20 h-8 sm:h-9 rounded-xl ${shimmerBlock}`} />
          </div>
          {/* View switcher buttons placeholder */}
          <div className={`w-32 h-8 sm:h-9 rounded-xl shrink-0 ${shimmerBlock}`} />
        </div>

        {/* Tags bar placeholder */}
        <div className="flex items-center gap-2 pt-1">
          <div className={`w-12 h-4 rounded-md ${shimmerBlock}`} />
          <div className={`w-14 h-5 rounded-md ${shimmerBlock}`} />
          <div className={`w-16 h-5 rounded-md ${shimmerBlock}`} />
          <div className={`w-12 h-5 rounded-md ${shimmerBlock}`} />
          <div className={`w-18 h-5 rounded-md ${shimmerBlock}`} />
        </div>
      </div>

      {/* 4. Category Section & Bookmarks Layout Skeleton */}
      <div className="space-y-8">
        {[...Array(2)].map((_, sectionIdx) => (
          <div key={sectionIdx} className="space-y-3 sm:space-y-4">
            {/* Section Header */}
            <div className="flex items-center justify-between border-b pb-2 border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-xl ${shimmerBlock}`} />
                <div className="space-y-1">
                  <div className={`w-24 h-4 rounded-md ${shimmerBlock}`} />
                  <div className={`w-40 h-2.5 rounded-md ${shimmerBlock}`} />
                </div>
              </div>
              <div className={`w-16 h-5 rounded-full ${shimmerBlock}`} />
            </div>

            {/* Cards based on viewMode */}
            {viewMode === "list" ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, idx) => (
                  <div
                    key={idx}
                    className={`p-3 sm:p-4 rounded-2xl border flex items-center justify-between gap-3 ${shimmerCard}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-xl shrink-0 ${shimmerBlock}`} />
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className={`w-1/3 h-4 rounded-md ${shimmerBlock}`} />
                        <div className={`w-2/3 h-3 rounded-md ${shimmerBlock}`} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className={`w-14 h-4 rounded-md hidden sm:block ${shimmerBlock}`} />
                      <div className={`w-10 h-3 rounded-md ${shimmerBlock}`} />
                      <div className={`w-6 h-6 rounded-lg ${shimmerBlock}`} />
                    </div>
                  </div>
                ))}
              </div>
            ) : viewMode === "compact" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {[...Array(12)].map((_, idx) => (
                  <div
                    key={idx}
                    className={`p-2 sm:p-2.5 rounded-xl border flex items-center gap-2 ${shimmerCard}`}
                  >
                    <div className={`w-4 h-4 rounded shrink-0 ${shimmerBlock}`} />
                    <div className={`w-3/4 h-3 rounded-md ${shimmerBlock}`} />
                  </div>
                ))}
              </div>
            ) : viewMode === "bento" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
                <div className={`sm:col-span-2 p-4 sm:p-5 rounded-3xl border flex flex-col justify-between gap-4 min-h-[140px] ${shimmerCard}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-2xl ${shimmerBlock}`} />
                      <div className="space-y-1.5">
                        <div className={`w-32 h-4 rounded-md ${shimmerBlock}`} />
                        <div className={`w-20 h-3 rounded-md ${shimmerBlock}`} />
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded ${shimmerBlock}`} />
                  </div>
                  <div className={`w-4/5 h-3 rounded-md ${shimmerBlock}`} />
                  <div className="flex items-center justify-between pt-2">
                    <div className={`w-24 h-4 rounded-md ${shimmerBlock}`} />
                    <div className={`w-12 h-3 rounded-md ${shimmerBlock}`} />
                  </div>
                </div>
                {[...Array(2)].map((_, idx) => (
                  <div
                    key={idx}
                    className={`p-4 sm:p-5 rounded-3xl border flex flex-col justify-between gap-4 min-h-[140px] ${shimmerCard}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-2xl ${shimmerBlock}`} />
                        <div className="space-y-1.5">
                          <div className={`w-28 h-4 rounded-md ${shimmerBlock}`} />
                          <div className={`w-16 h-3 rounded-md ${shimmerBlock}`} />
                        </div>
                      </div>
                      <div className={`w-4 h-4 rounded ${shimmerBlock}`} />
                    </div>
                    <div className={`w-3/4 h-3 rounded-md ${shimmerBlock}`} />
                    <div className="flex items-center justify-between pt-2">
                      <div className={`w-20 h-4 rounded-md ${shimmerBlock}`} />
                      <div className={`w-12 h-3 rounded-md ${shimmerBlock}`} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Default Grid Mode */
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                {[...Array(4)].map((_, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 min-h-[130px] ${shimmerCard}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl shrink-0 ${shimmerBlock}`} />
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className={`w-24 h-4 rounded-md ${shimmerBlock}`} />
                          <div className={`w-16 h-3 rounded-md ${shimmerBlock}`} />
                        </div>
                      </div>
                      <div className={`w-3.5 h-3.5 rounded shrink-0 ${shimmerBlock}`} />
                    </div>

                    <div className="space-y-1 py-1">
                      <div className={`w-full h-3 rounded-md ${shimmerBlock}`} />
                      <div className={`w-3/5 h-3 rounded-md ${shimmerBlock}`} />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60">
                      <div className={`w-20 h-3.5 rounded-md ${shimmerBlock}`} />
                      <div className={`w-10 h-3 rounded-md ${shimmerBlock}`} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
