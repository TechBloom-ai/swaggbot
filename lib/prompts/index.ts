import { readFileSync } from 'fs';
import { join } from 'path';

import { log } from '@/lib/logger';

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
    // Resolve path relative to project root (lib/prompts is 2 levels deep from root)
    this.defaultPromptsPath = join(process.cwd(), 'PROMPTS.md');
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

    throw new Error(`Prompt not found: ${name}`);
  }

  private loadFromFile(filePath: string, name: string): PromptTemplate | null {
    try {
      const content = readFileSync(filePath, 'utf-8');
      log.debug('Loaded prompt file', { filePath, size: content.length });
      const result = this.parsePromptFromMarkdown(content, name);
      if (!result) {
        log.debug('Failed to parse prompt from file', { name, filePath });
      } else {
        log.debug('Parsed prompt', { name, templateLength: result.template.length });
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

    const escapedName = this.escapeRegex(name);
    const headerRegex = new RegExp(`^(?:###|##)\\s*\\d*\\.?\\s*${escapedName}\\s*$`, 'im');

    // Find the section that contains the header matching the prompt name
    let matchedSection: string | null = null;
    for (const section of sections) {
      if (headerRegex.test(section)) {
        matchedSection = section;
        break;
      }
    }

    if (!matchedSection) {
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
