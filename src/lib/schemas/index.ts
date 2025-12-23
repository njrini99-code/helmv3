export * from './auth';
export * from './profile';

// Utility function to validate form data and return errors
export function validateFormData<T>(
  schema: { parse: (data: unknown) => T },
  data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  try {
    const validated = schema.parse(data);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof Error && 'errors' in error) {
      const zodError = error as { errors: Array<{ path: string[]; message: string }> };
      const errors: Record<string, string> = {};
      zodError.errors.forEach((err) => {
        const path = err.path.join('.');
        errors[path] = err.message;
      });
      return { success: false, errors };
    }
    return { success: false, errors: { _form: 'Validation failed' } };
  }
}
