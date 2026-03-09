'use server';

export async function validateAccessCode(code: string): Promise<boolean> {
  const accessCode = process.env.SIGNUP_ACCESS_CODE ?? '1881';
  return code.trim() === accessCode;
}
