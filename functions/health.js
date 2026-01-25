/**
 * Proxy /health to the worker dashboard
 * Forwards all query parameters (including password)
 */
export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // Build the worker URL with all query parameters
  const workerUrl = new URL('https://reset-inventory-sync.doug-6f9.workers.dev/health');
  url.searchParams.forEach((value, key) => {
    workerUrl.searchParams.set(key, value);
  });

  // Forward the request to the worker
  const workerRequest = new Request(workerUrl.toString(), {
    method: request.method,
    headers: request.headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
  });

  const response = await fetch(workerRequest);

  // Return the response with CORS headers if needed
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
