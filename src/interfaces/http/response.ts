import type http from 'http';

export interface ApiError extends Error {
  statusCode: number;
  code: string;
}

export function createApiError(
  statusCode: number,
  code: string,
  message: string,
): ApiError {
  const err = new Error(message) as ApiError;
  err.statusCode = statusCode;
  err.code = code;
  return err;
}

export function isApiError(err: unknown): err is ApiError {
  return (
    err instanceof Error &&
    typeof (err as ApiError).statusCode === 'number' &&
    typeof (err as ApiError).code === 'string'
  );
}

export function writeJSON(
  res: http.ServerResponse,
  status: number,
  data: unknown,
): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}
