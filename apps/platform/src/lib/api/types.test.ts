import { describe, expect, it } from "vitest";
import { createAgentSchema, invokeAgentSchema } from "./types";

describe("createAgentSchema", () => {
  describe("valid inputs", () => {
    it("accepts valid name and slug", () => {
      const result = createAgentSchema.safeParse({
        name: "My Agent",
        slug: "my-agent",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("My Agent");
        expect(result.data.slug).toBe("my-agent");
      }
    });

    it("accepts single character slug", () => {
      const result = createAgentSchema.safeParse({
        name: "A",
        slug: "a",
      });

      expect(result.success).toBe(true);
    });

    it("accepts slug with numbers", () => {
      const result = createAgentSchema.safeParse({
        name: "Agent v2",
        slug: "agent-v2",
      });

      expect(result.success).toBe(true);
    });

    it("accepts slug starting with number", () => {
      const result = createAgentSchema.safeParse({
        name: "123 Agent",
        slug: "123-agent",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("name validation", () => {
    it("rejects empty name", () => {
      const result = createAgentSchema.safeParse({
        name: "",
        slug: "valid-slug",
      });

      expect(result.success).toBe(false);
    });

    it("rejects name over 255 characters", () => {
      const result = createAgentSchema.safeParse({
        name: "a".repeat(256),
        slug: "valid-slug",
      });

      expect(result.success).toBe(false);
    });

    it("accepts name at 255 characters", () => {
      const result = createAgentSchema.safeParse({
        name: "a".repeat(255),
        slug: "valid-slug",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("slug validation", () => {
    it("rejects empty slug", () => {
      const result = createAgentSchema.safeParse({
        name: "Valid Name",
        slug: "",
      });

      expect(result.success).toBe(false);
    });

    it("rejects slug starting with hyphen", () => {
      const result = createAgentSchema.safeParse({
        name: "Valid Name",
        slug: "-invalid",
      });

      expect(result.success).toBe(false);
    });

    it("rejects slug ending with hyphen", () => {
      const result = createAgentSchema.safeParse({
        name: "Valid Name",
        slug: "invalid-",
      });

      expect(result.success).toBe(false);
    });

    it("rejects uppercase letters", () => {
      const result = createAgentSchema.safeParse({
        name: "Valid Name",
        slug: "Invalid",
      });

      expect(result.success).toBe(false);
    });

    it("rejects special characters", () => {
      const result = createAgentSchema.safeParse({
        name: "Valid Name",
        slug: "invalid_slug",
      });

      expect(result.success).toBe(false);
    });

    it("rejects spaces", () => {
      const result = createAgentSchema.safeParse({
        name: "Valid Name",
        slug: "invalid slug",
      });

      expect(result.success).toBe(false);
    });

    it("rejects slug over 255 characters", () => {
      const result = createAgentSchema.safeParse({
        name: "Valid Name",
        slug: "a".repeat(256),
      });

      expect(result.success).toBe(false);
    });
  });
});

describe("invokeAgentSchema", () => {
  it("accepts valid input object", () => {
    const result = invokeAgentSchema.safeParse({
      input: { query: "hello", count: 5 },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.input).toEqual({ query: "hello", count: 5 });
    }
  });

  it("accepts empty input object", () => {
    const result = invokeAgentSchema.safeParse({
      input: {},
    });

    expect(result.success).toBe(true);
  });

  it("accepts nested objects", () => {
    const result = invokeAgentSchema.safeParse({
      input: {
        user: { name: "Alice", id: 123 },
        options: ["a", "b", "c"],
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.input.user).toEqual({ name: "Alice", id: 123 });
    }
  });

  it("accepts various value types", () => {
    const result = invokeAgentSchema.safeParse({
      input: {
        string: "hello",
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
      },
    });

    expect(result.success).toBe(true);
  });
});
