import { z } from 'zod';
import { CARE_ROLES, LANGUAGE_LEVELS, SHIFT_PREFS } from '../enums';

const optionalText = (max: number) => z.string().trim().max(max).optional();

/** Public-facing seeker fields. Contact details are in seekerPrivateSchema, never here. */
export const seekerProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  headline: optionalText(150),
  summary: optionalText(3000),
  careRole: z.enum(CARE_ROLES).optional(),
  city: optionalText(100),
  state: optionalText(50),
  availableFrom: z.iso.date().optional(),
  shiftPreferences: z
    .array(z.enum(SHIFT_PREFS))
    .refine((shifts) => new Set(shifts).size === shifts.length, 'Choose each shift once')
    .default([]),
  /** Opt-in to the employer directory. Default off. */
  isVisible: z.boolean().default(false),
});

/** Contact details: owner and employers holding an application only. */
export const seekerPrivateSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^[0-9()+\-.\s]{7,20}$/, 'Enter a valid phone number')
    .optional(),
  zip: z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, 'Enter a valid ZIP code')
    .optional(),
});

export const seekerExperienceSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    employer: z.string().trim().min(1).max(120),
    city: optionalText(100),
    state: optionalText(50),
    startDate: z.iso.date(),
    endDate: z.iso.date().optional(),
    description: optionalText(2000),
  })
  .refine((e) => e.endDate === undefined || e.endDate >= e.startDate, {
    message: 'End date must be on or after the start date',
    path: ['endDate'],
  });

export const seekerCertificationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  issuer: optionalText(120),
  issuedOn: z.iso.date().optional(),
  expiresOn: z.iso.date().optional(),
});

export const seekerLanguageSchema = z.object({
  language: z.string().trim().min(1).max(60),
  level: z.enum(LANGUAGE_LEVELS).default('conversational'),
});

export const employerProfileSchema = z.object({
  companyName: z.string().trim().min(1).max(120),
  description: optionalText(5000),
  website: z.url({ protocol: /^https?$/ }).optional(),
  industry: optionalText(100),
  companySize: optionalText(50),
  city: optionalText(100),
  state: optionalText(50),
});

export type SeekerProfileInput = z.infer<typeof seekerProfileSchema>;
export type SeekerPrivateInput = z.infer<typeof seekerPrivateSchema>;
export type EmployerProfileInput = z.infer<typeof employerProfileSchema>;
