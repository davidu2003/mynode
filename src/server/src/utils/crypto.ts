import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { config } from '../config/index.js';

const ALGORITHM = 'aes-256-gcm';

// 从密钥字符串派生32字节密钥
function getKey(): Buffer {
  return scryptSync(config.encryptionKey, 'mynode-salt', 32);
}

/**
 * 加密敏感数据（如SSH密码、密钥）
 */
export function encrypt(text: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/**
 * 解密敏感数据
 */
export function decrypt(encrypted: string): string {
  const key = getKey();
  const [ivHex, authTagHex, content] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(content, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * 生成随机Token
 */
export function generateToken(length: number = 64): string {
  return randomBytes(length / 2).toString('hex');
}
