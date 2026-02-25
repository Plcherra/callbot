import { describe, it, expect } from "vitest";
import { isPlaceholderUrl } from "./urlUtils";

describe("isPlaceholderUrl", () => {
  it("detects your-app.com placeholder", () => {
    expect(isPlaceholderUrl("https://your-app.com")).toBe(true);
    expect(isPlaceholderUrl("https://your-app.com/api")).toBe(true);
  });

  it("detects your-domain.com placeholder", () => {
    expect(isPlaceholderUrl("https://your-domain.com")).toBe(true);
    expect(isPlaceholderUrl("https://sub.your-domain.com")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(isPlaceholderUrl("https://YOUR-APP.COM")).toBe(true);
  });

  it("returns false for real URLs", () => {
    expect(isPlaceholderUrl("https://echodesk.us")).toBe(false);
    expect(isPlaceholderUrl("https://localhost:3000")).toBe(false);
    expect(isPlaceholderUrl("http://example.com")).toBe(false);
  });
});
