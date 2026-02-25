import { describe, it, expect } from "vitest";
import { hasCallableNumber, usesTwilio } from "./types";

describe("hasCallableNumber", () => {
  it("returns true when inbound_phone_number is set", () => {
    expect(hasCallableNumber({ inbound_phone_number: "+15551234567" })).toBe(true);
    expect(hasCallableNumber({ inbound_phone_number: "   +15551234567  " })).toBe(true);
  });

  it("returns false when inbound_phone_number is empty or null", () => {
    expect(hasCallableNumber({ inbound_phone_number: null })).toBe(false);
    expect(hasCallableNumber({ inbound_phone_number: undefined })).toBe(false);
    expect(hasCallableNumber({ inbound_phone_number: "" })).toBe(false);
    expect(hasCallableNumber({ inbound_phone_number: "   " })).toBe(false);
  });
});

describe("usesTwilio", () => {
  it("returns true when twilio_phone_number_sid is set", () => {
    expect(usesTwilio({ twilio_phone_number_sid: "PN123" })).toBe(true);
  });

  it("returns false when twilio_phone_number_sid is empty or null", () => {
    expect(usesTwilio({ twilio_phone_number_sid: null })).toBe(false);
    expect(usesTwilio({ twilio_phone_number_sid: undefined })).toBe(false);
    expect(usesTwilio({ twilio_phone_number_sid: "" })).toBe(false);
  });
});
