import { z } from 'zod';

export const playerProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(2, 'State is required').max(2, 'Use 2-letter state code'),
  gradYear: z.number().int().min(2024).max(2035, 'Invalid graduation year'),
  primaryPosition: z.string().min(1, 'Primary position is required'),
  secondaryPosition: z.string().optional(),
  bats: z.enum(['R', 'L', 'S']).optional(),
  throws: z.enum(['R', 'L']).optional(),
  height: z.number().int().min(48).max(96).optional(), // in inches
  weight: z.number().int().min(50).max(400).optional(), // in pounds
  highSchoolName: z.string().min(1, 'High school name is required'),
  gpa: z.number().min(0).max(5.0).optional(),
  bio: z.string().max(1000, 'Bio must be less than 1000 characters').optional(),
});

export const coachProfileSchema = z.object({
  fullName: z.string().min(2, 'Full name is required'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  organizationName: z.string().min(1, 'Organization name is required'),
  city: z.string().min(1, 'City is required'),
  state: z.string().min(2, 'State is required').max(2, 'Use 2-letter state code'),
  division: z.string().optional(),
  conference: z.string().optional(),
  bio: z.string().max(1000, 'Bio must be less than 1000 characters').optional(),
});

export const playerMetricsSchema = z.object({
  exitVelocity: z.number().min(0).max(120).optional(),
  pitchVelocity: z.number().min(0).max(110).optional(),
  sixtyYardTime: z.number().min(5).max(12).optional(),
  popTime: z.number().min(1).max(4).optional(),
});

export type PlayerProfileInput = z.infer<typeof playerProfileSchema>;
export type CoachProfileInput = z.infer<typeof coachProfileSchema>;
export type PlayerMetricsInput = z.infer<typeof playerMetricsSchema>;
