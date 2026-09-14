import type { Env } from "../../worker.ts";
import worker from "../../worker.ts";

export async function onRequest(context: {
  request: Request;
  env: Env;
  params: any;
  waitUntil: (promise: Promise<any>) => void;
  passThroughOnException?: () => void;
  next?: () => Promise<Response>;
}): Promise<Response> {
  return worker.fetch(context.request, context.env, {
    waitUntil: (p: Promise<any>) => context.waitUntil(p),
    passThroughOnException: () => context.passThroughOnException?.(),
  });
}
