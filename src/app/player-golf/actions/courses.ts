'use server';

import { createClient } from '@/lib/supabase/server';

export interface Course {
  id: string;
  name: string;
  city: string;
  state: string;
  par: number;
  rating?: number;
  slope?: number;
  holes: HoleData[];
}

export interface HoleData {
  number: number;
  par: number;
  yardage: number;
  handicap?: number;
}

/**
 * Get all available courses
 */
export async function getCourses() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('golf_courses')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching courses:', error);
    return [];
  }

  return data;
}

/**
 * Get a single course by ID
 */
export async function getCourse(courseId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('golf_courses')
    .select('*')
    .eq('id', courseId)
    .single();

  if (error) {
    console.error('Error fetching course:', error);
    throw error;
  }

  return data;
}

/**
 * Search courses by name or location
 */
export async function searchCourses(query: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('golf_courses')
    .select('*')
    .or(`name.ilike.%${query}%,city.ilike.%${query}%,state.ilike.%${query}%`)
    .order('name')
    .limit(20);

  if (error) {
    console.error('Error searching courses:', error);
    return [];
  }

  return data;
}

/**
 * Sample courses data for initial setup
 */
export const SAMPLE_COURSES: Course[] = [
  {
    id: 'pebble-beach',
    name: 'Pebble Beach Golf Links',
    city: 'Pebble Beach',
    state: 'CA',
    par: 72,
    rating: 75.5,
    slope: 145,
    holes: [
      { number: 1, par: 4, yardage: 380 },
      { number: 2, par: 5, yardage: 505 },
      { number: 3, par: 4, yardage: 390 },
      { number: 4, par: 4, yardage: 331 },
      { number: 5, par: 3, yardage: 188 },
      { number: 6, par: 5, yardage: 523 },
      { number: 7, par: 3, yardage: 106 },
      { number: 8, par: 4, yardage: 431 },
      { number: 9, par: 4, yardage: 466 },
      { number: 10, par: 4, yardage: 446 },
      { number: 11, par: 4, yardage: 390 },
      { number: 12, par: 3, yardage: 202 },
      { number: 13, par: 4, yardage: 392 },
      { number: 14, par: 5, yardage: 580 },
      { number: 15, par: 4, yardage: 397 },
      { number: 16, par: 4, yardage: 403 },
      { number: 17, par: 3, yardage: 178 },
      { number: 18, par: 5, yardage: 543 },
    ],
  },
  {
    id: 'augusta-national',
    name: 'Augusta National Golf Club',
    city: 'Augusta',
    state: 'GA',
    par: 72,
    rating: 76.2,
    slope: 148,
    holes: [
      { number: 1, par: 4, yardage: 445 },
      { number: 2, par: 5, yardage: 575 },
      { number: 3, par: 4, yardage: 350 },
      { number: 4, par: 3, yardage: 240 },
      { number: 5, par: 4, yardage: 495 },
      { number: 6, par: 3, yardage: 180 },
      { number: 7, par: 4, yardage: 450 },
      { number: 8, par: 5, yardage: 570 },
      { number: 9, par: 4, yardage: 460 },
      { number: 10, par: 4, yardage: 495 },
      { number: 11, par: 4, yardage: 520 },
      { number: 12, par: 3, yardage: 155 },
      { number: 13, par: 5, yardage: 510 },
      { number: 14, par: 4, yardage: 440 },
      { number: 15, par: 5, yardage: 550 },
      { number: 16, par: 3, yardage: 170 },
      { number: 17, par: 4, yardage: 440 },
      { number: 18, par: 4, yardage: 465 },
    ],
  },
  {
    id: 'st-andrews',
    name: 'St Andrews Old Course',
    city: 'St Andrews',
    state: 'Scotland',
    par: 72,
    rating: 74.9,
    slope: 139,
    holes: [
      { number: 1, par: 4, yardage: 376 },
      { number: 2, par: 4, yardage: 453 },
      { number: 3, par: 4, yardage: 398 },
      { number: 4, par: 4, yardage: 480 },
      { number: 5, par: 5, yardage: 568 },
      { number: 6, par: 4, yardage: 412 },
      { number: 7, par: 4, yardage: 371 },
      { number: 8, par: 3, yardage: 175 },
      { number: 9, par: 4, yardage: 352 },
      { number: 10, par: 4, yardage: 380 },
      { number: 11, par: 3, yardage: 174 },
      { number: 12, par: 4, yardage: 348 },
      { number: 13, par: 4, yardage: 465 },
      { number: 14, par: 5, yardage: 618 },
      { number: 15, par: 4, yardage: 456 },
      { number: 16, par: 4, yardage: 423 },
      { number: 17, par: 4, yardage: 495 },
      { number: 18, par: 4, yardage: 357 },
    ],
  },
  {
    id: 'pinehurst-no2',
    name: 'Pinehurst No. 2',
    city: 'Pinehurst',
    state: 'NC',
    par: 72,
    rating: 75.9,
    slope: 144,
    holes: [
      { number: 1, par: 4, yardage: 411 },
      { number: 2, par: 4, yardage: 446 },
      { number: 3, par: 4, yardage: 340 },
      { number: 4, par: 5, yardage: 529 },
      { number: 5, par: 4, yardage: 482 },
      { number: 6, par: 3, yardage: 222 },
      { number: 7, par: 4, yardage: 407 },
      { number: 8, par: 4, yardage: 485 },
      { number: 9, par: 3, yardage: 179 },
      { number: 10, par: 4, yardage: 611 },
      { number: 11, par: 4, yardage: 453 },
      { number: 12, par: 4, yardage: 441 },
      { number: 13, par: 4, yardage: 382 },
      { number: 14, par: 4, yardage: 448 },
      { number: 15, par: 3, yardage: 206 },
      { number: 16, par: 4, yardage: 509 },
      { number: 17, par: 3, yardage: 190 },
      { number: 18, par: 4, yardage: 446 },
    ],
  },
  {
    id: 'torrey-pines-south',
    name: 'Torrey Pines Golf Course (South)',
    city: 'La Jolla',
    state: 'CA',
    par: 72,
    rating: 75.5,
    slope: 144,
    holes: [
      { number: 1, par: 4, yardage: 452 },
      { number: 2, par: 4, yardage: 387 },
      { number: 3, par: 3, yardage: 198 },
      { number: 4, par: 5, yardage: 609 },
      { number: 5, par: 4, yardage: 454 },
      { number: 6, par: 5, yardage: 570 },
      { number: 7, par: 4, yardage: 464 },
      { number: 8, par: 3, yardage: 177 },
      { number: 9, par: 4, yardage: 472 },
      { number: 10, par: 4, yardage: 409 },
      { number: 11, par: 3, yardage: 221 },
      { number: 12, par: 4, yardage: 504 },
      { number: 13, par: 5, yardage: 612 },
      { number: 14, par: 4, yardage: 438 },
      { number: 15, par: 4, yardage: 477 },
      { number: 16, par: 3, yardage: 227 },
      { number: 17, par: 4, yardage: 436 },
      { number: 18, par: 5, yardage: 570 },
    ],
  },
];
