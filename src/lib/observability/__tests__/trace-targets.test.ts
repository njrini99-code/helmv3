import { describe, expect, it } from 'vitest';
import {
  LOCALHOST_TRACE_TARGET,
  originPattern,
  originPatternFromUrl,
} from '@/lib/observability/trace-targets';

describe('trace-targets', () => {
  it('originPattern matches the origin and its paths only', () => {
    const re = originPattern('https://project.supabase.co');
    expect(re.test('https://project.supabase.co')).toBe(true);
    expect(re.test('https://project.supabase.co/rest/v1/x')).toBe(true);
    expect(re.test('https://project.supabase.co.evil.com/x')).toBe(false);
    expect(re.test('https://project.supabase.cox/x')).toBe(false);
    expect(re.test('https://evil.com/?u=https://project.supabase.co/')).toBe(false);
  });

  it('originPattern escapes regex metacharacters in the origin', () => {
    const re = originPattern('http://localhost:3000');
    expect(re.test('http://localhost:3000/x')).toBe(true);
    expect(re.test('http://localhostX3000/x')).toBe(false);
  });

  it('originPatternFromUrl uses only the origin and returns null for bad input', () => {
    const re = originPatternFromUrl('https://project.supabase.co/rest/v1?x=1');
    expect(re?.test('https://project.supabase.co/auth/v1/user')).toBe(true);
    expect(originPatternFromUrl(undefined)).toBeNull();
    expect(originPatternFromUrl('not a url')).toBeNull();
  });

  it('LOCALHOST_TRACE_TARGET matches local hosts only', () => {
    expect(LOCALHOST_TRACE_TARGET.test('http://localhost:54321/rest/v1')).toBe(true);
    expect(LOCALHOST_TRACE_TARGET.test('http://127.0.0.1:3000/')).toBe(true);
    expect(LOCALHOST_TRACE_TARGET.test('https://localhost.evil.com/')).toBe(false);
    expect(LOCALHOST_TRACE_TARGET.test('https://evil.com/?h=localhost')).toBe(false);
  });
});
