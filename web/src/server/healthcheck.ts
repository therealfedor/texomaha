const port = process.env.PORT ?? "4173";
const response = await fetch(`http://127.0.0.1:${port}/api/health`);

if (!response.ok) {
  throw new Error(`Health check failed with HTTP ${response.status}`);
}

const body = await response.json() as { ok?: boolean };
if (!body.ok) {
  throw new Error("Health check failed");
}

export {};
