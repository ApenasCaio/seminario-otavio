# UNIBRAS - Modelo de Documento para Projetos, Pesquisas e Disciplinas Específicas

<p align="center">
  <a href="https://sejaunibras.com.br"><img src="assets/unibras-logo.png" alt="UNIBRAS Logo" border="0" width="70%" /></a>
</p>

---

# BalacubacoLAB — Laboratório Interativo de IDOR / BOLA
## Broken Object Level Authorization (OWASP API Security Top 10 — API1:2023)

> Trabalho Prático — Disciplina de Segurança e Auditoria de Sistemas

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/status-concluido-green">
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-blue">
  <img alt="Universidade" src="https://img.shields.io/badge/universidade-UNIBRAS-red">
</p>

---

## 👥 Informações do Projeto

### 📚 Disciplina
**Segurança e Auditoria de Sistemas**

### 👨🎓 Aluno(a)
- [CAIO CÉSAR SILVA MENIN](https://www.linkedin.com/in/caio-menin-875026306/)

### 👨🏫 Orientador
- **Prof.** [OTAVIO CARDOSO]()

---

## 🎯 Objetivo da Atividade

Demonstrar de forma interativa a vulnerabilidade **IDOR (Insecure Direct Object Reference)**, conhecida como **BOLA (Broken Object Level Authorization)** no contexto de APIs REST, permitindo visualizar o fluxo completo de uma requisição HTTP — com e sem checagem de autorização por objeto — através de um quadro interativo animado.

---

## 🔬 Relatório Técnico — Segurança da Informação

### 📝 Resumo

O **BalacubacoLAB** é um laboratório acadêmico local que simula um cenário real de acesso indevido a recursos de outros usuários via API REST. O sistema expõe um único endpoint (`GET /api/users/:id`) e permite alternar, em tempo real, entre dois modos de operação:

- **Sem checagem de propriedade:** reproduz a falha IDOR — qualquer usuário autenticado consegue ler o perfil de qualquer outro
- **Com autorização ativa:** corrige a falha — a API verifica se o recurso solicitado pertence ao usuário autenticado

A interface visual (dashboard interativo no browser) anima o fluxo da requisição passo a passo, tornando visível cada etapa: autenticação, busca do recurso, checagem de autorização e resposta final.

### 🎯 Palavras‑chave

IDOR; BOLA; Autorização por Objeto; API Security; OWASP; Node.js; Express; Segurança.

### 🕹️ Introdução

IDOR (Insecure Direct Object Reference) é uma das vulnerabilidades mais prevalentes em APIs modernas. Ela ocorre quando uma aplicação usa identificadores controláveis pelo usuário (como IDs numéricos na URL) para acessar recursos diretamente, **sem verificar se o usuário autenticado tem permissão** para acessar aquele recurso específico.

Exemplo clássico:
```
# Caio está autenticado, mas acessa o perfil de João:
GET /api/users/2
Authorization: Bearer token-caio
→ HTTP 200  ← FALHA DE SEGURANÇA
```

A correção consiste em adicionar uma verificação de propriedade antes de retornar os dados:
```
if (authenticatedUser.id !== requestedUser.id) {
  return res.status(403).json({ error: 'Acesso proibido' });
}
```

### ⚡️ Metodologia

#### 🔧 Stack Utilizada

| Componente | Descrição |
|-----------|-----------|
| **Runtime** | Node.js ≥ 18 |
| **Framework** | Express 5 |
| **Frontend** | HTML5 + CSS3 + JavaScript (Vanilla) |
| **Animações** | GSAP 3 |
| **Testes de API** | Postman Collection |
| **Protocolo** | HTTP/1.1 — REST |
| **Autenticação** | Bearer Token (simulado) |

#### 🔌 Arquitetura da Aplicação

```
┌──────────────────────────────────────────────────────────────┐
│                     BalacubacoLAB                            │
│                                                              │
│  Browser (Dashboard)          Servidor (Express)             │
│  ┌────────────────┐          ┌────────────────────────────┐  │
│  │  Quadro        │  HTTP    │  GET /api/users/:id        │  │
│  │  Interativo    │◄────────►│  ├─ Autenticação           │  │
│  │  (GSAP)        │          │  ├─ Validação de ID        │  │
│  │                │          │  ├─ Checagem de            │  │
│  │  Casos de Teste│          │  │   Propriedade (toggle)  │  │
│  │  Histórico     │          │  └─ Resposta + Trace       │  │
│  └────────────────┘          └────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

#### 👤 Usuários e Tokens (Simulados)

| Usuário | ID | Token Bearer | Departamento |
|---------|-----|--------------|--------------|
| **Caio** | 1 | `token-caio` | Grupo 06 — Segurança |
| **João** | 2 | `token-joao` | Grupo 06 — Segurança |

---

## 📊 Resultados e Análise

### 🔹 Endpoint Principal

```
GET /api/users/:id
Authorization: Bearer <token>
```

Cada resposta inclui o campo `trace` — um log passo a passo de tudo que aconteceu no backend:

```json
{
  "data": { "id": 1, "name": "Caio", "role": "Estudante" },
  "request": { "id": "uuid", "method": "GET", "path": "/api/users/1", "durationMs": 0.5 },
  "trace": [
    { "step": "authentication",       "state": "passed",   "detail": "Token reconhecido como Caio (ID 1)." },
    { "step": "resource lookup",      "state": "found",    "detail": "Perfil Caio (ID 1) encontrado em memória." },
    { "step": "active backend policy","state": "active",   "detail": "Autorização por proprietário está ativa." },
    { "step": "object authorization", "state": "allowed",  "detail": "O perfil solicitado pertence ao usuário autenticado." },
    { "step": "response",             "state": "sent",     "detail": "HTTP 200", "durationMs": 0.5 }
  ]
}
```

### 🔹 Outros Endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET`  | `/api/status` | Status geral da API |
| `GET`  | `/api/lab/policy` | Lê a política ativa (`enforceAuthorization`) |
| `PUT`  | `/api/lab/policy` | Alterna a política `{ "enforceAuthorization": true/false }` |
| `GET`  | `/dashboard` | Interface visual interativa |

### 🔹 Casos de Teste (Postman)

A coleção `postman/SecurityLab.postman_collection.json` cobre 4 cenários:

| Caso | Usuário | Perfil solicitado | Política | Resultado esperado |
|------|---------|-------------------|----------|--------------------|
| **CT01** | Caio (`token-caio`) | Caio (ID 1) | Ativa | ✅ 200 — acesso permitido |
| **CT02** | Caio (`token-caio`) | João (ID 2) | **Desligada** | ⚠️ 200 — IDOR reproduzido |
| **CT03** | Caio (`token-caio`) | João (ID 2) | Ativa | 🛡️ 403 — acesso bloqueado |
| **CT04** | Sem token | Caio (ID 1) | Ativa | 🔒 401 — não autenticado |

---

### 🎓 Aprendizados e Observações

1. **IDOR é invisível sem logging:** sem o campo `trace`, um desenvolvedor não perceberia que a checagem estava ausente — a API retornava 200 normalmente.

2. **A correção é simples, mas exige disciplina:** uma única linha de verificação (`authenticatedUser.id !== requestedUser.id`) elimina a vulnerabilidade; o desafio é garantir que ela esteja presente em **todos** os endpoints que retornam recursos por ID.

3. **Autenticação ≠ Autorização:** o laboratório deixa claro que autenticar o token (saber *quem* é) é diferente de autorizar o acesso ao objeto (saber se *pode* acessar *aquele* recurso).

4. **Headers de segurança complementam:** o servidor já define `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` e remove o header `X-Powered-By` como boas práticas básicas.

---

### 🚀 Como Usar Este Projeto

#### 📥 Pré-requisitos

- Node.js **≥ 18** instalado
- NPM (incluído com Node.js)
- Postman (opcional, para rodar os casos de teste automatizados)

#### 📖 Passos para Executar

1. **Clone ou baixe o repositório** e entre na pasta:
   ```bash
   cd seminario-otavio
   ```

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Inicie o servidor:**
   ```bash
   npm start
   ```
   O terminal exibirá:
   ```
   SecurityLab disponível em http://127.0.0.1:3000
   Painel: http://127.0.0.1:3000/dashboard
   ```

4. **Abra o dashboard no navegador:**
   ```
   http://127.0.0.1:3000/dashboard
   ```

5. **Explore os cenários:**
   - Arraste uma **identidade** (Caio, João ou Sem token) para o bloco **CLIENTE**
   - Arraste um **perfil** (Perfil do Caio, Perfil do João ou ID inexistente) para o bloco **API**
   - Clique em **Reproduzir fluxo** e observe a animação passo a passo
   - Alterne a política de autorização para ver a diferença entre IDOR e a correção

#### 🔍 Testando via curl

```bash
# CT01 — Acesso legítimo (200)
curl -H "Authorization: Bearer token-caio" http://127.0.0.1:3000/api/users/1

# CT02 — Reproduzir IDOR (200 indevido — desligar política primeiro)
curl -X PUT -H "Content-Type: application/json" \
     -d '{"enforceAuthorization": false}' http://127.0.0.1:3000/api/lab/policy
curl -H "Authorization: Bearer token-caio" http://127.0.0.1:3000/api/users/2

# CT03 — Bloqueio correto (403)
curl -X PUT -H "Content-Type: application/json" \
     -d '{"enforceAuthorization": true}' http://127.0.0.1:3000/api/lab/policy
curl -H "Authorization: Bearer token-caio" http://127.0.0.1:3000/api/users/2

# CT04 — Sem token (401)
curl http://127.0.0.1:3000/api/users/1
```

#### 🔍 Verificação de Sucesso

✅ **Dashboard abre em** `http://127.0.0.1:3000/dashboard`
✅ **CT01 retorna HTTP 200 com** `trace.object authorization.state = "allowed"`
✅ **CT02 retorna HTTP 200 com** `trace.object authorization.state = "skipped"` (IDOR)
✅ **CT03 retorna HTTP 403 com** `trace.object authorization.state = "denied"`
✅ **CT04 retorna HTTP 401 com** `trace.authentication.state = "failed"`

---

### 💡 Comandos de Diagnóstico

```bash
# Verificar status da API
curl http://127.0.0.1:3000/api/status

# Verificar política atual
curl http://127.0.0.1:3000/api/lab/policy

# Ativar autorização por objeto
curl -X PUT -H "Content-Type: application/json" \
     -d '{"enforceAuthorization": true}' http://127.0.0.1:3000/api/lab/policy

# Desativar (reproduzir IDOR)
curl -X PUT -H "Content-Type: application/json" \
     -d '{"enforceAuthorization": false}' http://127.0.0.1:3000/api/lab/policy
```

---

## 📂 Estrutura do Repositório

```
seminario-otavio/
├── README.md                           # Este arquivo
├── package.json                        # Dependências e scripts
├── assets/
│   └── unibras-logo.png                # Logo da instituição
├── src/
│   └── server.js                       # Servidor Express (backend)
├── public/
│   ├── index.html                      # Dashboard interativo
│   ├── app.js                          # Lógica do quadro (GSAP + fetch)
│   └── styles.css                      # Estilos da interface
└── postman/
    └── SecurityLab.postman_collection.json  # Coleção de testes automatizados
```

---

## ✅ Checklist de Entrega

- [x] Servidor Node.js/Express funcional
- [x] Endpoint `GET /api/users/:id` com autenticação Bearer
- [x] Política de autorização por objeto alternável em runtime
- [x] Campo `trace` em todas as respostas para visualização do fluxo
- [x] Dashboard interativo com quadro animado (GSAP)
- [x] Arraste e solte de identidades, perfis e regras no quadro
- [x] Histórico de execuções no browser (localStorage)
- [x] Comparação A/B (com e sem autorização) lado a lado
- [x] Coleção Postman com 4 casos de teste automatizados (CT01–CT04)
- [x] README.md completo e documentado
- [ ] *Opcional:* Vídeo demonstrativo

---

## ⚡️ Ambiente e Ferramentas Utilizadas

* **Runtime:** Node.js ≥ 18
* **Framework:** Express 5
* **Animações:** GSAP 3
* **Testes:** Postman
* **Conceito:** OWASP API Security Top 10 — API1:2023 (BOLA/IDOR)
* **Controle de Versão:** Git e GitHub

### 🎓 Conclusões

Este laboratório demonstrou na prática:

- **Como reproduzir IDOR:** basta remover a verificação de propriedade do objeto — a API continua retornando dados, mas para qualquer usuário autenticado
- **Como corrigir IDOR:** comparar o ID do usuário autenticado com o ID do recurso solicitado antes de retornar os dados
- **A importância da rastreabilidade:** o campo `trace` permite auditar cada passo da requisição, essencial para debugging e segurança

---

## 📋 Licença e Informações Importantes

**Este trabalho foi desenvolvido como parte da disciplina de Segurança e Auditoria de Sistemas da UNIBRAS.**

- Aluno: [CAIO CÉSAR SILVA MENIN](https://www.linkedin.com/in/caio-menin-875026306/)
- Orientador: Prof. [OTAVIO CARDOSO]()
- Instituição: Centro Universitário Montes Belos - UNIBRAS

**Aviso Legal:**
- Este projeto é para fins **exclusivamente educacionais**
- Os tokens e dados de usuário são fictícios e existem apenas em memória
- Nunca execute este servidor em rede pública ou ambiente de produção
