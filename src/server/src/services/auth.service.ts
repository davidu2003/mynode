import bcrypt from 'bcryptjs';
import { db, schema } from '../db/index.js';
import { eq, and, gte, sql } from 'drizzle-orm';
import { config } from '../config/index.js';
import { logLogin, logLogout } from './audit.service.js';

export interface Admin {
  id: number;
  username: string;
  passwordHash: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
}

export interface LoginResult {
  success: boolean;
  admin?: Admin;
  error?: string;
  locked?: boolean;
}

export function isInitialized(): boolean {
  const admin = db.select().from(schema.admin).limit(1).get();
  return !!admin;
}

export async function setupAdmin(username: string, password: string): Promise<{ success: boolean; error?: string }> {
  const existing = db.select().from(schema.admin).limit(1).get();
  if (existing) {
    return { success: false, error: 'Admin already exists' };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  db.insert(schema.admin).values({
    username,
    passwordHash,
    createdAt: new Date(),
  }).run();

  return { success: true };
}

export function checkLoginAttempts(ip: string): { allowed: boolean; remainingTime?: number } {
  const lockoutTime = Date.now() - config.lockoutDuration;
  const recentAttempts = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.loginAttempts)
    .where(
      and(
        eq(schema.loginAttempts.ip, ip),
        eq(schema.loginAttempts.success, false),
        gte(schema.loginAttempts.attemptedAt, new Date(lockoutTime))
      )
    )
    .get();

  if (recentAttempts && recentAttempts.count >= config.maxLoginAttempts) {
    return { allowed: false, remainingTime: config.lockoutDuration };
  }

  return { allowed: true };
}

export async function validateCredentials(username: string, password: string): Promise<Admin | null> {
  const admin = db
    .select()
    .from(schema.admin)
    .where(eq(schema.admin.username, username))
    .get();

  if (!admin) {
    return null;
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  return valid ? admin : null;
}

export function recordLoginAttempt(ip: string, success: boolean): void {
  db.insert(schema.loginAttempts).values({
    ip,
    attemptedAt: new Date(),
    success,
  }).run();
}

export function updateLastLogin(adminId: number, ip: string): void {
  db.update(schema.admin)
    .set({
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    })
    .where(eq(schema.admin.id, adminId))
    .run();
}

export async function login(username: string, password: string, ip: string): Promise<LoginResult> {
  // Check if locked out
  const lockCheck = checkLoginAttempts(ip);
  if (!lockCheck.allowed) {
    return { success: false, error: 'Too many login attempts. Please try again later.', locked: true };
  }

  // Validate credentials
  const admin = await validateCredentials(username, password);

  // Record attempt
  recordLoginAttempt(ip, !!admin);

  if (!admin) {
    return { success: false, error: 'Invalid credentials' };
  }

  // Update last login
  updateLastLogin(admin.id, ip);

  // Log audit
  logLogin(ip);

  return { success: true, admin };
}

export function logout(ip: string): void {
  logLogout(ip);
}

export async function changePassword(
  adminId: number,
  oldPassword: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const admin = db
    .select()
    .from(schema.admin)
    .where(eq(schema.admin.id, adminId))
    .get();

  if (!admin) {
    return { success: false, error: 'Admin not found' };
  }

  const valid = await bcrypt.compare(oldPassword, admin.passwordHash);
  if (!valid) {
    return { success: false, error: 'Invalid old password' };
  }

  const newHash = await bcrypt.hash(newPassword, 12);
  db.update(schema.admin)
    .set({ passwordHash: newHash })
    .where(eq(schema.admin.id, adminId))
    .run();

  return { success: true };
}

export function getAdminById(id: number): Admin | null {
  const admin = db
    .select()
    .from(schema.admin)
    .where(eq(schema.admin.id, id))
    .get();
  return admin || null;
}
