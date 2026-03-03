/**
 * Mem0 Integration - Container-side MCP Tools
 *
 * Provides memory operations that communicate with self-hosted mem0 via IPC
 */

interface Mem0ToolsConfig {
  groupFolder: string;
  isMain: boolean;
}

export function createMem0Tools({ groupFolder, isMain }: Mem0ToolsConfig) {
  return [
    // Store/Add Memory
    {
      name: 'mem0_add',
      description: 'Add new memories from messages or conversations. Stores information about user preferences, facts, or context for later retrieval.',
      inputSchema: {
        type: 'object',
        properties: {
          messages: {
            type: 'array',
            description: 'Array of conversation messages to extract memories from',
            items: {
              type: 'object',
              properties: {
                role: {
                  type: 'string',
                  enum: ['user', 'assistant'],
                  description: 'Who sent the message'
                },
                content: {
                  type: 'string',
                  description: 'The message content'
                }
              },
              required: ['role', 'content']
            }
          },
          user_id: {
            type: 'string',
            description: 'User identifier to associate memory with (defaults to current user)'
          },
          metadata: {
            type: 'object',
            description: 'Optional metadata to attach to the memory'
          },
          infer: {
            type: 'boolean',
            description: 'Whether to infer structured memories or store as-is (default: true)',
            default: true
          }
        },
        required: ['messages']
      }
    },

    // Search Memories
    {
      name: 'mem0_search',
      description: 'Search for relevant memories using semantic search. Use this before responding to recall context.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query to find relevant memories'
          },
          user_id: {
            type: 'string',
            description: 'User identifier to search memories for (defaults to current user)'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of memories to return (default: 5)',
            default: 5
          },
          metadata: {
            type: 'object',
            description: 'Optional metadata filters'
          }
        },
        required: ['query']
      }
    },

    // Get All Memories
    {
      name: 'mem0_get_all',
      description: 'Retrieve all memories for a user. Use sparingly - prefer search for specific queries.',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'User identifier (defaults to current user)'
          },
          limit: {
            type: 'number',
            description: 'Maximum number of memories to return',
            default: 100
          }
        }
      }
    },

    // Update Memory
    {
      name: 'mem0_update',
      description: 'Update an existing memory by ID',
      inputSchema: {
        type: 'object',
        properties: {
          memory_id: {
            type: 'string',
            description: 'The ID of the memory to update'
          },
          data: {
            type: 'object',
            description: 'Updated memory data'
          }
        },
        required: ['memory_id', 'data']
      }
    },

    // Delete Memory
    {
      name: 'mem0_delete',
      description: 'Delete a specific memory by ID',
      inputSchema: {
        type: 'object',
        properties: {
          memory_id: {
            type: 'string',
            description: 'The ID of the memory to delete'
          }
        },
        required: ['memory_id']
      }
    },

    // Delete All Memories
    {
      name: 'mem0_delete_all',
      description: 'Delete all memories for a user. Use with extreme caution!',
      inputSchema: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'User identifier (defaults to current user)'
          },
          confirm: {
            type: 'boolean',
            description: 'Must be true to confirm deletion',
          }
        },
        required: ['confirm']
      }
    }
  ].map((tool) => ({
    ...tool,
    handler: async (args: any) => {
      // Main group only check
      if (!isMain) {
        return {
          content: [{
            type: 'text',
            text: 'Error: mem0 tools are only available in the main group'
          }],
          isError: true
        };
      }

      // Write IPC request
      const taskId = `mem0_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      const ipcPath = '/workspace/ipc/tasks';
      const fs = await import('fs/promises');

      const ipcRequest = {
        type: `mem0_${tool.name.replace('mem0_', '')}`,
        taskId,
        args,
        groupFolder,
        timestamp: new Date().toISOString()
      };

      await fs.writeFile(
        `${ipcPath}/${taskId}.json`,
        JSON.stringify(ipcRequest, null, 2)
      );

      // Wait for response (with timeout)
      const responsePath = `${ipcPath}/${taskId}.response.json`;
      const maxWait = 30000; // 30 seconds
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        try {
          const responseData = await fs.readFile(responsePath, 'utf-8');
          const response = JSON.parse(responseData);

          // Clean up
          await fs.unlink(responsePath).catch(() => {});
          await fs.unlink(`${ipcPath}/${taskId}.json`).catch(() => {});

          return {
            content: [{
              type: 'text',
              text: response.success
                ? JSON.stringify(response.data, null, 2)
                : `Error: ${response.message}`
            }],
            isError: !response.success
          };
        } catch (err) {
          // Response not ready yet
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      return {
        content: [{
          type: 'text',
          text: 'Error: mem0 operation timed out after 30 seconds'
        }],
        isError: true
      };
    }
  }));
}
