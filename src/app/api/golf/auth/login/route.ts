import { NextResponse, type NextRequest } from 'next/server';
import { loginAction, type LoginResult } from '@/app/golf/actions/auth';

type LoginBody = {
  email?: unknown;
  password?: unknown;
  ref?: unknown;
};

export async function POST(request: NextRequest) {
  let body: LoginBody;

  try {
    body = (await request.json()) as LoginBody;
  } catch {
    return NextResponse.json<LoginResult>(
      { success: false, error: 'Invalid login request.' },
      { status: 400 },
    );
  }

  const email = typeof body.email === 'string' ? body.email : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const ref = typeof body.ref === 'string' ? body.ref : undefined;

  if (!email || !password) {
    return NextResponse.json<LoginResult>(
      { success: false, error: 'Email and password are required.' },
      { status: 400 },
    );
  }

  const result = await loginAction(email, password, ref);
  return NextResponse.json<LoginResult>(result, {
    status: result.success ? 200 : 401,
  });
}
