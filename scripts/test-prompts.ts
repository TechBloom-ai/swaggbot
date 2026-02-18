// Test script to verify path resolution works regardless of CWD
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { promptManager } from '../lib/prompts/index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('=== Prompt Manager Path Resolution Test ===\n');

console.log('Environment:');
console.log('  CWD:', process.cwd());
console.log('  Script directory:', __dirname);

console.log('\nPath Resolution:');
const expectedPath = join(__dirname, '..', '..', 'PROMPTS.md');
console.log('  Expected PROMPTS.md path:', expectedPath);
console.log('  File exists:', existsSync(expectedPath));

console.log('\nTrying to load prompts from different CWD:');

// Change to a different directory to simulate MCP server environment
const originalCwd = process.cwd();
process.chdir('/tmp');
console.log('  Changed CWD to:', process.cwd());

const promptsToTest = ['intent-classification', 'main-system-prompt'];

for (const promptName of promptsToTest) {
  console.log(`\n  Testing "${promptName}":`);
  try {
    const template = promptManager.loadPrompt(promptName);
    console.log('    ✓ Successfully loaded');
    console.log('    Template length:', template.template.length);
  } catch (error) {
    console.log('    ✗ Failed to load');
    console.log('    Error:', (error as Error).message);
  }
}

// Restore original CWD
process.chdir(originalCwd);

console.log('\n=== Test Complete ===');
