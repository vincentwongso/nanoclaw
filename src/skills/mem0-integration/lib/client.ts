/**
 * Mem0 API Client
 *
 * HTTP client for interacting with self-hosted mem0 API
 */

import { Mem0Config, defaultConfig } from './config.js';

export interface Memory {
  id: string;
  data: {
    memory: string;
  };
  user_id?: string;
  metadata?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export class Mem0Client {
  private config: Mem0Config;

  constructor(config: Mem0Config) {
    this.config = config;
  }

  /**
   * Add memories from messages
   */
  async add(params: {
    messages: Message[];
    user_id?: string;
    metadata?: Record<string, any>;
    infer?: boolean;
  }): Promise<any> {
    const response = await this.request('/v1/memories/', {
      method: 'POST',
      body: JSON.stringify({
        messages: params.messages,
        user_id: params.user_id || this.config.userId,
        metadata: params.metadata,
        infer: params.infer !== false,
        output_format: 'v1.1',
      }),
      timeout: defaultConfig.timeouts.add,
    });

    return response;
  }

  /**
   * Search memories
   */
  async search(params: {
    query: string;
    user_id?: string;
    limit?: number;
    metadata?: Record<string, any>;
  }): Promise<Memory[]> {
    const response = await this.request('/v1/memories/search/', {
      method: 'POST',
      body: JSON.stringify({
        query: params.query,
        user_id: params.user_id || this.config.userId,
        limit: params.limit || 5,
        metadata: params.metadata,
        output_format: 'v1.1',
      }),
      timeout: defaultConfig.timeouts.search,
    });

    return response.results || response;
  }

  /**
   * Get all memories
   */
  async getAll(params: {
    user_id?: string;
    limit?: number;
  }): Promise<Memory[]> {
    const userId = params.user_id || this.config.userId;
    const limit = params.limit || 100;

    const response = await this.request(
      `/v1/memories/?user_id=${userId}&limit=${limit}`,
      {
        method: 'GET',
        timeout: defaultConfig.timeouts.search,
      },
    );

    return response.results || response;
  }

  /**
   * Update memory
   */
  async update(memoryId: string, data: Record<string, any>): Promise<any> {
    const response = await this.request(`/v1/memories/${memoryId}/`, {
      method: 'PUT',
      body: JSON.stringify({ data }),
      timeout: defaultConfig.timeouts.update,
    });

    return response;
  }

  /**
   * Delete memory
   */
  async delete(memoryId: string): Promise<boolean> {
    await this.request(`/v1/memories/${memoryId}/`, {
      method: 'DELETE',
      timeout: defaultConfig.timeouts.delete,
    });

    return true;
  }

  /**
   * Delete all memories for a user
   */
  async deleteAll(userId?: string): Promise<boolean> {
    const targetUserId = userId || this.config.userId;

    await this.request(`/v1/memories/`, {
      method: 'DELETE',
      body: JSON.stringify({ user_id: targetUserId }),
      timeout: defaultConfig.timeouts.delete,
    });

    return true;
  }

  /**
   * Make HTTP request to mem0 API
   */
  private async request(
    endpoint: string,
    options: {
      method: string;
      body?: string;
      timeout: number;
    },
  ): Promise<any> {
    const url = `${this.config.apiUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };

      // Add auth header if API key is configured
      if (this.config.apiKey) {
        headers['Authorization'] = `Token ${this.config.apiKey}`;
      }

      const response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Mem0 API error (${response.status}): ${errorText}`);
      }

      // Handle empty responses (DELETE operations)
      if (
        response.status === 204 ||
        response.headers.get('content-length') === '0'
      ) {
        return { success: true };
      }

      return await response.json();
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Mem0 request timed out after ${options.timeout}ms`);
      }

      throw error;
    }
  }
}
