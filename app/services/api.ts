// app/services/api.ts

function getBaseUrl() {
  const isDevelopment = process.env.NODE_ENV === 'development';

  // In development, we need the full URL to the backend for both client and server.
  if (isDevelopment) {
    return 'http://127.0.0.1:8000';
  }

  // In production:
  // On the client, use a relative path. Assumes the API is on the same domain or proxied.
  if (typeof window !== 'undefined') {
    return '';
  }

  // On the server, use the internal backend URL set by an environment variable.
  // This is for server-to-service communication in a containerized environment.
  // Fallback to a relative path if not set.
  return process.env.BACKEND_URL || '';
}

export async function fetchApi(path: string, options: RequestInit = {}) {
  const url = `${getBaseUrl()}${path}`;

  const headers: HeadersInit = { ...options.headers };

  // Don't set Content-Type if body is FormData, let the browser handle it.
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers: headers,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`API Error (${response.status}): ${errorBody}`);
    // Try to parse error response as JSON
    try {
      const errorJson = JSON.parse(errorBody);
      throw new Error(errorJson.detail || `API request failed with status ${response.status}`);
    } catch (parseError) {
      throw new Error(`API request failed with status ${response.status}: ${errorBody}`);
    }
  }

  // Handle cases where the response might not be JSON
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.indexOf('application/json') !== -1) {
    return response.json();
  }
  return response.text();
}

export function getApiUrl(path: string) {
  return `${getBaseUrl()}${path}`;
}