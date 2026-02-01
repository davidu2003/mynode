export type ApiError = {
  response?: {
    data?: {
      error?: string;
    };
  };
};

export function getErrorMessage(err: unknown, fallback: string) {
  const apiError = err as ApiError;
  return apiError?.response?.data?.error || fallback;
}
