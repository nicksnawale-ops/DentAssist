import { ApiError, PaginatedResponse, ApiResponse } from '../types';

// Global config for simulating conditions during local development
export const ApiConfig = {
  simulateLatency: true,
  latencyMs: 600,
  simulateError: false, // Hidden dev toggle: set to true to test global error states
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Standard simulated API wrapper.
 * In later phases, this will be replaced with real fetch/axios calls.
 */
export async function apiClient<T>(
  mockDataResolver: () => T | Promise<T>,
  options: { 
    shouldFail?: boolean; 
    errorMessage?: string;
    errorCode?: string;
  } = {}
): Promise<ApiResponse<T>> {
  if (ApiConfig.simulateLatency) {
    await delay(ApiConfig.latencyMs);
  }

  const isFailing = ApiConfig.simulateError || options.shouldFail;

  if (isFailing) {
    return {
      data: null,
      error: {
        message: options.errorMessage || "An unexpected error occurred. Please try again.",
        code: options.errorCode || "INTERNAL_SERVER_ERROR",
      },
      loading: false,
    };
  }

  try {
    const data = await mockDataResolver();
    return {
      data,
      error: null,
      loading: false,
    };
  } catch (err: any) {
    return {
      data: null,
      error: {
        message: err.message || "Failed to parse mock response.",
        code: "MOCK_ERROR",
      },
      loading: false,
    };
  }
}

/**
 * Helper to build empty paginated responses
 */
export function buildPaginated<T>(items: T[], total: number, page: number, pageSize: number): PaginatedResponse<T> {
  return {
    items,
    total,
    page,
    pageSize
  };
}
