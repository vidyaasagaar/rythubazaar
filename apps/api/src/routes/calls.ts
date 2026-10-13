import { Router, type RequestHandler } from 'express';
import { callCreateSchema, callEndSchema, callInputSchema } from '@rythubazaar/shared';
import { ah, ok, parse } from '../lib/http';
import { endCall, handleInput, loadCallForCaller, startCall, summarize } from '../services/ivr/calls';
import type { AppDeps } from '../context';

/**
 * Demo IVR endpoints used by the keypad simulator. Anyone may place a demo call; account
 * services are only available when the caller is signed in. Each call is bound to a random
 * call token returned once at creation, so a callId alone cannot be used to drive a call.
 */
export function callsRouter(
  deps: AppDeps,
  limits: { callCreate: RequestHandler; callInput: RequestHandler },
) {
  const r = Router();
  const token = (req: Parameters<RequestHandler>[0]) => req.get('x-call-token') ?? undefined;

  r.post(
    '/',
    limits.callCreate,
    ah(async (req, res) => {
      const input = parse(callCreateSchema, req.body);
      const result = await startCall(deps, input, req.user, String(req.id));
      ok(res, result, 201);
    }),
  );

  r.post(
    '/:callId/input',
    limits.callInput,
    ah(async (req, res) => {
      const input = parse(callInputSchema, req.body);
      ok(res, await handleInput(deps, req.params.callId, token(req), input));
    }),
  );

  r.post(
    '/:callId/end',
    limits.callInput,
    ah(async (req, res) => {
      const { reason } = parse(callEndSchema, req.body);
      ok(res, await endCall(req.params.callId, token(req), reason, String(req.id)));
    }),
  );

  r.get(
    '/:callId/summary',
    ah(async (req, res) => {
      const session = await loadCallForCaller(req.params.callId, token(req));
      ok(res, summarize(session));
    }),
  );

  return r;
}
