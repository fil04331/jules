// app/services/api.ts

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    // Client-side, use relative path
    return '';
  }
  // Server-side, use the appropriate base URL
  // This might be from an environment variable in a real deployment
  return process.env.BACKEND_URL || 'http://127.0.0.1:8000';
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