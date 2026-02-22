/**
 * Twilio client for phone number provisioning and voice webhook configuration.
 * Used for self-hosted voice AI integration with Twilio Media Streams.
 */

import twilio from "twilio";

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
  }
  return twilio(accountSid, authToken);
}

export type ProvisionedNumber = {
  sid: string;
  phoneNumber: string;
};

/**
 * Search for available local numbers in the given area code and purchase one.
 * Returns the phone number SID and E.164 number.
 */
export async function provisionNumber(areaCode: string): Promise<ProvisionedNumber> {
  const client = getTwilioClient();
  const available = await client.availablePhoneNumbers("US").local.list({
    areaCode: parseInt(areaCode, 10),
    limit: 1,
  });
  if (available.length === 0) {
    throw new Error(`No available phone numbers in area code ${areaCode}`);
  }
  const phoneNumber = available[0].phoneNumber;
  if (!phoneNumber) {
    throw new Error("Twilio returned no phone number");
  }
  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber,
  });
  return {
    sid: purchased.sid,
    phoneNumber: purchased.phoneNumber ?? phoneNumber,
  };
}

/**
 * Configure the voice webhook URL and optional status callback for a Twilio number.
 * StatusCallback receives call lifecycle events (initiated, completed, etc.).
 */
export async function configureVoiceUrl(
  phoneNumberSid: string,
  webhookUrl: string,
  options?: { statusCallbackUrl?: string }
): Promise<void> {
  const client = getTwilioClient();
  const update: Record<string, string> = {
    voiceUrl: webhookUrl,
    voiceMethod: "POST",
  };
  if (options?.statusCallbackUrl) {
    update.statusCallback = options.statusCallbackUrl;
    update.statusCallbackMethod = "POST";
  }
  await client.incomingPhoneNumbers(phoneNumberSid).update(update);
}

/**
 * Configure the SMS webhook URL for a Twilio number.
 */
export async function configureSmsUrl(
  phoneNumberSid: string,
  smsUrl: string
): Promise<void> {
  const client = getTwilioClient();
  await client.incomingPhoneNumbers(phoneNumberSid).update({
    smsUrl,
    smsMethod: "POST",
  });
}

/**
 * Release (delete) a Twilio phone number.
 */
export async function releaseNumber(phoneNumberSid: string): Promise<void> {
  const client = getTwilioClient();
  await client.incomingPhoneNumbers(phoneNumberSid).remove();
}
