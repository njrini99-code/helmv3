/**
 * Password Validation and Strength Checking
 *
 * Enforces password security requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 * - Not a common password
 */

// Top 100 most common passwords to reject
// Source: https://github.com/danielmiessler/SecLists
const COMMON_PASSWORDS = new Set([
  '123456',
  'password',
  '12345678',
  'qwerty',
  '123456789',
  '12345',
  '1234',
  '111111',
  '1234567',
  'dragon',
  '123123',
  'baseball',
  'iloveyou',
  'trustno1',
  '1234567890',
  'sunshine',
  'master',
  'welcome',
  'shadow',
  'ashley',
  'football',
  'jesus',
  'michael',
  'ninja',
  'mustang',
  'password1',
  '123',
  'letmein',
  'abc123',
  'solo',
  'monkey',
  'liverpool',
  'robert',
  'flower',
  'fuckme',
  'charlie',
  'donald',
  'chocolate',
  'jordan',
  'michelle',
  'passw0rd',
  'welcome123',
  'admin',
  'administrator',
]);

type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

interface PasswordValidationResult {
  valid: boolean;
  strength: PasswordStrength;
  score: number; // 0-4
  feedback: string[];
  requirements: {
    minLength: boolean;
    hasUppercase: boolean;
    hasLowercase: boolean;
    hasNumber: boolean;
    hasSpecialChar: boolean;
    notCommon: boolean;
  };
}

/**
 * Validate password against security requirements
 */
export function validatePassword(password: string): PasswordValidationResult {
  const feedback: string[] = [];
  const requirements = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecialChar: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
    notCommon: !COMMON_PASSWORDS.has(password.toLowerCase()),
  };

  // Generate feedback for failed requirements
  if (!requirements.minLength) {
    feedback.push('Password must be at least 8 characters long');
  }
  if (!requirements.hasUppercase) {
    feedback.push('Password must contain at least one uppercase letter');
  }
  if (!requirements.hasLowercase) {
    feedback.push('Password must contain at least one lowercase letter');
  }
  if (!requirements.hasNumber) {
    feedback.push('Password must contain at least one number');
  }
  if (!requirements.hasSpecialChar) {
    feedback.push('Password must contain at least one special character (!@#$%^&*...)');
  }
  if (!requirements.notCommon) {
    feedback.push('This password is too common. Please choose a more unique password.');
  }

  // Calculate score (0-4)
  const score = Object.values(requirements).filter(Boolean).length;

  // Determine strength
  let strength: PasswordStrength;
  if (score <= 2) {
    strength = 'weak';
  } else if (score === 3) {
    strength = 'fair';
  } else if (score === 4) {
    strength = 'fair';
  } else if (score === 5) {
    strength = 'good';
  } else {
    strength = 'strong';
  }

  // Bonus strength for length
  if (password.length >= 12 && score >= 5) {
    strength = 'strong';
  }

  const valid = Object.values(requirements).every(Boolean);

  return {
    valid,
    strength,
    score,
    feedback,
    requirements,
  };
}

/**
 * Get password strength color for UI display
 */
function getPasswordStrengthColor(strength: PasswordStrength): string {
  switch (strength) {
    case 'weak':
      return 'bg-red-500';
    case 'fair':
      return 'bg-orange-500';
    case 'good':
      return 'bg-yellow-500';
    case 'strong':
      return 'bg-green-500';
    default:
      return 'bg-slate-300';
  }
}

/**
 * Get password strength text for UI display
 */
function getPasswordStrengthText(strength: PasswordStrength): string {
  switch (strength) {
    case 'weak':
      return 'Weak password';
    case 'fair':
      return 'Fair password';
    case 'good':
      return 'Good password';
    case 'strong':
      return 'Strong password';
    default:
      return '';
  }
}

/**
 * Get password strength percentage for progress bar
 */
function getPasswordStrengthPercentage(score: number): number {
  return Math.min(100, (score / 6) * 100);
}
