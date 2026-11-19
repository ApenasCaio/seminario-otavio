const express = require('express');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';

const users = Object.freeze({
  '1': Object.freeze({ id: 1, name: 'Caio', role: 'Estudante', department: 'Grupo 06 — Segurança' }),
  '2': Object.freeze({ id: 2, name: 'João', role: 'Estudante', department: 'Grupo 06 — Segurança' }),
});
const tokens = Object.freeze({ 'token-caio': '1', 'token-joao': '2' });

let enforceAuthorization = true;

app.disable('x-powered-by');
app.use(express.json({ limit: '8kb' }));
app.use((req, res, next) => {
  req.requestId = randomUUID();
  req.trace = [];
  req.startedAt = process.hrtime.bigint();
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

function respond(req, res, status, payload) {
  const elapsedMs = Number(process.hrtime.bigint() - req.startedAt) / 1e6;
  const entry = { step: 'response', state: status < 400 ? 'sent' : 'blocked', detail: `HTTP ${status}`, durationMs: Number(elapsedMs.toFixed(2)) };
  req.trace.push(entry);
  res.status(status).json({ ...payload, request: { id: req.requestId, method: req.method, path: req.path, durationMs: entry.durationMs }, trace: req.trace });
}

function authenticate(req) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const userId = match && tokens[match[1].trim()];
  if (!userId) {
    req.trace.push({ step: 'authentication', state: 'failed', detail: 'Token Bearer ausente ou inválido.' });
    return null;
  }
  req.authenticatedUser = users[userId];
  req.trace.push({ step: 'authentication', state: 'passed', detail: `Token reconhecido como ${req.authenticatedUser.name} (ID ${userId}).` });
  return req.authenticatedUser;
}

app.get('/', (_req, res) => {
  res.json({ name: 'SecurityLab', status: 'running', description: 'Laboratório acadêmico local de autorização por objeto.', interface: '/dashboard' });
});

app.get('/api/status', (_req, res) => {
  res.json({ name: 'SecurityLab', status: 'running', users: Object.keys(users).length, profileEndpoint: 'GET /api/users/:id' });
});

app.get('/api/lab/policy', (_req, res) => {
  res.json({ enforceAuthorization, label: enforceAuthorization ? 'Autorização ativa' : 'Sem checagem de propriedade' });
});

app.put('/api/lab/policy', (req, res) => {
  if (typeof req.body?.enforceAuthorization !== 'boolean') {
    return res.status(400).json({ error: 'Informe enforceAuthorization como booleano.' });
  }
  enforceAuthorization = req.body.enforceAuthorization;
  res.json({ enforceAuthorization, label: enforceAuthorization ? 'Autorização ativa' : 'Sem checagem de propriedade' });
});

app.get('/api/users/:id', (req, res) => {
  const authenticatedUser = authenticate(req);
  if (!authenticatedUser) {
    return respond(req, res, 401, { error: 'Não autenticado', message: 'Envie Authorization: Bearer <token>.' });
  }

  if (!/^\d+$/.test(req.params.id) || Number(req.params.id) < 1) {
    req.trace.push({ step: 'validation', state: 'failed', detail: 'O identificador deve ser um inteiro positivo.' });
    return respond(req, res, 400, { error: 'ID inválido' });
  }

  const requestedId = String(Number(req.params.id));
  const requestedUser = users[requestedId];
  if (!requestedUser) {
    req.trace.push({ step: 'resource lookup', state: 'missing', detail: `Nenhum perfil encontrado para ID ${requestedId}.` });
    return respond(req, res, 404, { error: 'Usuário não encontrado' });
  }
  req.trace.push({ step: 'resource lookup', state: 'found', detail: `Perfil ${requestedUser.name} (ID ${requestedId}) encontrado em memória.` });
  req.trace.push({ step: 'active backend policy', state: enforceAuthorization ? 'active' : 'disabled', detail: enforceAuthorization ? 'Autorização por proprietário está ativa.' : 'Checagem de propriedade está desativada para este cenário do laboratório.' });

  if (!enforceAuthorization) {
    req.trace.push({ step: 'object authorization', state: 'skipped', detail: 'Política do laboratório está sem checagem de propriedade.' });
  } else if (authenticatedUser.id !== requestedUser.id) {
    req.trace.push({ step: 'object authorization', state: 'denied', detail: `${authenticatedUser.name} (ID ${authenticatedUser.id}) não é proprietário do perfil ${requestedId}.` });
    return respond(req, res, 403, { error: 'Acesso proibido', message: 'Você só pode consultar o próprio perfil.' });
  } else {
    req.trace.push({ step: 'object authorization', state: 'allowed', detail: 'O perfil solicitado pertence ao usuário autenticado.' });
  }

  res.setHeader('X-Lab-Policy', enforceAuthorization ? 'enforced' : 'disabled');
  return respond(req, res, 200, { data: requestedUser });
});

app.use('/vendor/gsap', express.static(path.join(__dirname, '..', 'node_modules', 'gsap', 'dist'), { etag: false, maxAge: '1d' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false, etag: false }));
app.get('/dashboard', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.get('/favicon.ico', (_req, res) => res.status(204).end());
app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada', path: req.path }));

if (require.main === module) {
  const server = app.listen(PORT, HOST, () => {
    console.log(`SecurityLab disponível em http://${HOST}:${PORT}`);
    console.log(`Painel: http://${HOST}:${PORT}/dashboard`);
  });
  server.ref();
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') console.error(`A porta ${PORT} já está em uso.`);
    else console.error('Falha ao iniciar o servidor:', error);
    process.exitCode = 1;
  });
}

module.exports = app;
