import { app, type HttpRequest, type InvocationContext } from '@azure/functions';
import { callback, login, logout, me, type AuthDeps } from '../lib/auth';

const deps = (context: InvocationContext): AuthDeps => ({
  env: process.env,
  fetch,
  nowSeconds: () => Math.floor(Date.now() / 1000),
  log: (message) => context.warn(message),
});

app.http('authLogin', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: (req: HttpRequest, context: InvocationContext) => login(req, deps(context)),
});

app.http('authCallback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/callback',
  handler: (req: HttpRequest, context: InvocationContext) => callback(req, deps(context)),
});

app.http('authMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/me',
  handler: (req: HttpRequest, context: InvocationContext) => me(req, deps(context)),
});

app.http('authLogout', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/logout',
  handler: (req: HttpRequest) => logout(req),
});
