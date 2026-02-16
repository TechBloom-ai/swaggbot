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

export function formatSwaggerForLLM(doc: SwaggerDoc): string {
  const lines: string[] = [];
  
  // Add info
  if (doc.info) {
    lines.push(`# ${doc.info.title} v${doc.info.version}`);
    if (doc.info.description) {
      lines.push(doc.info.description);
    }
    lines.push('');
  }
  
  // Add base URL
  const baseUrl = extractBaseUrl(doc);
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
        if (typeof operation !== 'object' || operation === null) continue;
        
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
        
        // Request body
        if (op.requestBody) {
          const rb = op.requestBody as Record<string, unknown>;
          lines.push('Request Body:');
          if (rb.description) {
            lines.push(`  ${rb.description}`);
          }
          if (rb.content) {
            lines.push(`  Content-Type: ${Object.keys(rb.content).join(', ')}`);
          }
          if (rb.required) {
            lines.push('  Required: Yes');
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
  if (param.type) return param.type as string;
  if (param.schema && typeof param.schema === 'object') {
    return (param.schema as Record<string, unknown>).type as string || 'string';
  }
  return 'string';
}
