/**
 * Centralized error handling and user-friendly error messages
 * Categorizes errors and provides appropriate user feedback
 */

export interface ErrorDetails {
  title: string;
  message: string;
  isRetryable: boolean;
  suggestedAction?: string;
}

export enum ErrorCategory {
  NETWORK = 'NETWORK',
  SERVER = 'SERVER',
  AUTH = 'AUTH',
  CLIENT = 'CLIENT',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Analyze an error and categorize it
 */
export function categorizeError(error: unknown): ErrorCategory {
  if (!error) return ErrorCategory.UNKNOWN;

  // Type guard for Error objects
  const isError = error instanceof Error;
  const errorMessage = isError ? error.message.toLowerCase() : String(error).toLowerCase();

  // Network errors
  if (
    errorMessage.includes('network') ||
    errorMessage.includes('failed to fetch') ||
    errorMessage.includes('timeout') ||
    errorMessage.includes('connection')
  ) {
    return ErrorCategory.NETWORK;
  }

  // Check for Response object (fetch API)
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status;

    if (status === 401 || status === 403) {
      return ErrorCategory.AUTH;
    }

    if (status >= 500) {
      return ErrorCategory.SERVER;
    }

    if (status >= 400 && status < 500) {
      return ErrorCategory.CLIENT;
    }
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Get user-friendly error details based on error category
 */
export function getErrorDetails(error: unknown): ErrorDetails {
  const category = categorizeError(error);

  switch (category) {
    case ErrorCategory.NETWORK:
      return {
        title: 'Проблема с соединением',
        message: 'Не удается подключиться к серверу. Проверьте подключение к интернету.',
        isRetryable: true,
        suggestedAction: 'Попробуйте обновить страницу или повторите попытку через несколько секунд.',
      };

    case ErrorCategory.SERVER:
      return {
        title: 'Сервер временно недоступен',
        message: 'Произошла ошибка на сервере. Наши специалисты уже работают над устранением проблемы.',
        isRetryable: true,
        suggestedAction: 'Попробуйте повторить операцию через минуту.',
      };

    case ErrorCategory.AUTH:
      return {
        title: 'Сессия истекла',
        message: 'Ваша сессия истекла или у вас нет доступа к этому ресурсу.',
        isRetryable: false,
        suggestedAction: 'Войдите в систему заново.',
      };

    case ErrorCategory.CLIENT:
      return {
        title: 'Ошибка запроса',
        message: 'Проверьте правильность введенных данных и повторите попытку.',
        isRetryable: false,
        suggestedAction: 'Убедитесь, что все поля заполнены корректно.',
      };

    default:
      return {
        title: 'Произошла ошибка',
        message: 'Что-то пошло не так. Если проблема повторяется, обратитесь в техподдержку.',
        isRetryable: true,
        suggestedAction: 'Попробуйте повторить операцию.',
      };
  }
}

/**
 * Log error to console in development mode only
 */
export function logError(context: string, error: unknown): void {
  if (import.meta.env.DEV) {
    console.error(`[${context}]`, error);
  }
}

/**
 * Log warning to console in development mode only
 */
export function logWarning(context: string, message: string, details?: unknown): void {
  if (import.meta.env.DEV) {
    console.warn(`[${context}] ${message}`, details);
  }
}

/**
 * Extract error message from various error types
 */
export function extractErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    if ('message' in error && typeof error.message === 'string') {
      return error.message;
    }

    if ('error' in error && typeof error.error === 'string') {
      return error.error;
    }
  }

  return String(error);
}

/**
 * Format error for display in UI
 */
export function formatErrorForDisplay(error: unknown): string {
  const details = getErrorDetails(error);
  return `${details.title}: ${details.message}`;
}

/**
 * Retry wrapper with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const category = categorizeError(error);

      // Don't retry auth or client errors
      if (category === ErrorCategory.AUTH || category === ErrorCategory.CLIENT) {
        throw error;
      }

      // If we've exhausted retries, throw
      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier, maxDelay);

      if (import.meta.env.DEV) {
        console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
      }
    }
  }

  throw lastError;
}
