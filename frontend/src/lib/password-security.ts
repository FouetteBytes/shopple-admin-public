/**
 * Password security utilities.
 * Implements strong password policies and validation.
 */

export interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  minSpecialChars: number;
  forbiddenPatterns: string[];
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  minSpecialChars: 1,
  forbiddenPatterns: [
    'password',
    'admin',
    '123456',
    'qwerty',
    'abc123',
    'password123',
    'admin123'
  ]
};

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  strength: 'weak' | 'medium' | 'strong' | 'very-strong';
  score: number;
}

export function validatePassword(
  password: string, 
  policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY
): PasswordValidationResult {
  const errors: string[] = [];
  let score = 0;

  // Validate length.
  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters long`);
  } else {
    score += Math.min(password.length - policy.minLength, 8);
  }

  // Validate character class requirements.
  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  } else if (/[A-Z]/.test(password)) {
    score += 2;
  }

  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  } else if (/[a-z]/.test(password)) {
    score += 2;
  }

  if (policy.requireNumbers && !/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  } else if (/\d/.test(password)) {
    score += 2;
  }

  if (policy.requireSpecialChars) {
    const specialChars = password.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\?]/g);
    if (!specialChars || specialChars.length < policy.minSpecialChars) {
      errors.push(`Password must contain at least ${policy.minSpecialChars} special character(s)`);
    } else {
      score += specialChars.length * 2;
    }
  }

  // Check for forbidden patterns.
  const lowerPassword = password.toLowerCase();
  for (const pattern of policy.forbiddenPatterns) {
    if (lowerPassword.includes(pattern.toLowerCase())) {
      errors.push(`Password cannot contain common words like "${pattern}"`);
      score -= 5;
    }
  }

  // Apply additional complexity checks.
  if (password.length >= 16) score += 3;
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\?]{2,}/.test(password)) score += 2;
  if (/\d{2,}/.test(password)) score += 1;

  // Apply repetitive character penalties.
  if (/(.)\1{2,}/.test(password)) {
    errors.push('Password cannot contain more than 2 consecutive identical characters');
    score -= 3;
  }

  // Apply sequential character penalties.
  if (/012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/i.test(password)) {
    errors.push('Password cannot contain sequential characters');
    score -= 2;
  }

  // Determine strength.
  let strength: PasswordValidationResult['strength'];
  if (score < 5) strength = 'weak';
  else if (score < 10) strength = 'medium';
  else if (score < 15) strength = 'strong';
  else strength = 'very-strong';

  return {
    isValid: errors.length === 0,
    errors,
    strength,
    score: Math.max(0, score)
  };
}

/**
 * Generate a strong password suggestion.
 */
export function generateStrongPassword(length: number = 16): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  let password = '';
  
  // Ensure at least one character from each required category.
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += specialChars[Math.floor(Math.random() * specialChars.length)];
  
  // Fill the remaining characters from all categories.
  const allChars = uppercase + lowercase + numbers + specialChars;
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password to reduce predictable patterns.
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Check whether a password meets minimum security requirements.
 */
export function isPasswordSecure(password: string): boolean {
  return validatePassword(password).isValid;
}
