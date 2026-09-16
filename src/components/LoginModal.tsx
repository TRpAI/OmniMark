import React, { useState } from "react";
import { X, Shield, Key, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { safeFetchJson } from "../utils/security";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (token: string) => void;
  darkMode: boolean;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  darkMode,
}) => {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [shakeTrigger, setShakeTrigger] = useState(0);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await safeFetchJson<{ success?: boolean; token?: string; error?: string }>(res, { success: false, error: "登录响应异常" });
      if (res.ok && data.success && data.token) {
        onLoginSuccess(data.token);
        setPassword("");
        onClose();
      } else {
        setError(data.error || "密码错误，请重新输入");
        // 触发输入框抖动微动画
        setShakeTrigger((prev) => prev + 1);
      }
    } catch (err: any) {
      setError(err.message || "登录请求异常");
      setShakeTrigger((prev) => prev + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* 背景遮罩渐变微动画 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
          />

          {/* 模态框打开缩放微动画 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{
              type: "spring",
              damping: 26,
              stiffness: 350,
              mass: 0.8,
            }}
            className={`relative z-10 w-full max-w-sm rounded-3xl border p-6 sm:p-8 shadow-2xl space-y-6 ${
              darkMode
                ? "bg-slate-900/95 border-slate-800 text-slate-100 shadow-blue-950/20"
                : "bg-white/95 border-slate-200 text-slate-900 shadow-slate-300/40"
            } backdrop-blur-md`}
          >
            {/* 头部标题与关闭按钮 */}
            <div className="flex items-center justify-between border-b pb-4 border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base tracking-tight">管理员登录</h3>
                  <p className="text-[11px] text-slate-400">请输入安全凭证以进入管理后台</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              {/* 错误提示淡入动画 */}
              <AnimatePresence mode="wait">
                {error && (
                  <motion.div
                    key="error-msg"
                    initial={{ opacity: 0, height: 0, y: -4 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className="p-3 rounded-xl text-xs font-medium bg-rose-500/10 text-rose-500 border border-rose-500/25 flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 带有抖动微动画的输入框组件 */}
              <motion.div
                key={shakeTrigger}
                animate={
                  shakeTrigger > 0
                    ? {
                        x: [0, -10, 10, -7, 7, -4, 4, 0],
                        transition: { duration: 0.45, ease: "easeInOut" },
                      }
                    : {}
                }
              >
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">
                  管理员密码
                </label>
                <div
                  className={`relative flex items-center rounded-xl border px-3.5 py-2.5 transition-all ${
                    error
                      ? "border-rose-500 ring-2 ring-rose-500/20"
                      : "border-slate-200 dark:border-slate-700 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20"
                  } ${
                    darkMode ? "bg-slate-800/80" : "bg-slate-50"
                  }`}
                >
                  <Key
                    className={`w-4 h-4 mr-2.5 transition-colors ${
                      error ? "text-rose-500" : "text-slate-400"
                    }`}
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="请输入管理员密码"
                    className="w-full bg-transparent border-none outline-none text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400"
                    required
                    autoFocus
                  />
                </div>
              </motion.div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? "验证中..." : "确认登录后台"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
