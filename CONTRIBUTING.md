# Contributing to Swaggbot

Thank you for your interest in contributing to Swaggbot! We welcome contributions from the community and are grateful for your help in making this project better.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)

## Code of Conduct

This project and everyone participating in it is governed by our commitment to:

- Being respectful and inclusive
- Welcoming newcomers
- Focusing on constructive feedback
- Prioritizing project goals

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (we use pnpm for package management)
- Git

### Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/techbloom-ai/swaggbot.git
   cd swaggbot
   ```

3. Install dependencies:
   ```bash
   pnpm install
   ```

4. Set up environment:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your API keys
   ```

5. Initialize the database:
   ```bash
   pnpm db:migrate
   ```

6. Start the development server:
   ```bash
   pnpm dev
   ```

## Development Workflow

1. **Create a branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```

2. **Make your changes** following our coding standards

3. **Test your changes** (see Testing section below)

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `style:` - Code style changes (formatting, no logic changes)
   - `refactor:` - Code refactoring
   - `test:` - Test additions/changes
   - `chore:` - Build process or auxiliary tool changes

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request** to the `main` branch

## Submitting Changes

### Pull Request Process

1. Ensure your PR description clearly describes the problem and solution
2. Reference any related issues using `Closes #123` or `Fixes #123`
3. Include screenshots/GIFs for UI changes
4. Ensure all tests pass
5. Update documentation if needed
6. Request review from maintainers

### What to Include

- Clear description of changes
- Motivation for the changes
- Testing performed
- Breaking changes (if any)

## Coding Standards

### TypeScript/JavaScript

- Use TypeScript for all new code
- Follow the existing code style
- Enable strict mode in TypeScript
- Use meaningful variable names
- Add JSDoc comments for public APIs

### Code Style

We use ESLint and Prettier for code formatting:

```bash
# Check code style
pnpm lint

# Fix code style issues
pnpm lint:fix

# Format with Prettier
pnpm format
```

### File Organization

```
├── app/              # Next.js App Router pages
├── components/       # React components
├── lib/             # Core library code
│   ├── db/          # Database schema and client
│   ├── llm/         # LLM provider implementations
│   ├── services/    # Business logic
│   └── utils/       # Utility functions
├── hooks/           # React hooks
└── stores/          # Zustand stores
```

### Naming Conventions

- **Components**: PascalCase (e.g., `ChatInterface.tsx`)
- **Files**: camelCase (e.g., `useSession.ts`)
- **Constants**: UPPER_SNAKE_CASE
- **Functions**: camelCase
- **Types/Interfaces**: PascalCase with descriptive names

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch
```

### Writing Tests

- Write tests for new features
- Update tests when modifying existing features
- Aim for meaningful test coverage
- Use descriptive test names

Example:
```typescript
describe('ChatService', () => {
  it('should classify intent correctly', async () => {
    // Test implementation
  });
});
```

### Test Structure

```
__tests__/
├── unit/           # Unit tests
├── integration/    # Integration tests
└── e2e/           # End-to-end tests
```

## Documentation

### Code Documentation

- Add JSDoc comments for functions and classes
- Document complex logic with inline comments
- Keep comments up-to-date with code changes

### README Updates

- Update README.md for user-facing changes
- Update CONTRIBUTING.md for contribution process changes
- Update wiki for detailed documentation

### API Documentation

- Document new endpoints in the code
- Update the wiki API reference section
- Include example requests and responses

## Questions?

- DM us [X/Twitter](https://x.com/Techbloom_ai) for questions

## Recognition

Contributors will be recognized in our README.md and releases. Thank you for making Swaggbot better!

---

By contributing to Swaggbot, you agree that your contributions will be licensed under the MIT License.
