/**
 * The haptic layer now lives in `@/lib/native-haptics`, outside the Fairway
 * folder, so code that is not Fairway (the shared `@/lib/haptics`, push
 * registration, the lifting and golf surfaces) does not depend on a design-system
 * path that goes away when Fairway does. This file keeps the old import path
 * working: every existing `@/lib/fairway/haptics` importer (and test mock of that
 * path) is unchanged and gets the same functions, the same throttle state and
 * the same types.
 */
export * from '@/lib/native-haptics';
