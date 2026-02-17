import { describe, it, expect } from 'vitest';

import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  BadRequestError,
  ExternalServiceError,
  LLMError,
  CurlExecutionError,
} from '@/lib/errors/AppError';

describe('AppError Classes', () => {
  describe('AppError', () => {
    it('should create basic error with default values', () => {
      const error = new AppError('Something went wrong');
      expect(error.message).toBe('Something went wrong');
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(true);
      expect(error.name).toBe('AppError');
    });

    it('should create error with custom code and status', () => {
      const error = new AppError('Custom error', 'CUSTOM_CODE', 400, true);
      expect(error.message).toBe('Custom error');
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.statusCode).toBe(400);
      expect(error.isOperational).toBe(true);
    });

    it('should capture stack trace', () => {
      const error = new AppError('Test error');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
    });

    it('should be an instance of Error', () => {
      const error = new AppError('Test');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error', () => {
      const error = new ValidationError('Invalid input');
      expect(error.message).toBe('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('ValidationError');
      expect(error.fields).toEqual({});
    });

    it('should include validation fields', () => {
      const fields = {
        email: ['Invalid email format'],
        password: ['Too short', 'Must contain uppercase'],
      };
      const error = new ValidationError('Invalid input', fields);
      expect(error.fields).toEqual(fields);
    });

    it('should be operational', () => {
      const error = new ValidationError('Test');
      expect(error.isOperational).toBe(true);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with identifier', () => {
      const error = new NotFoundError('User', '123');
      expect(error.message).toBe("User with identifier '123' not found");
      expect(error.code).toBe('NOT_FOUND');
      expect(error.statusCode).toBe(404);
      expect(error.name).toBe('NotFoundError');
    });

    it('should create not found error without identifier', () => {
      const error = new NotFoundError('User');
      expect(error.message).toBe('User not found');
    });
  });

  describe('UnauthorizedError', () => {
    it('should create unauthorized error with default message', () => {
      const error = new UnauthorizedError();
      expect(error.message).toBe('Unauthorized');
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.statusCode).toBe(401);
      expect(error.name).toBe('UnauthorizedError');
    });

    it('should create unauthorized error with custom message', () => {
      const error = new UnauthorizedError('Invalid credentials');
      expect(error.message).toBe('Invalid credentials');
    });
  });

  describe('ForbiddenError', () => {
    it('should create forbidden error with default message', () => {
      const error = new ForbiddenError();
      expect(error.message).toBe('Forbidden');
      expect(error.code).toBe('FORBIDDEN');
      expect(error.statusCode).toBe(403);
      expect(error.name).toBe('ForbiddenError');
    });

    it('should create forbidden error with custom message', () => {
      const error = new ForbiddenError('Access denied');
      expect(error.message).toBe('Access denied');
    });
  });

  describe('ConflictError', () => {
    it('should create conflict error', () => {
      const error = new ConflictError('Resource already exists');
      expect(error.message).toBe('Resource already exists');
      expect(error.code).toBe('CONFLICT');
      expect(error.statusCode).toBe(409);
      expect(error.name).toBe('ConflictError');
    });
  });

  describe('BadRequestError', () => {
    it('should create bad request error', () => {
      const error = new BadRequestError('Malformed request');
      expect(error.message).toBe('Malformed request');
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('BadRequestError');
    });
  });

  describe('ExternalServiceError', () => {
    it('should create external service error', () => {
      const originalError = new Error('Connection timeout');
      const error = new ExternalServiceError('Payment API', originalError);
      expect(error.message).toBe("External service 'Payment API' failed");
      expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(error.statusCode).toBe(502);
      expect(error.name).toBe('ExternalServiceError');
    });

    it('should preserve original error stack', () => {
      const originalError = new Error('Original error');
      originalError.stack = 'Original stack trace';
      const error = new ExternalServiceError('Service', originalError);
      expect(error.stack).toBe('Original stack trace');
    });
  });

  describe('LLMError', () => {
    it('should create LLM error', () => {
      const error = new LLMError('Model unavailable');
      expect(error.message).toBe('Model unavailable');
      expect(error.code).toBe('LLM_ERROR');
      expect(error.statusCode).toBe(502);
      expect(error.name).toBe('LLMError');
    });

    it('should preserve original error stack', () => {
      const originalError = new Error('API error');
      originalError.stack = 'API stack trace';
      const error = new LLMError('Failed', originalError);
      expect(error.stack).toBe('API stack trace');
    });
  });

  describe('CurlExecutionError', () => {
    it('should create curl execution error', () => {
      const error = new CurlExecutionError('Command failed', 1, 'stderr output');
      expect(error.message).toBe('Command failed');
      expect(error.code).toBe('CURL_EXECUTION_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.exitCode).toBe(1);
      expect(error.stderr).toBe('stderr output');
      expect(error.name).toBe('CurlExecutionError');
    });

    it('should be operational', () => {
      const error = new CurlExecutionError('Test', 0, '');
      expect(error.isOperational).toBe(true);
    });
  });

  describe('Error inheritance', () => {
    it('all errors should inherit from AppError', () => {
      const errors = [
        new ValidationError('test'),
        new NotFoundError('test'),
        new UnauthorizedError(),
        new ForbiddenError(),
        new ConflictError('test'),
        new BadRequestError('test'),
        new ExternalServiceError('test'),
        new LLMError('test'),
        new CurlExecutionError('test', 1, ''),
      ];

      for (const error of errors) {
        expect(error).toBeInstanceOf(AppError);
        expect(error).toBeInstanceOf(Error);
        expect(error.isOperational).toBe(true);
      }
    });
  });
});
