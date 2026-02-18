import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { log } from '@/lib/logger';

// Get current file directory in ESM-compatible way
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface PromptTemplate {
  name: string;
  template: string;
  variables: string[];
}

// Default system prompt when file loading fails
const DEFAULT_SYSTEM_PROMPT = `You are Swaggbot, an AI assistant that helps users explore and interact with APIs based on their Swagger/OpenAPI documentation.

Your role is to:
1. Help users understand what endpoints are available
2. Generate curl commands based on user requests
3. Execute those commands when appropriate
4. Explain API responses in a clear, helpful way

Be concise, accurate, and helpful. If you're unsure about something, say so.`;

class PromptManager {
  private prompts: Map<string, PromptTemplate> = new Map();
  private customPromptsPath?: string;
  private defaultPromptsPath: string;

  constructor() {
    this.customPromptsPath = process.env.CUSTOM_PROMPTS_PATH;
    // Resolve path relative to this file location (lib/prompts is 2 levels deep from root)
    // This ensures PROMPTS.md is found regardless of where the code is executed from
    this.defaultPromptsPath = join(__dirname, '..', '..', 'PROMPTS.md');
  }

  loadPrompt(name: string): PromptTemplate {
    // Check cache first
    if (this.prompts.has(name)) {
      return this.prompts.get(name)!;
    }

    // Try custom prompts first (Phase 2 feature)
    if (this.customPromptsPath) {
      const custom = this.loadFromFile(this.customPromptsPath, name);
      if (custom) {
        this.prompts.set(name, custom);
        return custom;
      }
    }

    // Fall back to default PROMPTS.md
    const defaultPrompt = this.loadFromFile(this.defaultPromptsPath, name);
    if (defaultPrompt) {
      this.prompts.set(name, defaultPrompt);
      return defaultPrompt;
    }

    // Enhanced error message with debugging info
    const error = new Error(
      `Prompt not found: ${name}\n` +
        `CWD: ${process.cwd()}\n` +
        `Resolved path: ${this.defaultPromptsPath}\n` +
        `File exists: ${existsSync(this.defaultPromptsPath)}\n` +
        `ENV CUSTOM_PROMPTS_PATH: ${this.customPromptsPath || 'not set'}`
    );
    throw error;
  }

  private loadFromFile(filePath: string, name: string): PromptTemplate | null {
    try {
      log.info('Attempting to load prompt file', { filePath, name, exists: existsSync(filePath) });

      if (!existsSync(filePath)) {
        log.error('Prompt file does not exist', new Error(`File not found: ${filePath}`), {
          filePath,
          name,
        });
        return null;
      }

      const content = readFileSync(filePath, 'utf-8');
      log.info('Loaded prompt file successfully', { filePath, name, size: content.length });

      const result = this.parsePromptFromMarkdown(content, name);
      if (!result) {
        log.error(
          'Failed to parse prompt from file',
          new Error(`Prompt "${name}" not found in ${filePath}`),
          { name, filePath }
        );
      } else {
        log.info('Parsed prompt successfully', {
          name,
          filePath,
          templateLength: result.template.length,
        });
      }
      return result;
    } catch (error) {
      log.error('Error loading prompt file', error, { filePath, name });
      return null;
    }
  }

  private parsePromptFromMarkdown(content: string, name: string): PromptTemplate | null {
    // Split document by --- horizontal rules (each prompt section is separated by ---)
    const sections = content.split(/^---$/m);

    log.debug('Parsing markdown content', {
      name,
      totalSections: sections.length,
      contentPreview: content.substring(0, 200),
    });

    const escapedName = this.escapeRegex(name);
    const headerRegex = new RegExp(`^(?:###|##)\\s*\\d*\\.?\\s*${escapedName}\\s*$`, 'im');

    log.debug('Using header regex', { escapedName, regex: headerRegex.toString() });

    // Find the section that contains the header matching the prompt name
    let matchedSection: string | null = null;
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const hasHeader = headerRegex.test(section);
      log.debug(`Checking section ${i}`, { hasHeader, sectionPreview: section.substring(0, 100) });
      if (hasHeader) {
        matchedSection = section;
        log.debug('Found matching section', { sectionIndex: i, name });
        break;
      }
    }

    if (!matchedSection) {
      log.error('No matching section found', new Error(`Section "${name}" not found`), {
        name,
        totalSections: sections.length,
        availableSections: sections.map((s, i) => {
          const lines = s.split('\n').slice(0, 3);
          return `Section ${i}: ${lines.join(' | ').substring(0, 100)}`;
        }),
      });
      return null;
    }

    // Remove the header line itself, keep everything after it
    const headerLineRegex = new RegExp(`^(?:###|##)\\s*\\d*\\.?\\s*${escapedName}[^\\n]*\\n`, 'im');
    const template = matchedSection.replace(headerLineRegex, '').trim();

    // Extract variable names from {{variable}} patterns
    const variableRegex = /\{\{(\w+)\}\}/g;
    const variables: string[] = [];
    let varMatch;
    while ((varMatch = variableRegex.exec(template)) !== null) {
      if (!variables.includes(varMatch[1])) {
        variables.push(varMatch[1]);
      }
    }

    return {
      name,
      template,
      variables,
    };
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  render(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });
  }

  // Get the full system prompt with context
  getSystemPrompt(): string {
    try {
      return this.loadPrompt('main-system-prompt').template;
    } catch {
      return DEFAULT_SYSTEM_PROMPT;
    }
  }
}

export const promptManager = new PromptManager();
