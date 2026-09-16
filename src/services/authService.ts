import {
  hashPasswordPBKDF2,
  verifyPasswordPBKDF2,
  generateSecureToken,
  hashSessionToken,
  validatePasswordStrength,
  isSessionValid,
  createSessionCookie,
  createClearSessionCookie,
  extractSessionToken,
  SESSION_MAX_AGE_SECONDS
} from "../utils/security.ts";

export interface SessionStore {
  saveSession(tokenHash: string, expiresAt: number): Promise<void> | void;
  findSession(tokenHash: string): Promise<{ expiresAt: number } | null> | { expiresAt: number } | null;
  deleteSession(tokenHash: string): Promise<void> | void;
  clearAllSessions(): Promise<void> | void;
}

export interface AuthServiceConfig {
  sessionStore: SessionStore;
  getPasswordHash: () => Promise<string | null> | string | null;
  setPasswordHash: (newHash: string) => Promise<void> | void;
}

export class AuthService {
  private config: AuthServiceConfig;

  constructor(config: AuthServiceConfig) {
    this.config = config;
  }

  /**
   * Verifies admin password credentials and triggers seamless PBKDF2 upgrades when needed.
   */
  async login(password: string): Promise<{
    success: boolean;
    needsUpgrade: boolean;
    token?: string;
    expiresAt?: number;
    error?: string;
  }> {
    if (!password) {
      return { success: false, needsUpgrade: false, error: "密码不能为空" };
    }

    const currentHash = await this.config.getPasswordHash();
    if (!currentHash) {
      return { success: false, needsUpgrade: false, error: "管理员密码未初始化" };
    }

    const verification = await verifyPasswordPBKDF2(password, currentHash);
    if (!verification.valid) {
      return { success: false, needsUpgrade: false, error: "管理员密码错误" };
    }

    // Seamlessly upgrade legacy hash (<600,000 iterations or SHA-256)
    if (verification.needsUpgrade) {
      const upgradedHash = await hashPasswordPBKDF2(password);
      await this.config.setPasswordHash(upgradedHash);
    }

    // Create session: generate raw token, store SHA-256(token) in database
    const rawToken = generateSecureToken();
    const tokenHash = await hashSessionToken(rawToken);
    const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;

    await this.config.sessionStore.saveSession(tokenHash, expiresAt);

    return {
      success: true,
      needsUpgrade: verification.needsUpgrade,
      token: rawToken,
      expiresAt
    };
  }

  /**
   * Validates authentication from incoming request headers (HttpOnly Cookie or Bearer Token).
   */
  async authenticateRequest(headers: { get(name: string): string | null } | Record<string, any>): Promise<{
    authenticated: boolean;
    tokenHash?: string;
  }> {
    const rawToken = extractSessionToken(headers);
    if (!rawToken) {
      return { authenticated: false };
    }

    const tokenHash = await hashSessionToken(rawToken);
    const session = await this.config.sessionStore.findSession(tokenHash);

    if (!session || !isSessionValid(session)) {
      if (session) {
        await this.config.sessionStore.deleteSession(tokenHash);
      }
      return { authenticated: false };
    }

    return { authenticated: true, tokenHash };
  }

  /**
   * Changes admin password after enforcing strength policies (>= 12 characters).
   * Revokes all active sessions upon password update to prevent hijacked tokens from lingering.
   */
  async changePassword(newPassword: string): Promise<{ success: boolean; error?: string }> {
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return { success: false, error: strength.error };
    }

    const newHash = await hashPasswordPBKDF2(newPassword);
    await this.config.setPasswordHash(newHash);

    // Revoke all existing sessions across the cluster
    await this.config.sessionStore.clearAllSessions();

    return { success: true };
  }

  /**
   * Logs out the current admin session.
   */
  async logout(headers: { get(name: string): string | null } | Record<string, any>): Promise<void> {
    const rawToken = extractSessionToken(headers);
    if (rawToken) {
      const tokenHash = await hashSessionToken(rawToken);
      await this.config.sessionStore.deleteSession(tokenHash);
    }
  }

  /**
   * Helper to create Set-Cookie headers for session management.
   */
  createSessionCookieHeader(token: string, isHttps = false): string {
    return createSessionCookie(token, { secure: isHttps });
  }

  createClearSessionCookieHeader(isHttps = false): string {
    return createClearSessionCookie({ secure: isHttps });
  }
}
