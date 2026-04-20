/**
 * Zod schemas for API bodies not (yet) described in openapi.yaml — kept out of
 * generated/api.ts so orval runs do not drop server-only validation.
 */
import * as zod from "zod";

export const BusinessRegisterBody = zod.object({
  name: zod.string(),
  slug: zod.string(),
  username: zod.string().optional(),
  ownerName: zod.string(),
  phone: zod.string(),
  // Email is optional — phone-based SMS-OTP registration is the
  // primary flow and owners can attach a real email later from
  // Settings → Profile. Backend synthesises a unique placeholder
  // from the slug when none is provided (see auth.ts:309).
  email: zod.string().optional(),
  password: zod.string().min(1),
  // 'pro-plus' is the עסקי tier; the signup form can choose it too.
  subscriptionPlan: zod.enum(["free", "pro", "pro-plus"]),
  businessCategories: zod.array(zod.string()).optional(),
  address: zod.string().optional(),
  websiteUrl: zod.string().optional(),
  instagramHandle: zod.string().optional(),
});

export const ChangePasswordBody = zod.object({
  currentPassword: zod.string(),
  newPassword: zod.string().min(1),
});

export const CreateTimeOffBody = zod.object({
  date: zod.string(),
  startTime: zod.string().nullish(),
  endTime: zod.string().nullish(),
  fullDay: zod.boolean().optional(),
  note: zod.string().optional(),
});
