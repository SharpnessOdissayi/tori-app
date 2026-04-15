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
  email: zod.string(),
  password: zod.string().min(1),
  subscriptionPlan: zod.enum(["free", "pro"]),
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
