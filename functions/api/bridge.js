import { handleRequest } from './_handler.js';

export async function onRequest(context) {
  return handleRequest(context);
}
