import { describe, it, expect } from "vitest";
import { normalizeToE164, isValidE164 } from "./phone";

describe("normalizeToE164", () => {
  it("normalizes US 10-digit number", () => {
    expect(normalizeToE164("5551234567")).toBe("+15551234567");
    expect(normalizeToE164("(555) 123-4567")).toBe("+15551234567");
    expect(normalizeToE164("555-123-4567")).toBe("+15551234567");
  });

  it("normalizes US 11-digit number starting with 1", () => {
    expect(normalizeToE164("15551234567")).toBe("+15551234567");
    expect(normalizeToE164("1 555 123 4567")).toBe("+15551234567");
  });

  it("preserves E.164 format", () => {
    expect(normalizeToE164("+15551234567")).toBe("+15551234567");
  });

  it("handles international numbers", () => {
    expect(normalizeToE164("+442071234567")).toBe("+442071234567");
    expect(normalizeToE164("442071234567")).toBe("+442071234567");
  });

  it("returns null for too short input", () => {
    expect(normalizeToE164("")).toBeNull();
    expect(normalizeToE164("123")).toBeNull();
    expect(normalizeToE164("555123456")).toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(normalizeToE164("abc")).toBeNull();
    expect(normalizeToE164("   ")).toBeNull();
  });
});

describe("isValidE164", () => {
  it("accepts valid E.164 numbers", () => {
    expect(isValidE164("+15551234567")).toBe(true);
    expect(isValidE164("+442071234567")).toBe(true);
    expect(isValidE164("+33123456789")).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(isValidE164("5551234567")).toBe(false);
    expect(isValidE164("15551234567")).toBe(false);
    expect(isValidE164("+05551234567")).toBe(false);
    expect(isValidE164("")).toBe(false);
    expect(isValidE164("+123")).toBe(false);
  });
});
