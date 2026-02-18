import yaml from 'js-yaml';

import { SwaggerDoc } from '@/lib/types';

export function parseSwagger(content: string): SwaggerDoc {
  try {
    // Try JSON first
    return JSON.parse(content) as SwaggerDoc;
  } catch {
    try {
      // Try YAML
      return yaml.load(content) as SwaggerDoc;
    } catch {
      throw new Error('Failed to parse Swagger document: invalid JSON or YAML format');
    }
  }
}

export function extractBaseUrl(doc: SwaggerDoc): string | null {
  // OpenAPI 3.x servers
  if (doc.servers && doc.servers.length > 0) {
    return doc.servers[0].url;
  }

  // Swagger 2.x
  if (doc.host) {
    const scheme = doc.schemes?.[0] || 'https';
    const basePath = doc.basePath || '';
    return `${scheme}://${doc.host}${basePath}`;
  }

  return null;
}

export function formatSwaggerForLLM(doc: SwaggerDoc, baseUrlOverride?: string): string {
  const lines: string[] = [];

  // Add info
  if (doc.info) {
    lines.push(`# ${doc.info.title} v${doc.info.version}`);
    if (doc.info.description) {
      lines.push(doc.info.description);
    }
    lines.push('');
  }

  // Add base URL - use override if provided, otherwise extract from doc
  const baseUrl = baseUrlOverride ?? extractBaseUrl(doc);
  if (baseUrl) {
    lines.push(`Base URL: ${baseUrl}`);
    lines.push('');
  }

  // Add endpoints
  lines.push('## Endpoints');
  lines.push('');

  if (doc.paths) {
    for (const [path, methods] of Object.entries(doc.paths)) {
      for (const [method, operation] of Object.entries(methods as Record<string, unknown>)) {
        if (typeof operation !== 'object' || operation === null) {
          continue;
        }

        const op = operation as Record<string, unknown>;
        lines.push(`### ${method.toUpperCase()} ${path}`);

        if (op.summary) {
          lines.push(`Summary: ${op.summary}`);
        }

        if (op.description) {
          lines.push(`Description: ${op.description}`);
        }

        // Parameters
        if (op.parameters && Array.isArray(op.parameters) && op.parameters.length > 0) {
          lines.push('Parameters:');
          for (const param of op.parameters) {
            const p = param as Record<string, unknown>;
            const required = p.required ? ' (required)' : '';
            const paramType = getParameterType(p);
            lines.push(`  - ${p.name} (${p.in}): ${paramType} ${required}`);
            if (p.description) {
              lines.push(`    ${p.description}`);
            }
          }
        }

        // Request body with schema details
        if (op.requestBody) {
          const rb = op.requestBody as Record<string, unknown>;
          lines.push('Request Body:');
          if (rb.description) {
            lines.push(`  Description: ${rb.description}`);
          }
          if (rb.required) {
            lines.push('  Required: Yes');
          }

          // Extract schema details
          const schema = extractRequestBodySchema(rb, doc);
          if (schema) {
            lines.push('  Fields:');
            formatSchemaFields(schema, lines, '    ');
          }
        }

        // Responses
        if (op.responses) {
          lines.push('Responses:');
          for (const [code, response] of Object.entries(op.responses as Record<string, unknown>)) {
            const resp = response as Record<string, unknown>;
            lines.push(`  ${code}: ${resp.description || 'No description'}`);
          }
        }

        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function getParameterType(param: Record<string, unknown>): string {
  if (param.type) {
    return param.type as string;
  }
  if (param.schema && typeof param.schema === 'object') {
    return ((param.schema as Record<string, unknown>).type as string) || 'string';
  }
  return 'string';
}

function extractRequestBodySchema(
  requestBody: Record<string, unknown>,
  doc: SwaggerDoc
): Record<string, unknown> | null {
  if (!requestBody.content) {
    return null;
  }

  const content = requestBody.content as Record<string, unknown>;
  const jsonContent = content['application/json'] || content['application/json; charset=utf-8'];

  if (!jsonContent || typeof jsonContent !== 'object') {
    return null;
  }

  const schema = (jsonContent as Record<string, unknown>).schema;
  if (!schema || typeof schema !== 'object') {
    return null;
  }

  // If schema has $ref, resolve it
  const schemaObj = schema as Record<string, unknown>;
  if (schemaObj.$ref && typeof schemaObj.$ref === 'string') {
    return resolveRef(schemaObj.$ref, doc);
  }

  return schemaObj;
}

function resolveRef(ref: string, doc: SwaggerDoc): Record<string, unknown> | null {
  // Handle #/components/schemas/Name or #/definitions/Name
  const parts = ref.replace('#/', '').split('/');
  let current: unknown = doc;

  for (const part of parts) {
    if (current && typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }

  return current as Record<string, unknown>;
}

function formatSchemaFields(
  schema: Record<string, unknown>,
  lines: string[],
  indent: string
): void {
  const properties = schema.properties as Record<string, unknown> | undefined;
  const required = (schema.required as string[]) || [];

  if (!properties) {
    return;
  }

  for (const [fieldName, fieldSchema] of Object.entries(properties)) {
    if (typeof fieldSchema !== 'object' || fieldSchema === null) {
      continue;
    }

    const field = fieldSchema as Record<string, unknown>;
    const isRequired = required.includes(fieldName);
    const fieldType = field.type || 'unknown';
    const isForeignKey = fieldName.endsWith('_id');

    let fieldDesc = `${fieldName}: ${fieldType}`;
    if (isRequired) {
      fieldDesc += ' (REQUIRED)';
    }
    if (isForeignKey) {
      fieldDesc += ' [FOREIGN KEY]';
    }

    lines.push(`${indent}- ${fieldDesc}`);

    if (field.description) {
      lines.push(`${indent}  Description: ${field.description}`);
    }

    // Handle nested objects
    if (fieldType === 'object' && field.properties) {
      lines.push(`${indent}  Nested fields:`);
      formatSchemaFields(field, lines, `${indent}    `);
    }

    // Handle arrays with items
    if (fieldType === 'array' && field.items && typeof field.items === 'object') {
      const items = field.items as Record<string, unknown>;
      if (items.$ref) {
        lines.push(`${indent}  Array of referenced objects`);
      } else if (items.properties) {
        lines.push(`${indent}  Array items:`);
        formatSchemaFields(items, lines, `${indent}    `);
      }
    }
  }
}
