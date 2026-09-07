import type { ErrorRequestHandler, Response } from 'express';

interface BodyParserErrorLike {
  status?: unknown;
  type?: unknown;
}

function safeJson(res: Response, status: number, body: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  res.status(status).json(body);
}

// Last-resort safety net: body-parser rejections and any unexpected error
// thrown anywhere in the API. Internal details stay in logs; clients receive
// only the safe public contract.
export function createErrorHandler(): ErrorRequestHandler {
  // Express requires the 4-parameter arity to treat this as error middleware;
  // this handler always answers, so `next` is only read to satisfy that
  // contract without dead code.
  return (error, _req, res, _next) => {
    void _next;
    const candidate = error as BodyParserErrorLike;
    if (
      candidate.type === 'entity.parse.failed' ||
      candidate.type === 'entity.unsupported.charset' ||
      candidate.type === 'entity.too.large'
    ) {
      const message =
        candidate.type === 'entity.too.large'
          ? 'Request body too large'
          : 'Request body must be valid JSON';
      safeJson(res, 400, {
        status: 'error',
        code: 'VALIDATION_ERROR',
        message,
        fields: [{ field: 'body', message }],
      });
      return;
    }
    console.error(
      JSON.stringify({
        event: 'api-error',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
    );
    safeJson(res, 500, {
      status: 'error',
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
  };
}
