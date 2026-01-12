import { describe, expect, it } from "vitest";
import { generateApiKey, generateUserCode, hashApiKey } from "./device";

describe("generateUserCode", () => {
  it("returns format XXXX-0000", () => {
    const code = generateUserCode();
    expect(code).toMatch(/^[A-Z]{4}-[0-9]{4}$/);
  });

  it("does not contain ambiguous characters I or O", () => {
    // Generate multiple codes to increase confidence
    for (let i = 0; i < 100; i++) {
      const code = generateUserCode();
      expect(code).not.toContain("I");
      expect(code).not.toContain("O");
    }
  });

  it("generates different codes on subsequent calls", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateUserCode());
    }
    // Should have many unique codes (allowing some collisions)
    expect(codes.size).toBeGreaterThan(40);
  });
});

describe("generateApiKey", () => {
  it("returns key with ok_ prefix", () => {
    const key = generateApiKey();
    expect(key.startsWith("ok_")).toBe(true);
  });

  it("returns key of correct length", () => {
    const key = generateApiKey();
    // ok_ (3) + 32 chars base64url = 35 total
    expect(key.length).toBe(35);
  });

  it("uses URL-safe base64 characters", () => {
    const key = generateApiKey();
    const suffix = key.substring(3); // Remove ok_ prefix
    // URL-safe base64 uses A-Z, a-z, 0-9, -, _
    expect(suffix).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates different keys on subsequent calls", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 50; i++) {
      keys.add(generateApiKey());
    }
    // All keys should be unique
    expect(keys.size).toBe(50);
  });
});

describe("hashApiKey", () => {
  it("returns deterministic hash for same input", () => {
    const key = "ok_test-key-12345";
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);
    expect(hash1).toBe(hash2);
  });

  it("returns different hashes for different inputs", () => {
    const hash1 = hashApiKey("ok_key-one");
    const hash2 = hashApiKey("ok_key-two");
    expect(hash1).not.toBe(hash2);
  });

  it("returns hex string of correct length", () => {
    const hash = hashApiKey("ok_test-key");
    // scrypt with 32 bytes output = 64 hex chars
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });
});
