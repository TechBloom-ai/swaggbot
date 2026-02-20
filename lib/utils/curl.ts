import { execFile } from 'child_process';
import { promisify } from 'util';
import { parse } from 'shell-quote';

import { ExecutionResult } from '@/lib/types';

const execFileAsync = promisify(execFile);

/**
 * Parse a curl command string into an array of arguments.
 * Uses shell-quote to properly handle quotes, escaping, and special characters.
 */
function parseCurlCommand(command: string): string[] {
  const parsed = parse(command);
  // Filter out any non-string elements (like operators) and return only the arguments
  return parsed.filter((arg): arg is string => typeof arg === 'string');
}

/**
 * Rewrite localhost URLs in command arguments for Docker compatibility.
 */
function rewriteLocalhostArgs(args: string[]): string[] {
  if (process.env.RUNNING_IN_DOCKER !== 'true') {
    return args;
  }

  return args.map(arg => {
    return arg
      .replace(/http:\/\/localhost/g, 'http://host.docker.internal')
      .replace(/https:\/\/localhost/g, 'https://host.docker.internal')
      .replace(/http:\/\/127\.0\.0\.1/g, 'http://host.docker.internal')
      .replace(/https:\/\/127\.0\.0\.1/g, 'https://host.docker.internal');
  });
}

/**
 * Add silent mode (-s) and HTTP code extraction (-w) flags if not present.
 */
function addRequiredFlags(args: string[]): string[] {
  const hasSilent = args.includes('-s');
  const hasWriteOut = args.includes('-w') || args.some(arg => arg.startsWith('-w'));

  const result = [...args];

  if (!hasSilent) {
    result.push('-s');
  }

  if (!hasWriteOut) {
    result.push('-w', '\nHTTP_CODE:%{http_code}');
  }

  return result;
}

export async function executeCurl(curlCommand: string, timeout = 30000): Promise<ExecutionResult> {
  try {
    // Parse the curl command into arguments
    let args = parseCurlCommand(curlCommand);

    // Remove the 'curl' command itself from the args array
    if (args[0] === 'curl') {
      args = args.slice(1);
    }

    // Rewrite localhost URLs when running inside Docker
    args = rewriteLocalhostArgs(args);

    // Add required flags
    args = addRequiredFlags(args);

    // Execute the curl command using execFile with arguments array
    // This prevents shell injection as no shell is spawned
    const { stdout, stderr } = await execFileAsync('curl', args, {
      timeout,
      maxBuffer: 1024 * 1024, // 1MB buffer
    });

    // Parse response
    const httpCodeMatch = stdout.match(/HTTP_CODE:(\d+)$/);
    const httpCode = httpCodeMatch ? parseInt(httpCodeMatch[1], 10) : 0;
    const cleanOutput = stdout.replace(/HTTP_CODE:\d+$/, '').trim();

    // Try to parse JSON response
    let response: unknown = null;
    try {
      response = JSON.parse(cleanOutput);
    } catch {
      response = cleanOutput;
    }

    return {
      success: httpCode >= 200 && httpCode < 300,
      stdout: cleanOutput,
      stderr: stderr || '',
      exitCode: 0,
      response,
      httpCode,
    };
  } catch (error) {
    const err = error as Error & { code?: number; killed?: boolean };

    return {
      success: false,
      stdout: '',
      stderr: err.message || 'Command execution failed',
      exitCode: err.code || 1,
      httpCode: 0,
    };
  }
}

export function extractTokenFromResponse(response: unknown, tokenPath: string): string | null {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const parts = tokenPath.split('.');
  let current: unknown = response;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return null;
    }

    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }

  if (typeof current === 'string') {
    // Prefix with Bearer if not already present
    return current.startsWith('Bearer ') ? current : `Bearer ${current}`;
  }

  return null;
}

export function validateCurlCommand(curl: string): { valid: boolean; error?: string } {
  if (!curl.trim().startsWith('curl')) {
    return { valid: false, error: 'Command must start with "curl"' };
  }

  // Check for shell metacharacters that could indicate command injection
  // This is defense-in-depth since we now use execFile, but catches obvious attempts early
  const shellMetacharacters = /[;&|`$]/;
  if (shellMetacharacters.test(curl)) {
    return {
      valid: false,
      error: 'Command contains shell metacharacters which are not allowed',
    };
  }

  // Check for dangerous flags (match as standalone flags, not as substrings of other values)
  const dangerousFlags = ['--upload-file', '-T', '--output', '-o'];
  for (const flag of dangerousFlags) {
    // Match the flag only when it appears as a standalone argument:
    // preceded by start-of-string or whitespace, followed by end-of-string or whitespace
    const flagRegex = new RegExp(
      `(?:^|\\s)${flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`
    );
    if (flagRegex.test(curl)) {
      return {
        valid: false,
        error: `Potentially dangerous flag detected: ${flag}`,
      };
    }
  }

  return { valid: true };
}
