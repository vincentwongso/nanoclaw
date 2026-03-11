const READ_POST_PATTERNS = [
  /list/, /history/, /search/, /breakdown/, /tree/, /referral/,
  /commission/, /transaction/, /cashback/, /report/, /accounts$/,
  /applications$/, /transfers$/, /messages$/, /tokens$/, /fees$/,
];

const WRITE_PATTERNS = [
  /create/, /new$/, /upload/, /deposit/, /withdraw/, /transfer(?!s$)/,
  /change/, /update/, /delete/, /remove/, /send/, /restore/, /reset/,
  /enable/, /disable/, /accept/, /redeem/, /connect/, /register/,
  /verify/, /confirm/, /check.*pin/, /forgot/,
];

export function isReadOperation(method: string, operationId: string): boolean {
  if (method === 'get') return true;
  if (method === 'delete' || method === 'put' || method === 'patch') return false;
  const id = operationId.toLowerCase();
  if (WRITE_PATTERNS.some(p => p.test(id))) return false;
  if (READ_POST_PATTERNS.some(p => p.test(id))) return true;
  return false;
}

export interface GeneratedTool {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  _endpoint: string;
  _method: string;
}

function operationIdToToolName(operationId: string): string {
  return 'client_api_' + operationId.replace(/^(get|post|put|patch|delete)_fxbo_cabinet_api_/, '');
}

function buildInputSchema(
  operation: Record<string, unknown>,
  pathParams: string[],
): GeneratedTool['inputSchema'] {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const param of pathParams) {
    properties[param] = { type: 'string', description: `Path parameter: ${param}` };
  }

  const params = (operation.parameters as Array<Record<string, unknown>> | undefined) ?? [];
  for (const param of params) {
    if (param.$ref) continue;
    const name = param.name as string;
    if (!name) continue;
    const schema = (param.schema as Record<string, unknown>) ?? { type: 'string' };
    properties[name] = { ...schema, description: param.description ?? name };
    if (param.required) required.push(name);
  }

  const reqBody = operation.requestBody as Record<string, unknown> | undefined;
  if (reqBody) {
    const bodySchema = (
      (reqBody.content as Record<string, unknown> | undefined)?.['application/json'] as
      Record<string, unknown> | undefined
    )?.schema as Record<string, unknown> | undefined;
    if (bodySchema) {
      properties['body'] = { ...bodySchema, description: 'Request body' };
      if (reqBody.required) required.push('body');
    }
  }

  return { type: 'object', properties, required: required.length ? required : undefined };
}

export function generateReadTools(spec: Record<string, unknown>): GeneratedTool[] {
  const paths = spec.paths as Record<string, Record<string, unknown>>;
  const tools: GeneratedTool[] = [];

  for (const [pathPattern, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const op = operation as Record<string, unknown>;
      const operationId = op.operationId as string | undefined;
      if (!operationId || !isReadOperation(method, operationId)) continue;

      const pathParams = [...pathPattern.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
      const tags = (op.tags as string[]) ?? [];
      const summary = (op.summary as string) ?? '';
      const description = [`[${tags.join(', ')}]`, summary || `${method.toUpperCase()} ${pathPattern}`]
        .filter(Boolean).join(' — ');

      tools.push({
        name: operationIdToToolName(operationId),
        description,
        inputSchema: buildInputSchema(op, pathParams),
        _endpoint: pathPattern,
        _method: method.toUpperCase(),
      });
    }
  }

  return tools;
}
