export interface ClientConfig {
  baseUrl: string;
  token: string;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

export class ApiClient {
  constructor(private config: ClientConfig) {}

  async request<T = unknown>(
    method: string,
    endpoint: string,
    params?: unknown,
  ): Promise<ApiResponse<T>> {
    const url = new URL(endpoint, this.config.baseUrl);

    const isRead = method === 'GET';
    if (isRead && params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params as Record<string, string>)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const res = await fetch(url.toString(), {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.token}`,
      },
      body: !isRead && params ? JSON.stringify(params) : undefined,
    });

    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data: data as T };
  }
}
