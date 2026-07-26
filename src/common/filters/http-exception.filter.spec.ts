import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let cls: ClsService;
  let json: jest.Mock;
  let status: jest.Mock;

  const buildHost = (): ArgumentsHost => {
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    const response = { status };
    const request = { method: 'GET', url: '/api/v1/assets' };
    return {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as unknown as ArgumentsHost;
  };

  beforeEach(() => {
    cls = { getId: () => 'test-request-id' } as ClsService;
    filter = new HttpExceptionFilter(cls);
  });

  it('maps HttpException to its status code and message', () => {
    filter.catch(new BadRequestException('invalid payload'), buildHost());

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: 'invalid payload',
        requestId: 'test-request-id',
      }),
    );
  });

  it('maps unknown errors to 500 with a generic message', () => {
    filter.catch(new Error('boom'), buildHost());

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Internal server error',
        requestId: 'test-request-id',
      }),
    );
  });
});
