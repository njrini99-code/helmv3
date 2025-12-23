import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIdentifier, RateLimitConfig } from '@/lib/rate-limit';

/**
 * Rate limit middleware for API routes
 * @param request - Next.js request object
 * @param config - Rate limit configuration
 * @param identifier - Optional custom identifier (defaults to client IP)
 * @returns NextResponse if rate limit exceeded, null otherwise
 */
export function withRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  identifier?: string
): NextResponse | null {
  const clientId = identifier || getClientIdentifier(request.headers);
  const result = checkRateLimit(clientId, config);

  if (!result.success) {
    const resetDate = new Date(result.resetAt);
    return NextResponse.json(
      {
        error: 'Too many requests',
        message: 'Please try again later',
        resetAt: resetDate.toISOString(),
      },
      {
        status: 429,
        headers: {
          'Retry-After': Math.ceil((result.resetAt - Date.now()) / 1000).toString(),
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': result.resetAt.toString(),
        },
      }
    );
  }

  return null;
}

/**
 * Add rate limit headers to a successful response
 */
export function addRateLimitHeaders(
  response: NextResponse,
  remaining: number,
  resetAt: number,
  maxRequests: number
): NextResponse {
  response.headers.set('X-RateLimit-Limit', maxRequests.toString());
  response.headers.set('X-RateLimit-Remaining', remaining.toString());
  response.headers.set('X-RateLimit-Reset', resetAt.toString());
  return response;
}
