import { createHash, randomBytes, randomInt } from "node:crypto";

/**
 * Generate a human-readable user code like "ABCD-1234"
 */
export function generateUserCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // No I, O (avoid confusion with 1, 0)
  const nums = "0123456789";

  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[randomInt(chars.length)];
  }
  code += "-";
  for (let i = 0; i < 4; i++) {
    code += nums[randomInt(nums.length)];
  }
  return code;
}

/**
 * Generate a secure API key with ok_ prefix
 */
export function generateApiKey(): string {
  const bytes = randomBytes(24);
  const key = bytes.toString("base64url"); // URL-safe base64, 32 chars
  return `ok_${key}`;
}

/**
 * Hash an API key for storage (SHA-256)
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
