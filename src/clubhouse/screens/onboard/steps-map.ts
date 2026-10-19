'use client';

import type { ReactNode } from 'react';
import { CDone, CProfile, CProgram } from './CoachSteps';
import { PLAYER_STEPS, type StepProps } from './Steps';
import type { OnboardStep } from './logic';

/** Every question the flow can ask, by step. */
export const STEPS: Record<OnboardStep, (p: StepProps) => ReactNode> = { ...PLAYER_STEPS, cprogram: CProgram, cprofile: CProfile, cdone: CDone };
