import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Principal } from './auth';
import type { WodiService } from './service';
import { createMcpServer, SCOPES } from './mcp';
import { readFileSync } from 'node:fs';
import { rateLimit } from 'express-rate-limit';

export function createApp(service: WodiService, verify: (token: string) => Promise<Principal>, publicUrl: string, issuer: string): express.Express {
  const app = express();
  const resource = `${publicUrl}/mcp`;
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use('/mcp', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }));
  app.get('/healthz', (_req, res) => { res.send('ok'); });
  const metadata = { resource, authorization_servers: [issuer], scopes_supported: SCOPES, bearer_methods_supported: ['header'], resource_documentation: `${publicUrl}/support`, resource_policy_uri: `${publicUrl}/privacy`, resource_tos_uri: `${publicUrl}/terms` };
  app.get(['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'], (_req, res) => { res.json(metadata); });
  app.get('/.well-known/openai-apps-challenge', (_req, res) => { const token = process.env.OPENAI_DOMAIN_CHALLENGE; if (token) res.type('text/plain').send(token); else res.sendStatus(404); });
  app.get('/legal.css', (_req, res) => { res.type('text/css').send(readFileSync(new URL('../dist/legal.css', import.meta.url))); });
  for (const policy of ['privacy', 'terms']) app.get(`/${policy}`, (_req, res) => {
    const html = readFileSync(new URL(`../dist/${policy}.html`, import.meta.url), 'utf8').replace(/https:\/\/wodboard-17f3d\.web\.app\/(privacy|terms)\.html/g, `${publicUrl}/${policy}`).replace('href="/"', 'href="https://www.wodi.fit"');
    const disclosure = policy === 'privacy' ? '<h2>Connecting Wodi to ChatGPT</h2><p>When you connect, ChatGPT can read your workout history and records, save the workouts you ask to log, and generate and display your posters, according to the permissions you approve. Your workout details and poster images are returned to ChatGPT when you request them. We store your account connection, authorization grants, and private poster images in Firebase. Disconnect in ChatGPT to stop future calls, or contact us to revoke your connection and request deletion. Connecting never publishes to the Wodi feed.</p>' : '';
    res.type('html').send(html.replace('</main>', `${disclosure}</main>`));
  });
  app.get(['/', '/support'], (_req, res) => { res.type('html').send('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wodi for ChatGPT</title><link rel="stylesheet" href="/legal.css"></head><body><main><a class="home" href="https://www.wodi.fit">wodi<span>.</span></a><h1>Wodi for ChatGPT</h1><p>Log workouts, look back at your training, and make your Wodi posters right in ChatGPT.</p><h2>Connect your account</h2><p>Add Wodi in ChatGPT and choose Connect. Sign in with the same Google account or email you use at <a href="https://www.wodi.fit">www.wodi.fit</a>, then approve the requested access. New athletes should finish their Wodi profile first.</p><h2>Need help?</h2><p>Email <a href="mailto:amir@storybitts.com">amir@storybitts.com</a> for connection issues, data exports, account deletion, or to revoke all ChatGPT connections. You can disconnect Wodi in ChatGPT at any time.</p><p><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p></main></body></html>'); });
  // Same stateless transport as the deployed demo, with authentication before JSON parsing.
  app.all('/mcp', async (req, res) => {
    if (req.headers.origin && req.headers.origin !== publicUrl) { res.sendStatus(403); return; }
    if (req.method !== 'POST') { res.set('Allow', 'POST').sendStatus(405); return; }
    const match = /^Bearer (\S+)$/i.exec(req.headers.authorization ?? '');
    let principal: Principal;
    try { if (!match) throw new Error(); principal = await verify(match[1]); }
    catch { res.set('WWW-Authenticate', `Bearer resource_metadata="${publicUrl}/.well-known/oauth-protected-resource/mcp", scope="${SCOPES.join(' ')}"`).status(401).json({ error: 'unauthorized' }); return; }
    express.json({ limit: '512kb' })(req, res, async error => {
      if (error) { res.status(400).json({ error: 'invalid_request' }); return; }
      const server = createMcpServer(service, principal);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.once('close', () => { void server.close(); });
      try { await server.connect(transport); await transport.handleRequest(req, res, req.body); }
      catch { if (!res.headersSent) res.sendStatus(500); else if (!res.writableEnded) res.destroy(); }
    });
  });
  return app;
}
