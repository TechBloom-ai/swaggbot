import { exec } from 'child_process';
import { promisify } from 'util';
import { ExecutionResult } from '@/lib/types';

const execAsync = promisify(exec);

export async function executeCurl(curlCommand: string, timeout = 30000): Promise<ExecutionResult> {
  try {
    // Add -s flag for silent mode and -w for HTTP code if not present
    let command = curlCommand;
    
    if (!command.includes(' -s')) {
      command += ' -s';
    }
    
    if (!command.includes(' -w')) {
      command += ' -w "\\nHTTP_CODE:%{http_code}"';
    }
    
    // Execute the curl command
    const { stdout, stderr } = await execAsync(command, { 
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
    };
  } catch (error) {
    const err = error as Error & { code?: number; killed?: boolean };
    
    return {
      success: false,
      stdout: '',
      stderr: err.message || 'Command execution failed',
      exitCode: err.code || 1,
    };
  }
}

export function extractTokenFromResponse(
  response: unknown,
  tokenPath: string
): string | null {
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
  
  // Check for dangerous flags (match as standalone flags, not as substrings of other values)
  const dangerousFlags = ['--upload-file', '-T', '--output', '-o'];
  for (const flag of dangerousFlags) {
    // Match the flag only when it appears as a standalone argument:
    // preceded by start-of-string or whitespace, followed by end-of-string or whitespace
    const flagRegex = new RegExp(`(?:^|\\s)${flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`);
    if (flagRegex.test(curl)) {
      return { 
        valid: false, 
        error: `Potentially dangerous flag detected: ${flag}` 
      };
    }
  }
  
  return { valid: true };
}
