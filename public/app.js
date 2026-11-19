const { gsap } = window;
const identities = {
  '1': { name: 'Caio', token: 'token-caio', glyph: 'C' },
  '2': { name: 'João', token: 'token-joao', glyph: 'J' },
};
const profiles = { '1': 'Caio', '2': 'João', '9': 'perfil inexistente' };
const componentTemplates = {
  client: { label: 'CLIENTE', title: 'Cliente', detail: 'Origem da chamada e identidade usada.' },
  authentication: { label: 'AUTENTICAÇÃO', title: 'Autenticar pedido', detail: 'Validar token e identificar quem chamou.' },
  api: { label: 'API', title: 'Endpoint da API', detail: 'Receber a requisição e buscar o recurso.' },
  authorization: { label: 'AUTORIZAÇÃO', title: 'Verificar permissão', detail: 'Conferir se a identidade pode acessar o objeto.' },
  response: { label: 'RESPOSTA', title: 'Resposta', detail: 'Retornar o status e os dados ao cliente.' },
  database: { label: 'DADOS', title: 'Base de dados', detail: 'Armazenar ou consultar registros.' },
};
const state = {
  userId: '1',
  targetId: '',
  noAuth: false,
  policy: true,
  busy: false,
  activeTimeline: null,
  history: [],
  cases: [],
  arrows: [],
  hiddenWires: {},
  removedNodes: new Set(),
  customObjects: [],
  customNodes: new Map(),
  selectedArrowId: '',
  selectedWireId: '',
  selectedObjectId: '',
  tool: 'select',
  zoom: 1,
  spaceHeld: false,
  reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
};

const world = document.querySelector('#flow-world');
const worldFrame = document.querySelector('#world-frame');
const flowViewport = document.querySelector('#flow-viewport');
const packet = document.querySelector('#packet');
const sendButton = document.querySelector('#send-button');
const compareButton = document.querySelector('#compare-button');
const nodes = {
  client: document.querySelector('#node-client'),
  authentication: document.querySelector('#node-auth'),
  lookup: document.querySelector('#node-record'),
  authorization: document.querySelector('#node-gate'),
  response: document.querySelector('#node-outcome'),
};
const componentSourceKey = { client: 'client', authentication: 'authentication', api: 'lookup', authorization: 'authorization', response: 'response' };
const defaultLayout = {
  client: { x: 12.86, y: 38.3 },
  authentication: { x: 33.64, y: 38.3 },
  lookup: { x: 56.07, y: 38.3 },
  authorization: { x: 79.86, y: 38.3 },
  response: { x: 94.3, y: 38.3 },
};
const layoutKey = 'securitylab-board-layout-v1';
const customObjectsKey = 'securitylab-board-objects-v1';
const removedNodesKey = 'securitylab-board-removed-nodes-v1';
const logicalWorld = { width: world.offsetWidth, height: world.offsetHeight };

const motionMedia = gsap.matchMedia();
motionMedia.add('(prefers-reduced-motion: reduce)', () => {
  state.reduceMotion = true;
  return () => { state.reduceMotion = false; };
});

function setZoom(value, clientX, clientY) {
  const next = Math.min(2.5, Math.max(0.2, Number(value.toFixed(2))));
  const rect = flowViewport.getBoundingClientRect();
  const anchorX = clientX === undefined ? rect.width / 2 : clientX - rect.left;
  const anchorY = clientY === undefined ? rect.height / 2 : clientY - rect.top;
  const contentX = (flowViewport.scrollLeft + anchorX) / state.zoom;
  const contentY = (flowViewport.scrollTop + anchorY) / state.zoom;
  state.zoom = next;
  document.querySelector('#zoom-label').textContent = `${Math.round(next * 100)}%`;
  if (next === 1) {
    world.style.zoom = '';
    world.style.width = '';
    world.style.height = '';
    worldFrame.style.width = '';
    worldFrame.style.height = '';
    worldFrame.style.minWidth = '';
    worldFrame.style.minHeight = '';
  } else {
    world.style.width = `${logicalWorld.width}px`;
    world.style.height = `${logicalWorld.height}px`;
    world.style.zoom = String(next);
    worldFrame.style.width = `${logicalWorld.width * next}px`;
    worldFrame.style.height = `${logicalWorld.height * next}px`;
    worldFrame.style.minWidth = '0';
    worldFrame.style.minHeight = '0';
  }
  requestAnimationFrame(() => {
    flowViewport.scrollLeft = Math.max(0, contentX * next - anchorX);
    flowViewport.scrollTop = Math.max(0, contentY * next - anchorY);
    refreshWires();
  });
}

function fitCanvasContent() {
  const entries = Object.values(canvasNodes());
  if (!entries.length) {
    setZoom(1);
    requestAnimationFrame(() => { flowViewport.scrollLeft = 0; flowViewport.scrollTop = 0; });
    return;
  }
  const bounds = entries.reduce((result, node) => {
    const center = nodePoint(node);
    const rect = node.getBoundingClientRect();
    const halfWidth = rect.width / state.zoom / 2;
    const halfHeight = rect.height / state.zoom / 2;
    result.left = Math.min(result.left, center.x - halfWidth);
    result.right = Math.max(result.right, center.x + halfWidth);
    result.top = Math.min(result.top, center.y - halfHeight);
    result.bottom = Math.max(result.bottom, center.y + halfHeight);
    return result;
  }, { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity });
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  const scale = Math.min(1.15, (flowViewport.clientWidth - 96) / width, (flowViewport.clientHeight - 96) / height);
  setZoom(scale);
  requestAnimationFrame(() => {
    const centerX = ((bounds.left + bounds.right) / 2) * state.zoom;
    const centerY = ((bounds.top + bounds.bottom) / 2) * state.zoom;
    flowViewport.scrollLeft = Math.max(0, centerX - flowViewport.clientWidth / 2);
    flowViewport.scrollTop = Math.max(0, centerY - flowViewport.clientHeight / 2);
  });
}

function isTypingTarget(target) {
  return target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest('input, textarea, select, button')));
}

let panning = null;
function startPan(event) {
  if (event.button !== 0 && event.button !== 1) return;
  if (event.button === 0 && !state.spaceHeld) return;
  if (event.button === 0 && event.target.closest('button, .object-card')) return;
  event.preventDefault();
  panning = { x: event.clientX, y: event.clientY, left: flowViewport.scrollLeft, top: flowViewport.scrollTop };
  flowViewport.classList.add('is-panning');
  flowViewport.setPointerCapture(event.pointerId);
}

function movePan(event) {
  if (!panning) return;
  flowViewport.scrollLeft = panning.left - (event.clientX - panning.x);
  flowViewport.scrollTop = panning.top - (event.clientY - panning.y);
}

function endPan() {
  if (!panning) return;
  panning = null;
  flowViewport.classList.remove('is-panning');
}

flowViewport.addEventListener('pointerdown', startPan);
flowViewport.addEventListener('pointermove', movePan);
flowViewport.addEventListener('pointerup', endPan);
flowViewport.addEventListener('pointercancel', endPan);
flowViewport.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (event.ctrlKey || event.metaKey) {
    setZoom(state.zoom * (event.deltaY < 0 ? 1.1 : 0.9), event.clientX, event.clientY);
    return;
  }
  flowViewport.scrollLeft += event.deltaX || (event.shiftKey ? event.deltaY : 0);
  flowViewport.scrollTop += event.shiftKey ? 0 : event.deltaY;
}, { passive: false });
window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space' || isTypingTarget(event.target)) return;
  state.spaceHeld = true;
  flowViewport.classList.add('space-ready');
  event.preventDefault();
});
window.addEventListener('keyup', (event) => {
  if (event.code !== 'Space') return;
  state.spaceHeld = false;
  flowViewport.classList.remove('space-ready');
});
window.addEventListener('blur', () => { state.spaceHeld = false; endPan(); flowViewport.classList.remove('space-ready'); });

function nodePoint(element) {
  const stage = world.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return {
    x: (rect.left - stage.left + rect.width / 2) / state.zoom,
    y: (rect.top - stage.top + rect.height / 2) / state.zoom,
  };
}

function nodeEdge(element, otherPoint) {
  const center = nodePoint(element);
  const rect = element.getBoundingClientRect();
  const dx = otherPoint.x - center.x;
  const dy = otherPoint.y - center.y;
  const factor = 1 / Math.max(Math.abs(dx) / (rect.width / state.zoom / 2), Math.abs(dy) / (rect.height / state.zoom / 2), 1);
  return { x: center.x + dx * factor, y: center.y + dy * factor };
}

function setNodePosition(key, position) {
  const node = nodes[key];
  node.style.left = `${position.x}%`;
  node.style.top = `${position.y}%`;
  node.style.transform = 'translate(-50%, -50%)';
}

function canvasNodes() {
  const visibleDefaults = Object.fromEntries(Object.entries(nodes).filter(([, node]) => !node.hidden));
  return { ...visibleDefaults, ...Object.fromEntries(state.customNodes.entries()) };
}

function nodeKeyForElement(element) {
  if (!element) return '';
  if (element.dataset.boardId) return element.dataset.boardId;
  return Object.keys(nodes).find((key) => nodes[key] === element) || '';
}

function canvasNodeAt(clientX, clientY) {
  const direct = document.elementFromPoint(clientX, clientY)?.closest('.canvas-node');
  if (direct) return direct;
  return Object.values(canvasNodes())
    .filter((node) => {
      const rect = node.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    })
    .sort((a, b) => Number(getComputedStyle(a).zIndex) - Number(getComputedStyle(b).zIndex))
    .at(-1) || null;
}

const flowNames = { client: 'Cliente', authentication: 'Autenticação', lookup: 'API', authorization: 'Autorização', response: 'Resposta' };

function flowName(id) {
  return flowNames[id] || state.customObjects.find((item) => item.id === id)?.title || 'bloco';
}

function executionPathState() {
  const stageOrder = ['authentication', 'lookup', 'authorization', 'response'];
  const stageById = { client: 0, authentication: 1, lookup: 2, authorization: 3, response: 4 };
  state.customObjects.forEach((item) => {
    const stage = { authentication: 1, api: 2, database: 2, authorization: 3, response: 4 }[item.type];
    if (stage) stageById[item.id] = stage;
  });
  const graph = new Map(Object.keys(canvasNodes()).map((id) => [id, new Set()]));
  const defaults = [
    ['wire-client-auth', 'client', 'authentication'],
    ['wire-auth-request', 'authentication', 'lookup'],
    ['wire-request-gate', 'lookup', 'authorization'],
    ['wire-gate-outcome', 'authorization', 'response'],
    ['wire-response', 'response', 'client'],
  ];
  defaults.forEach(([wire, from, to]) => {
    if (!state.hiddenWires[wire] && graph.has(from) && graph.has(to)) graph.get(from).add(to);
  });
  state.arrows.forEach((wire) => {
    if (wire.from && wire.to && wire.kind !== 'free') graph.get(wire.from)?.add(wire.to);
  });

  const clientIds = [
    ...(!nodes.client.hidden ? ['client'] : []),
    ...state.customObjects.filter((item) => item.type === 'client').map((item) => item.id),
  ];
  const queue = clientIds.map((id) => ({ id, progress: 0, route: [id] }));
  const visited = new Set(clientIds.map((id) => `${id}:0`));
  let best = queue[0] || { id: 'client', progress: 0, route: ['client'] };
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const next of graph.get(current.id) || []) {
      if (current.progress === 4 && next === current.route[0]) return { connected: true, missing: null, route: [...current.route, current.route[0]] };
      const stage = stageById[next] || 0;
      if (stage > current.progress + 1) continue;
      const progress = stage === current.progress + 1 ? stage : current.progress;
      const key = `${next}:${progress}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const candidate = { id: next, progress, route: [...current.route, next] };
      queue.push(candidate);
      if (progress > best.progress) best = candidate;
    }
  }
  const expected = best.progress < 4 ? stageOrder[best.progress] : 'client';
  const expectedFixedNode = expected === 'client'
    ? best.route[0]
    : (graph.has(({ authentication: 'authentication', lookup: 'lookup', authorization: 'authorization', response: 'response' })[expected])
      ? ({ authentication: 'authentication', lookup: 'lookup', authorization: 'authorization', response: 'response' })[expected]
      : Object.entries(stageById).find(([id, stage]) => stage === best.progress + 1 && graph.has(id))?.[0]);
  return { connected: false, missing: { from: best.id, to: expectedFixedNode || 'client' }, route: best.route };
}

function hasExecutionPath() {
  return executionPathState().connected;
}

function updateFlowConnectionStatus() {
  const { missing } = executionPathState();
  const status = document.querySelector('#flow-connectivity');
  status.classList.toggle('disconnected', Boolean(missing));
  status.textContent = missing
    ? `sem fio · ${flowName(missing.from)} → ${flowName(missing.to)}`
    : 'fluxo conectado';
  Object.entries(nodes).forEach(([key, node]) => node.classList.toggle('connection-gap', Boolean(missing && (missing.from === key || missing.to === key))));
  state.customNodes.forEach((node, id) => node.classList.toggle('connection-gap', Boolean(missing && (missing.from === id || missing.to === id))));
  sendButton.disabled = state.busy || !state.targetId || Boolean(missing);
  compareButton.disabled = state.busy || !state.targetId || Boolean(missing);
  sendButton.title = missing ? `Conecte ${flowName(missing.from)} a ${flowName(missing.to)} para executar.` : 'Executa somente com o fluxo conectado.';
  compareButton.title = missing ? `Conecte ${flowName(missing.from)} a ${flowName(missing.to)} para comparar.` : 'Compara com e sem a regra de autorização.';
}

function installConnectorHandles(node) {
  if (node.querySelector('.connector-handle')) return;
  [['left', 'Entrada'], ['right', 'Saída']].forEach(([side, label]) => {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = `connector-handle connector-${side}`;
    handle.setAttribute('aria-label', `${label}: arraste para conectar`);
    handle.title = 'Arraste até outra peça para conectar';
    handle.textContent = '•';
    node.append(handle);
  });
}

function createComponentObject(item, point, type) {
  const id = item.id || `component-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const source = nodes[componentSourceKey[type]];
  const sourceWasHidden = source.hidden;
  if (sourceWasHidden) source.hidden = false;
  const rect = source.getBoundingClientRect();
  const sourceStyle = getComputedStyle(source);
  source.hidden = sourceWasHidden;
  const rawX = point ? point.x / logicalWorld.width * 100 : Number(item.x ?? 50);
  const rawY = point ? point.y / logicalWorld.height * 100 : Number(item.y ?? 50);
  const x = Math.min(92, Math.max(8, Number.isFinite(rawX) ? rawX : 50));
  const y = Math.min(87, Math.max(12, Number.isFinite(rawY) ? rawY : 50));
  const article = source.cloneNode(true);
  article.querySelector('.delete-node')?.remove();
  article.hidden = false;
  article.removeAttribute('id');
  article.dataset.boardId = id;
  article.dataset.componentType = type;
  article.classList.add('custom-node', `custom-${type}`);
  const dropType = { client: 'identity', api: 'profile', authorization: 'policy' }[type];
  if (dropType) {
    article.classList.add('drop-zone');
    article.dataset.drop = dropType;
  }
  article.style.left = `${x}%`;
  article.style.top = `${y}%`;
  article.style.transform = 'translate(-50%, -50%)';
  article.style.width = `${rect.width / state.zoom}px`;
  article.style.minWidth = '0';
  article.style.maxWidth = 'none';
  article.style.minHeight = sourceStyle.minHeight;
  article.style.padding = sourceStyle.padding;
  article.style.borderRadius = sourceStyle.borderRadius;
  article.style.borderColor = sourceStyle.borderColor;
  article.style.backgroundColor = sourceStyle.backgroundColor;
  article.style.boxShadow = sourceStyle.boxShadow;
  article.querySelectorAll('[id]').forEach((element) => {
    const role = element.id;
    element.dataset.role = role;
    element.id = `${id}-${role}`;
  });
  const grip = article.querySelector('.move-grip');
  const tools = article.querySelector('.node-caption');
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'delete-node';
  remove.setAttribute('aria-label', `Remover ${componentTemplates[type].title}`);
  remove.title = 'Remover container';
  remove.textContent = '×';
  tools.append(remove);
  world.append(article);
  state.customObjects.push({
    id, type, title: componentTemplates[type].title, detail: componentTemplates[type].detail, x, y,
  });
  state.customNodes.set(id, article);
  if (!item.restore) {
    state.selectedObjectId = id;
    state.selectedArrowId = '';
    state.selectedWireId = '';
  }
  installConnectorHandles(article);
  grip.addEventListener('pointerdown', (event) => startNodeMove(event, article, grip));
  grip.addEventListener('pointermove', moveNode);
  grip.addEventListener('pointerup', endNodeMove);
  grip.addEventListener('pointercancel', endNodeMove);
  remove.addEventListener('click', (event) => { event.stopPropagation(); removeCustomObject(id); });
  article.addEventListener('click', (event) => {
    if (event.target.closest('button, .move-grip')) return;
    state.selectedObjectId = id;
    state.selectedArrowId = '';
    state.selectedWireId = '';
    updateCanvasSelection();
  });
  if (type === 'authorization') {
    article.querySelector('[data-role="policy-toggle"]').addEventListener('click', (event) => {
      event.stopPropagation();
      withBusy(async () => { await setPolicy(!state.policy); resetNodes(); });
    });
  }
  syncCustomContainers();
  persistCustomObjects();
  refreshWires();
  return article;
}

function createCustomObject(item, point = null) {
  const id = item.id || `object-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const type = componentTemplates[item.type] ? item.type : item.type === 'note' ? 'note' : 'step';
  if (componentSourceKey[type]) return createComponentObject({ ...item, id }, point, type);
  const rawX = point ? point.x / logicalWorld.width * 100 : Number(item.x ?? 50);
  const rawY = point ? point.y / logicalWorld.height * 100 : Number(item.y ?? 50);
  const x = Math.min(92, Math.max(8, Number.isFinite(rawX) ? rawX : 50));
  const y = Math.min(87, Math.max(12, Number.isFinite(rawY) ? rawY : 50));
  const defaults = componentTemplates[type] || (type === 'note'
    ? { label: 'NOTA', title: 'Nova nota', detail: 'Escreva aqui…' }
    : { label: 'ETAPA LIVRE', title: 'Nova etapa', detail: 'Descreva o que acontece…' });
  const object = { id, type, title: item.title || defaults.title, detail: item.detail || defaults.detail, x, y };
  const article = document.createElement('article');
  article.className = `canvas-node custom-node custom-${object.type} ${object.type === 'note' ? 'note-node' : ''}`;
  article.dataset.boardId = id;
  article.style.left = `${x}%`;
  article.style.top = `${y}%`;
  article.style.transform = 'translate(-50%, -50%)';
  const caption = document.createElement('div'); caption.className = 'node-caption';
  const kind = document.createElement('span'); kind.textContent = defaults.label;
  const tools = document.createElement('span'); tools.className = 'custom-node-tools';
  const grip = document.createElement('button'); grip.type = 'button'; grip.className = 'move-grip'; grip.setAttribute('aria-label', 'Mover objeto'); grip.title = 'Arraste para mover'; grip.textContent = '⠿';
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-node'; remove.setAttribute('aria-label', 'Remover objeto'); remove.title = 'Remover objeto'; remove.textContent = '×';
  tools.append(grip);
  if (type === 'authorization') {
    const policy = document.createElement('button'); policy.type = 'button'; policy.className = 'custom-policy-toggle'; policy.textContent = state.policy ? 'ATIVA' : 'IGNORADA';
    policy.setAttribute('aria-pressed', String(state.policy));
    policy.addEventListener('click', (event) => {
      event.stopPropagation();
      withBusy(async () => { await setPolicy(!state.policy); resetNodes(); });
    });
    tools.append(policy);
  }
  tools.append(remove); caption.append(kind, tools);
  const title = document.createElement('b'); title.contentEditable = 'true'; title.spellcheck = true; title.textContent = object.title;
  title.setAttribute('aria-label', 'Título editável');
  const detail = document.createElement('small'); detail.contentEditable = 'true'; detail.spellcheck = true; detail.textContent = object.detail;
  detail.setAttribute('aria-label', 'Descrição editável');
  const live = document.createElement('small'); live.className = 'custom-live-state'; live.textContent = 'Aguardando execução';
  const hint = document.createElement('span'); hint.className = 'custom-edit-hint'; hint.textContent = 'clique no texto para editar';
  article.append(caption, title, detail);
  if (componentTemplates[type]) article.append(live);
  article.append(hint);
  if (type === 'client') { article.classList.add('drop-zone'); article.dataset.drop = 'identity'; }
  if (type === 'api' || type === 'database') { article.classList.add('drop-zone'); article.dataset.drop = 'profile'; }
  if (type === 'authorization') { article.classList.add('drop-zone'); article.dataset.drop = 'policy'; }
  if (article.dataset.drop) {
    const dropHint = document.createElement('div');
    dropHint.className = 'drop-instruction';
    dropHint.textContent = article.dataset.drop === 'identity' ? 'SOLTE IDENTIDADE' : article.dataset.drop === 'profile' ? 'SOLTE PERFIL' : 'SOLTE REGRA';
    article.append(dropHint);
  }
  installConnectorHandles(article);
  world.append(article);
  state.customObjects.push(object);
  state.customNodes.set(id, article);
  if (!item.restore) {
    state.selectedObjectId = id;
    state.selectedArrowId = '';
    state.selectedWireId = '';
  }
  updateCanvasSelection();
  if (componentTemplates[type]) syncCustomContainers();
  grip.addEventListener('pointerdown', (event) => startNodeMove(event, article, grip));
  grip.addEventListener('pointermove', moveNode);
  grip.addEventListener('pointerup', endNodeMove);
  grip.addEventListener('pointercancel', endNodeMove);
  title.addEventListener('blur', () => { object.title = title.textContent.trim() || 'Sem título'; persistCustomObjects(); });
  detail.addEventListener('blur', () => { object.detail = detail.textContent.trim() || 'Sem descrição'; persistCustomObjects(); });
  remove.addEventListener('click', (event) => { event.stopPropagation(); removeCustomObject(id); });
  if (type === 'authorization') article.querySelector('.custom-policy-toggle').addEventListener('click', (event) => event.stopPropagation());
  article.addEventListener('click', (event) => {
    if (event.target.closest('button, [contenteditable="true"]')) return;
    state.selectedObjectId = id;
    state.selectedArrowId = '';
    updateCanvasSelection();
  });
  persistCustomObjects();
  refreshWires();
  if (!item.restore) { title.focus(); title.select?.(); }
  return article;
}

function persistCustomObjects() {
  state.customObjects = state.customObjects.map((item) => {
    const element = state.customNodes.get(item.id);
    if (!element) return item;
    const point = nodePoint(element);
    return {
      ...item,
      title: componentTemplates[item.type]?.title || element.querySelector('b')?.textContent.trim() || item.title,
      detail: componentTemplates[item.type]?.detail || element.querySelector('small')?.textContent.trim() || item.detail,
      x: Number((point.x / logicalWorld.width * 100).toFixed(2)),
      y: Number((point.y / logicalWorld.height * 100).toFixed(2)),
    };
  });
  localStorage.setItem(customObjectsKey, JSON.stringify(state.customObjects));
}

function removeCustomObject(id) {
  state.customNodes.get(id)?.remove();
  state.customNodes.delete(id);
  state.customObjects = state.customObjects.filter((item) => item.id !== id);
  if (state.selectedObjectId === id) state.selectedObjectId = '';
  state.arrows = state.arrows.filter((arrow) => arrow.from !== id && arrow.to !== id);
  persistCustomObjects();
  saveArrows();
  refreshWires();
}

function updateCanvasSelection() {
  state.customNodes.forEach((element, id) => element.classList.toggle('is-selected', id === state.selectedObjectId));
  document.querySelectorAll('.custom-arrow').forEach((path) => path.classList.toggle('is-selected', path.dataset.arrowId === state.selectedArrowId));
  document.querySelectorAll('.wire-hit').forEach((path) => path.classList.toggle('is-selected', path.dataset.wireId === state.selectedWireId));
}

function deleteSelection() {
  if (state.selectedArrowId) {
    state.arrows = state.arrows.filter((arrow) => arrow.id !== state.selectedArrowId);
    state.selectedArrowId = '';
    saveArrows();
    return;
  }
  if (state.selectedWireId) {
    state.hiddenWires[state.selectedWireId] = true;
    localStorage.setItem('securitylab-board-hidden-wires-v1', JSON.stringify(state.hiddenWires));
    state.selectedWireId = '';
    refreshWires();
    return;
  }
  if (state.selectedObjectId) removeCustomObject(state.selectedObjectId);
}

function removeDefaultNode(key) {
  const node = nodes[key];
  if (!node || node.hidden) return;
  node.hidden = true;
  state.removedNodes.add(key);
  const incidentWires = {
    client: ['wire-client-auth', 'wire-response'],
    authentication: ['wire-client-auth', 'wire-auth-request'],
    lookup: ['wire-auth-request', 'wire-request-gate'],
    authorization: ['wire-request-gate', 'wire-gate-outcome'],
    response: ['wire-gate-outcome', 'wire-response'],
  }[key] || [];
  incidentWires.forEach((id) => { state.hiddenWires[id] = true; });
  localStorage.setItem(removedNodesKey, JSON.stringify([...state.removedNodes]));
  localStorage.setItem('securitylab-board-hidden-wires-v1', JSON.stringify(state.hiddenWires));
  refreshWires();
}

function installDefaultDeleteButtons() {
  Object.entries(nodes).forEach(([key, node]) => {
    const caption = node.querySelector('.node-caption');
    if (!caption || caption.querySelector('.delete-node')) return;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-node';
    remove.textContent = '×';
    remove.title = 'Remover container';
    remove.setAttribute('aria-label', `Remover ${flowName(key)}`);
    remove.addEventListener('click', (event) => { event.stopPropagation(); removeDefaultNode(key); });
    caption.append(remove);
  });
}

function applySavedLayout() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(layoutKey) || '{}'); } catch { saved = {}; }
  Object.entries(nodes).forEach(([key]) => {
    const point = saved[key] && Number.isFinite(saved[key].x) && Number.isFinite(saved[key].y) ? saved[key] : defaultLayout[key];
    setNodePosition(key, point);
  });
  try {
    const removed = JSON.parse(localStorage.getItem(removedNodesKey) || '[]');
    state.removedNodes = new Set(Array.isArray(removed) ? removed.filter((key) => Object.hasOwn(nodes, key)) : []);
  } catch { state.removedNodes = new Set(); }
  Object.entries(nodes).forEach(([key, node]) => { node.hidden = state.removedNodes.has(key); });
  try { state.arrows = JSON.parse(localStorage.getItem('securitylab-board-arrows-v1') || '[]'); } catch { state.arrows = []; }
  try { state.hiddenWires = JSON.parse(localStorage.getItem('securitylab-board-hidden-wires-v1') || '{}'); } catch { state.hiddenWires = {}; }
  refreshWires();
}

function refreshWires() {
  const svg = document.querySelector('.wire-layer');
  svg.setAttribute('viewBox', `0 0 ${logicalWorld.width} ${logicalWorld.height}`);
  const curve = (from, to) => {
    const direction = Math.sign(to.x - from.x) || 1;
    const bend = Math.max(28, Math.min(100, Math.abs(to.x - from.x) * 0.36));
    return `M ${from.x} ${from.y} C ${from.x + bend * direction} ${from.y}, ${to.x - bend * direction} ${to.y}, ${to.x} ${to.y}`;
  };
  const points = Object.fromEntries(Object.entries(nodes).map(([key, node]) => [key, nodePoint(node)]));
  const links = [
    ['wire-client-auth', 'client', 'authentication'],
    ['wire-auth-request', 'authentication', 'lookup'],
    ['wire-request-gate', 'lookup', 'authorization'],
    ['wire-gate-outcome', 'authorization', 'response'],
  ];
  links.forEach(([id, from, to]) => {
    const path = document.querySelector(`#${id}`);
    if (!canvasNodes()[from] || !canvasNodes()[to]) {
      path.classList.add('wire-hidden');
      path.removeAttribute('marker-end');
      return;
    }
    const start = nodeEdge(nodes[from], points[to]);
    const end = nodeEdge(nodes[to], points[from]);
    path.setAttribute('d', curve(start, end));
  });
  const responsePath = document.querySelector('#wire-response');
  if (canvasNodes().response && canvasNodes().client) {
    const responseStart = nodeEdge(nodes.response, points.client);
    const responseEnd = nodeEdge(nodes.client, points.response);
    const returnY = Math.min(logicalWorld.height - 20, Math.max(responseStart.y, responseEnd.y) + 82);
    responsePath.setAttribute('d', `M ${responseStart.x} ${responseStart.y} C ${responseStart.x} ${returnY}, ${responseEnd.x} ${returnY}, ${responseEnd.x} ${responseEnd.y}`);
  } else {
    responsePath.classList.add('wire-hidden');
    responsePath.removeAttribute('marker-end');
  }
  const endpoints = {
    'wire-client-auth': ['client', 'authentication'],
    'wire-auth-request': ['authentication', 'lookup'],
    'wire-request-gate': ['lookup', 'authorization'],
    'wire-gate-outcome': ['authorization', 'response'],
    'wire-response': ['response', 'client'],
  };
  document.querySelectorAll('.wire-main, .wire-response').forEach((path) => {
    const [from, to] = endpoints[path.id];
    const hidden = Boolean(state.hiddenWires[path.id]) || !canvasNodes()[from] || !canvasNodes()[to];
    path.classList.toggle('wire-hidden', hidden);
    if (hidden) path.removeAttribute('marker-end');
    else path.setAttribute('marker-end', 'url(#arrow-head)');
  });
  redrawCustomArrows(curve);
  redrawWireHitAreas();
  updateFlowConnectionStatus();
}

function redrawWireHitAreas() {
  const layer = document.querySelector('#wire-hit-layer');
  layer.replaceChildren();
  document.querySelectorAll('.wire-main, .wire-response').forEach((visiblePath) => {
    if (visiblePath.classList.contains('wire-hidden')) return;
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('d', visiblePath.getAttribute('d') || '');
    hit.setAttribute('class', 'wire-hit');
    hit.dataset.wireId = visiblePath.id;
    layer.append(hit);
  });
  updateCanvasSelection();
}

function redrawCustomArrows(curve) {
  const group = document.querySelector('#custom-arrows');
  group.replaceChildren();
  const available = canvasNodes();
  state.arrows.forEach((arrow) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const fromNode = arrow.from ? available[arrow.from] : null;
    const toNode = arrow.to ? available[arrow.to] : null;
    let start = { x: arrow.x1 || 0, y: arrow.y1 || 0 };
    let end = { x: arrow.x2 || 0, y: arrow.y2 || 0 };
    if (fromNode && toNode) {
      start = nodeEdge(fromNode, nodePoint(toNode));
      end = nodeEdge(toNode, nodePoint(fromNode));
    } else if (fromNode) start = nodeEdge(fromNode, end);
    else if (toNode) end = nodeEdge(toNode, start);
    path.setAttribute('d', curve(start, end));
    path.setAttribute('class', 'custom-arrow');
    if (arrow.kind === 'wire' || (arrow.from && arrow.to && arrow.kind !== 'free')) path.classList.add('custom-wire');
    path.setAttribute('data-arrow-id', arrow.id);
    path.setAttribute('marker-end', 'url(#arrow-head)');
    if (arrow.id === state.selectedArrowId) path.classList.add('is-selected');
    group.append(path);
  });
}

function saveArrows() {
  localStorage.setItem('securitylab-board-arrows-v1', JSON.stringify(state.arrows));
  refreshWires();
}

let drawingArrow = null;
function worldPoint(event) {
  const rect = world.getBoundingClientRect();
  return { x: Math.min(logicalWorld.width, Math.max(0, (event.clientX - rect.left) / state.zoom)), y: Math.min(logicalWorld.height, Math.max(0, (event.clientY - rect.top) / state.zoom)) };
}

world.addEventListener('pointerdown', (event) => {
  const connector = event.target.closest('.connector-handle');
  if (state.spaceHeld && event.button === 0) return;
  if ((state.tool !== 'arrow' && state.tool !== 'wire' && !connector) || event.button !== 0) return;
  if (!connector && event.target.closest('button, [contenteditable="true"]')) return;
  const startNode = connector ? event.target.closest('.canvas-node') : canvasNodeAt(event.clientX, event.clientY);
  const kind = state.tool === 'wire' || connector ? 'wire' : 'free';
  if (kind === 'wire' && !startNode) return;
  event.preventDefault();
  event.stopPropagation();
  const start = worldPoint(event);
  const preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  preview.setAttribute('class', 'custom-arrow arrow-preview');
  document.querySelector('#custom-arrows').append(preview);
  drawingArrow = { ...start, x1: start.x, y1: start.y, from: nodeKeyForElement(startNode), kind, preview, pointerId: event.pointerId };
  world.setPointerCapture(event.pointerId);
});
world.addEventListener('pointermove', (event) => {
  if (!drawingArrow) return;
  const end = worldPoint(event);
  drawingArrow.x2 = end.x; drawingArrow.y2 = end.y;
  const hovered = canvasNodeAt(event.clientX, event.clientY);
  const to = nodeKeyForElement(hovered);
  Object.values(canvasNodes()).forEach((node) => node.classList.toggle('connection-target', Boolean(to && to !== drawingArrow.from && node === hovered)));
  const map = canvasNodes();
  const fromPoint = drawingArrow.from && map[drawingArrow.from]
    ? nodeEdge(map[drawingArrow.from], to && map[to] ? nodePoint(map[to]) : end)
    : { x: drawingArrow.x1, y: drawingArrow.y1 };
  const toPoint = to && map[to] && to !== drawingArrow.from
    ? nodeEdge(map[to], drawingArrow.from && map[drawingArrow.from] ? nodePoint(map[drawingArrow.from]) : fromPoint)
    : end;
  const bend = Math.max(28, Math.min(100, Math.abs(toPoint.x - fromPoint.x) * 0.36));
  const direction = Math.sign(toPoint.x - fromPoint.x) || 1;
  drawingArrow.preview.setAttribute('d', `M ${fromPoint.x} ${fromPoint.y} C ${fromPoint.x + bend * direction} ${fromPoint.y}, ${toPoint.x - bend * direction} ${toPoint.y}, ${toPoint.x} ${toPoint.y}`);
});
function finishArrow(event) {
  if (!drawingArrow) return;
  const drawing = drawingArrow;
  const end = worldPoint(event);
  drawing.x2 = end.x;
  drawing.y2 = end.y;
  const targetElement = canvasNodeAt(event.clientX, event.clientY);
  const to = nodeKeyForElement(targetElement);
  Object.values(canvasNodes()).forEach((node) => node.classList.remove('connection-target'));
  drawingArrow = null;
  drawing.preview.remove();
  if (drawing.kind === 'wire' && (!drawing.from || !to || drawing.from === to)) {
    document.querySelector('#tool-hint').textContent = 'Fio não criado. Arraste de uma peça até outra peça diferente.';
    return;
  }
  if (Math.hypot((drawing.x2 || drawing.x1) - drawing.x1, (drawing.y2 || drawing.y1) - drawing.y1) < 12) return;
  if (drawing.from && drawing.from === to) return;
  suppressClickUntil = Date.now() + 300;
  state.selectedArrowId = '';
  state.selectedObjectId = '';
  state.selectedWireId = '';
  updateCanvasSelection();
  const arrow = { id: `arrow-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, kind: drawing.kind, from: drawing.from || '', to: to || '', x1: drawing.x1, y1: drawing.y1, x2: drawing.x2, y2: drawing.y2 };
  state.selectedArrowId = arrow.id;
  state.arrows.push(arrow);
  saveArrows();
  if (drawing.kind !== 'wire') setTool('select');
}
world.addEventListener('pointerup', finishArrow);
world.addEventListener('pointercancel', finishArrow);

function setTool(tool) {
  state.tool = tool;
  Object.values(nodes).forEach((node) => node.classList.remove('arrow-source'));
  document.querySelector('#select-tool').classList.toggle('active', tool === 'select');
  document.querySelector('#wire-tool').classList.toggle('active', tool === 'wire');
  document.querySelector('#arrow-tool').classList.toggle('active', tool === 'arrow');
  document.querySelector('#tool-hint').textContent = tool === 'wire'
    ? 'arraste de uma peça até outra · somente fios presos às duas peças conectam o fluxo'
    : tool === 'arrow'
      ? 'arraste no fundo para criar uma seta de anotação · ela não conecta o fluxo'
      : '';
  world.classList.toggle('drawing-arrow', tool === 'arrow');
  world.classList.toggle('is-drawing-wire', tool === 'wire');
}

function handleCanvasClick(event) {
  if (Date.now() < suppressClickUntil) return;
  const arrow = event.target.closest('.custom-arrow');
  if (arrow && state.tool !== 'arrow') {
    state.selectedArrowId = state.selectedArrowId === arrow.dataset.arrowId ? '' : arrow.dataset.arrowId;
    state.selectedObjectId = '';
    state.selectedWireId = '';
    updateCanvasSelection();
    return;
  }
  const wire = event.target.closest('.wire-hit');
  if (wire && state.tool !== 'arrow') {
    state.selectedWireId = state.selectedWireId === wire.dataset.wireId ? '' : wire.dataset.wireId;
    state.selectedArrowId = '';
    state.selectedObjectId = '';
    updateCanvasSelection();
    return;
  }
  if (state.tool === 'arrow' || state.tool === 'wire') return;
  state.selectedObjectId = event.target.closest('.custom-node')?.dataset.boardId || '';
  if (!arrow) state.selectedArrowId = '';
  state.selectedWireId = '';
  updateCanvasSelection();
}

window.addEventListener('keydown', (event) => {
  if (!['Delete', 'Backspace'].includes(event.key) || isTypingTarget(event.target)) return;
  if (!state.selectedArrowId && !state.selectedWireId && !state.selectedObjectId) return;
  event.preventDefault();
  deleteSelection();
});

function persistLayout() {
  const layout = {};
  Object.entries(nodes).forEach(([key, node]) => {
    const point = nodePoint(node);
    layout[key] = { x: Number((point.x / logicalWorld.width * 100).toFixed(2)), y: Number((point.y / logicalWorld.height * 100).toFixed(2)) };
  });
  localStorage.setItem(layoutKey, JSON.stringify(layout));
  refreshWires();
}

function resetLayout() {
  localStorage.removeItem(layoutKey);
  localStorage.removeItem('securitylab-board-arrows-v1');
  state.arrows = [];
  state.hiddenWires = {};
  state.removedNodes.clear();
  state.selectedArrowId = '';
  state.selectedObjectId = '';
  state.customNodes.forEach((element) => element.remove());
  state.customNodes.clear();
  state.customObjects = [];
  localStorage.removeItem(customObjectsKey);
  localStorage.removeItem('securitylab-board-hidden-wires-v1');
  localStorage.removeItem(removedNodesKey);
  setZoom(1);
  setTool('select');
  Object.entries(defaultLayout).forEach(([key, point]) => setNodePosition(key, point));
  Object.values(nodes).forEach((node) => { node.hidden = false; });
  refreshWires();
}

function classForResult(mode) {
  if (mode === 'active') return 'is-active';
  if (['passed', 'found', 'allowed', 'sent'].includes(mode)) return 'is-pass';
  if (['failed', 'denied', 'blocked'].includes(mode)) return 'is-denied';
  if (['skipped', 'missing', 'disabled'].includes(mode)) return 'is-skipped';
  return '';
}

function setNodeState(node, mode, title, detail) {
  node.classList.remove('is-active', 'is-pass', 'is-denied', 'is-skipped');
  const cssClass = classForResult(mode);
  if (cssClass) node.classList.add(cssClass);
  const titleNode = node.querySelector('b');
  const detailNode = node.querySelector('small');
  if (titleNode) titleNode.textContent = title;
  if (detailNode) detailNode.textContent = detail;
}

function updateCustomRuntime(type, text, mode = '', route = null) {
  state.customObjects.filter((item) => item.type === type && (!route || route.includes(item.id))).forEach((item) => {
    const node = state.customNodes.get(item.id);
    const live = node?.querySelector('.custom-live-state');
    if (!node) return;
    if (live) live.textContent = text;
    const role = (name) => node.querySelector(`[data-role="${name}"]`);
    const parts = text.split(' · ');
    const stateText = parts[0] || text;
    const detailText = parts.slice(1).join(' · ');
    const stateRole = { authentication: 'auth-state', api: 'record-state', authorization: 'gate-state', response: 'outcome-state' }[type];
    const detailRole = { authentication: 'auth-detail', api: 'record-detail', authorization: 'gate-detail', response: 'outcome-detail' }[type];
    if (stateRole && role(stateRole)) role(stateRole).textContent = stateText;
    if (detailRole && role(detailRole) && detailText) role(detailRole).textContent = detailText;
    if (type === 'authorization' && role('gate-icon')) role('gate-icon').textContent = mode === 'active' || state.policy ? '◇' : '↗';
    node.classList.remove('is-active', 'is-pass', 'is-denied', 'is-skipped');
    const cssClass = classForResult(mode);
    if (cssClass) node.classList.add(cssClass);
  });
}

function syncCustomContainers() {
  const path = state.targetId ? `/api/users/${state.targetId}` : '/api/users/:id';
  const authorization = state.noAuth ? 'ausente' : `Bearer ${identities[state.userId].token}`;
  document.querySelector('#request-path').textContent = path;
  document.querySelector('#request-auth').textContent = authorization;
  document.querySelector('#request-auth-row').hidden = state.noAuth;
  document.querySelector('#request-header-count').textContent = state.noAuth ? '1' : '2';
  state.customObjects.filter((item) => item.type === 'api').forEach((item) => {
    const node = state.customNodes.get(item.id);
    const role = (name) => node?.querySelector(`[data-role="${name}"]`);
    if (role('request-path')) role('request-path').textContent = path;
    if (role('request-auth')) role('request-auth').textContent = authorization;
    if (role('request-auth-row')) role('request-auth-row').hidden = state.noAuth;
    if (role('request-header-count')) role('request-header-count').textContent = state.noAuth ? '1' : '2';
  });
  updateCustomRuntime('client', state.noAuth
    ? 'Sem token · pedido anônimo'
    : `${identities[state.userId].name} · Bearer ${identities[state.userId].token}`);
  updateCustomRuntime('api', state.targetId
    ? `GET /api/users/${state.targetId} · pronto para reproduzir`
    : 'GET /api/users/:id · escolha um perfil');
  updateCustomRuntime('database', state.targetId
    ? `Recurso solicitado · ID ${state.targetId}`
    : 'Aguardando perfil');
  updateCustomRuntime('authorization', state.policy
    ? 'Regra ativa · confere proprietário'
    : 'Regra ignorada · acesso sem conferência');
  updateCustomRuntime('response', 'Aguardando resposta da API');
  const defaults = {
    authentication: ['esperando pedido', 'Quem está fazendo a chamada?'],
    api: [state.targetId ? `Perfil ${profiles[state.targetId] || 'não encontrado'}` : 'rota pronta', state.targetId
      ? 'Requisição preparada · GET'
      : 'Solte um perfil aqui para preparar a chamada.'],
    authorization: ['proprietário?', state.policy ? 'A API compara pessoa e perfil.' : 'A checagem está desligada no servidor.'],
    response: ['sem resposta', 'A resposta real aparece aqui.'],
  };
  state.customObjects.forEach((item) => {
    const node = state.customNodes.get(item.id);
    const roles = defaults[item.type];
    if (!node || !roles) return;
    const stateRole = { authentication: 'auth-state', api: 'record-state', authorization: 'gate-state', response: 'outcome-state' }[item.type];
    const detailRole = { authentication: 'auth-detail', api: 'record-detail', authorization: 'gate-detail', response: 'outcome-detail' }[item.type];
    const role = (name) => node.querySelector(`[data-role="${name}"]`);
    if (role(stateRole)) role(stateRole).textContent = roles[0];
    if (role(detailRole)) role(detailRole).textContent = roles[1];
  });
  document.querySelectorAll('.policy-toggle, .custom-policy-toggle').forEach((button) => {
    button.textContent = state.policy ? 'ATIVA' : 'IGNORADA';
    button.classList.toggle('off', !state.policy);
    button.setAttribute('aria-pressed', String(state.policy));
    button.disabled = state.busy;
  });
}

function setObjectSelection(type, value) {
  document.querySelectorAll('.object-card').forEach((card) => {
    const selected = card.dataset.dragType === type && card.dataset.id === value;
    card.classList.toggle('selected-object', selected);
  });
}

function syncClient() {
  const identity = identities[state.userId];
  document.querySelector('#person-name').textContent = state.noAuth ? 'Sem token' : identity.name;
  document.querySelector('#person-id').textContent = state.noAuth ? 'não autenticado' : `usuário · ${state.userId}`;
  document.querySelector('#person-glyph').textContent = state.noAuth ? '×' : identity.glyph;
  document.querySelector('#client-token').textContent = state.noAuth ? 'Authorization ausente' : `Bearer ${identity.token}`;
  nodes.client.classList.toggle('anonymous-client', state.noAuth);
  state.customObjects.filter((item) => item.type === 'client').forEach((item) => {
    const node = state.customNodes.get(item.id);
    const role = (name) => node?.querySelector(`[data-role="${name}"]`);
    if (role('person-name')) role('person-name').textContent = state.noAuth ? 'Sem token' : identity.name;
    if (role('person-id')) role('person-id').textContent = state.noAuth ? 'não autenticado' : `usuário · ${state.userId}`;
    if (role('person-glyph')) role('person-glyph').textContent = state.noAuth ? '×' : identity.glyph;
    if (role('client-token')) role('client-token').textContent = state.noAuth ? 'Authorization ausente' : `Bearer ${identity.token}`;
    node?.classList.toggle('anonymous-client', state.noAuth);
  });
  document.querySelector('#auth-user').value = state.userId;
  document.querySelector('#no-auth').checked = state.noAuth;
  setObjectSelection('identity', state.noAuth ? 'none' : state.userId);
  syncCustomContainers();
}

function syncPolicy() {
  const button = document.querySelector('#policy-toggle');
  button.textContent = state.policy ? 'ATIVA' : 'IGNORADA';
  button.classList.toggle('off', !state.policy);
  button.setAttribute('aria-pressed', String(state.policy));
  document.querySelector('#policy-off').setAttribute('aria-pressed', String(!state.policy));
  document.querySelector('#policy-on').setAttribute('aria-pressed', String(state.policy));
  document.querySelector('#gate-detail').textContent = state.policy
    ? 'A API compara pessoa e perfil.'
    : 'A checagem está desligada no servidor.';
  state.customObjects.filter((item) => item.type === 'authorization').forEach((item) => {
    const node = state.customNodes.get(item.id);
    const role = (name) => node?.querySelector(`[data-role="${name}"]`);
    if (role('gate-icon')) role('gate-icon').textContent = state.policy ? '◇' : '↗';
    if (role('gate-detail')) role('gate-detail').textContent = state.policy
      ? 'A API compara pessoa e perfil.'
      : 'A checagem está desligada no servidor.';
  });
  syncCustomContainers();
}

function resetNodes() {
  Object.values(nodes).forEach((node) => node.classList.remove('is-active', 'is-pass', 'is-denied', 'is-skipped'));
  state.customNodes.forEach((node) => node.classList.remove('is-active', 'is-pass', 'is-denied', 'is-skipped'));
  packet.classList.remove('is-response');
  document.querySelector('#auth-state').textContent = 'esperando pedido';
  document.querySelector('#auth-detail').textContent = 'Quem está fazendo a chamada?';
  document.querySelector('#record-state').textContent = state.targetId ? `Perfil ${profiles[state.targetId]}` : 'rota pronta';
  document.querySelector('#record-detail').textContent = state.targetId
    ? `Solte novamente para consultar ID ${state.targetId}.`
    : 'Solte um perfil aqui para chamar a API.';
  document.querySelector('#gate-state').textContent = 'proprietário?';
  document.querySelector('#gate-detail').textContent = state.policy ? 'A API compara pessoa e perfil.' : 'A checagem está desligada no servidor.';
  document.querySelector('#gate-icon').textContent = state.policy ? '◇' : '↗';
  document.querySelector('#outcome-code').textContent = '—';
  document.querySelector('#outcome-mark').textContent = '…';
  document.querySelector('#outcome-state').textContent = 'sem resposta';
  document.querySelector('#outcome-detail').textContent = 'A resposta real aparece aqui.';
  document.querySelector('#scene-caption').textContent = state.targetId
    ? `${state.noAuth ? 'Sem token' : identities[state.userId].name} está pronto para pedir o perfil ${state.targetId}.`
    : 'Comece escolhendo uma identidade na prateleira.';
  document.querySelector('#scene-request-id').textContent = 'sem request ID';
  document.querySelector('#response-status').textContent = '—';
  document.querySelector('#response-status').className = 'status-code';
  document.querySelector('#result-message').textContent = 'Aguardando uma execução.';
  document.querySelector('#result-meta').textContent = 'Nenhuma chamada foi enviada.';
  document.querySelector('#response-body').textContent = 'Aguardando resposta HTTP…';
  syncCustomContainers();
  gsap.killTweensOf(packet);
  gsap.set(packet, { autoAlpha: 0, scale: 0.8 });
}

function makeTimeline() {
  return gsap.timeline({ paused: true, defaults: { duration: state.reduceMotion ? 0 : 0.34, ease: 'power2.inOut' } });
}

const defaultConnectionIds = {
  'client>authentication': 'wire-client-auth',
  'authentication>lookup': 'wire-auth-request',
  'lookup>authorization': 'wire-request-gate',
  'authorization>response': 'wire-gate-outcome',
  'response>client': 'wire-response',
};

function findConnectionPath(from, to) {
  const defaultId = defaultConnectionIds[`${from}>${to}`];
  if (defaultId && !state.hiddenWires[defaultId]) {
    const path = document.querySelector(`#${defaultId}`);
    if (path?.getAttribute('d')) return { path, reverse: false };
  }
  const direct = state.arrows.find((item) => item.from === from && item.to === to && item.kind !== 'free');
  if (direct) return { path: document.querySelector(`[data-arrow-id="${direct.id}"]`), reverse: false };
  const defaultReverseId = defaultConnectionIds[`${to}>${from}`];
  if (defaultReverseId && !state.hiddenWires[defaultReverseId]) {
    const path = document.querySelector(`#${defaultReverseId}`);
    if (path?.getAttribute('d')) return { path, reverse: true };
  }
  const reverse = state.arrows.find((item) => item.from === to && item.to === from && item.kind !== 'free');
  if (reverse) return { path: document.querySelector(`[data-arrow-id="${reverse.id}"]`), reverse: true };
  return null;
}

function addWireTravel(timeline, from, to, { response = false } = {}) {
  const connection = findConnectionPath(from, to);
  if (!connection?.path) throw new Error(`Não encontrei um fio entre ${flowName(from)} e ${flowName(to)}.`);
  const path = connection.path;
  const length = path.getTotalLength();
  const travelBackwards = connection.reverse;
  const travel = { progress: travelBackwards ? 1 : 0 };
  const width = packet.offsetWidth || 44;
  const height = packet.offsetHeight || 24;
  const positionPacket = () => {
    const progress = Math.max(0, Math.min(1, travel.progress));
    const point = path.getPointAtLength(length * progress);
    gsap.set(packet, { x: point.x - width / 2, y: point.y - height / 2, autoAlpha: 1, scale: 1 });
  };
  positionPacket();
  gsap.set(packet, { autoAlpha: 0 });
  if (response) timeline.call(() => packet.classList.add('is-response'));
  const duration = state.reduceMotion ? 0 : Math.max(0.18, Math.min(0.9, length / 520));
  timeline.to(travel, {
    progress: travelBackwards ? 0 : 1,
    duration,
    ease: 'none',
    onUpdate: positionPacket,
    onComplete: positionPacket,
  });
  if (!state.reduceMotion) timeline.to(path, { strokeDashoffset: travelBackwards ? 14 : -14, duration, ease: 'none' }, '<');
  return timeline;
}

function play(timeline) {
  return new Promise((resolve) => {
    state.activeTimeline = timeline;
    timeline.eventCallback('onComplete', () => {
      if (state.activeTimeline === timeline) state.activeTimeline = null;
      syncPauseButton();
      resolve();
    });
    timeline.play(0);
    syncPauseButton();
  });
}

function syncPauseButton() {
  const button = document.querySelector('#pause-button');
  const timeline = state.activeTimeline;
  const active = Boolean(timeline);
  const paused = active && timeline.paused();
  button.hidden = !active;
  button.setAttribute('aria-pressed', String(paused));
  document.querySelector('#pause-icon').textContent = paused ? '▶' : 'Ⅱ';
  document.querySelector('#pause-label').textContent = paused ? 'Continuar' : 'Pausar';
  button.title = paused ? 'Continuar a animação do ponto em que parou' : 'Pausar a animação';
  button.classList.toggle('is-paused', paused);
}

function toggleAnimationPause() {
  const timeline = state.activeTimeline;
  if (!timeline) return;
  if (timeline.paused()) timeline.play();
  else timeline.pause();
  syncPauseButton();
}

function nodesForEvent(event, route) {
  const defaults = [];
  let customTypes = [];
  if (event.step === 'authentication') { defaults.push(['authentication', nodes.authentication]); customTypes = ['authentication']; }
  else if (event.step === 'resource lookup') { defaults.push(['lookup', nodes.lookup]); customTypes = ['api', 'database']; }
  else if (event.step === 'active backend policy' || event.step === 'object authorization') { defaults.push(['authorization', nodes.authorization]); customTypes = ['authorization']; }
  else if (event.step === 'response') { defaults.push(['response', nodes.response]); customTypes = ['response']; }
  const active = defaults.filter(([id]) => route.includes(id)).map(([, node]) => node);
  state.customObjects.forEach((item) => {
    if (!customTypes.includes(item.type) || !route.includes(item.id)) return;
    const node = state.customNodes.get(item.id);
    if (node) active.push(node);
  });
  return active;
}

function paintTraceEvent(event, body, route) {
  if (event.step === 'authentication') {
    const title = event.state === 'passed' ? 'Identidade confirmada' : 'Token recusado';
    if (route.includes('authentication')) setNodeState(nodes.authentication, event.state, title, event.detail);
    updateCustomRuntime('authentication', `${title} · ${event.detail}`, event.state, route);
  } else if (event.step === 'resource lookup') {
    const title = event.state === 'found' ? `Perfil ${body.data?.name || 'encontrado'}` : 'Perfil não existe';
    if (route.includes('lookup')) setNodeState(nodes.lookup, '', title, event.detail);
    updateCustomRuntime('api', `${title} · ${event.detail}`, '', route);
    updateCustomRuntime('database', `${title} · ${event.detail}`, '', route);
  } else if (event.step === 'active backend policy') {
    const title = event.state === 'active' ? 'Regra ligada' : 'Regra ignorada';
    if (route.includes('authorization')) {
      document.querySelector('#gate-icon').textContent = event.state === 'active' ? '◇' : '↗';
      setNodeState(nodes.authorization, event.state, title, event.detail);
    }
    updateCustomRuntime('authorization', `${title} · ${event.detail}`, event.state, route);
  } else if (event.step === 'object authorization') {
    const labels = { allowed: 'Proprietário confirmado', denied: 'Pedido bloqueado', skipped: 'Objeto passou sem regra' };
    const title = labels[event.state] || event.state;
    if (route.includes('authorization')) setNodeState(nodes.authorization, event.state, title, event.detail);
    updateCustomRuntime('authorization', `${title} · ${event.detail}`, event.state, route);
  } else if (event.step === 'response') {
    const code = event.detail.replace('HTTP ', '');
    const title = code === '200' ? (body.data ? `Perfil ${body.data.name} retornou` : 'Resposta recebida')
      : code === '401' ? 'Pedido sem identidade'
        : code === '403' ? 'Perfil protegido'
          : code === '404' ? 'Perfil inexistente' : `HTTP ${code}`;
    const detail = body.data ? `ID ${body.data.id} · ${body.data.role}` : body.message || body.error || 'Sem dados de perfil.';
    if (route.includes('response')) {
      setNodeState(nodes.response, event.state, title, detail);
      document.querySelector('#outcome-code').textContent = code;
      document.querySelector('#outcome-mark').textContent = code === '200' ? '↗' : code === '403' ? '⊘' : '×';
      state.customObjects.filter((item) => item.type === 'response' && route.includes(item.id)).forEach((item) => {
        const node = state.customNodes.get(item.id);
        const role = (name) => node?.querySelector(`[data-role="${name}"]`);
        if (role('outcome-code')) role('outcome-code').textContent = code;
        if (role('outcome-mark')) role('outcome-mark').textContent = code === '200' ? '↗' : code === '403' ? '⊘' : '×';
      });
    }
    updateCustomRuntime('response', `${title} · ${detail}`, event.state, route);
  }
}

async function animateTrace(trace, body) {
  const timeline = makeTimeline();
  const flow = executionPathState();
  if (!flow.connected) throw new Error('O fluxo foi desconectado antes da animação.');
  const events = trace || [];
  const stageForEvent = (event) => event.step === 'authentication' ? 1
    : event.step === 'resource lookup' ? 2
      : event.step === 'active backend policy' || event.step === 'object authorization' ? 3
        : event.step === 'response' ? 4 : 0;
  const traceStop = events.find((event) => event.step === 'authentication' && event.state !== 'passed')
    || events.find((event) => event.step === 'resource lookup' && event.state !== 'found')
    || events.find((event) => event.step === 'object authorization' && event.state === 'denied');
  const stopAt = traceStop ? stageForEvent(traceStop) : 4;
  const stageForNode = { client: 0, authentication: 1, lookup: 2, authorization: 3, response: 4 };
  state.customObjects.forEach((item) => {
    const stage = { authentication: 1, api: 2, database: 2, authorization: 3, response: 4 }[item.type];
    if (stage) stageForNode[item.id] = stage;
  });
  const traceApplied = new Set();
  const routeNodes = flow.route;
  const appendTraceStage = (stage) => {
    const stageEvents = events.map((event, index) => ({ event, index }))
      .filter(({ event, index }) => !traceApplied.has(index) && stageForEvent(event) === stage);
    if (!stageEvents.length) return;
    timeline.call(() => stageEvents.forEach(({ event, index }) => {
      traceApplied.add(index);
      paintTraceEvent(event, body, routeNodes);
      nodesForEvent(event, routeNodes).forEach((node) => {
        node.classList.remove('is-active');
      });
    }));
    [...new Set(stageEvents.flatMap(({ event }) => nodesForEvent(event, routeNodes)))].forEach((node) => {
      timeline.fromTo(node, { scale: 1 }, { scale: 1.04, duration: state.reduceMotion ? 0 : 0.14, yoyo: true, repeat: 1, transformOrigin: '50% 50%' });
    });
  };

  gsap.set(packet, { autoAlpha: 0, scale: 1 });
  const startNode = nodes[flow.route[0]] || state.customNodes.get(flow.route[0]);
  startNode?.classList.add('is-active');
  let lastIndex = 0;
  for (let index = 1; index < flow.route.length; index += 1) {
    const next = flow.route[index];
    const stage = stageForNode[next] || 0;
    if (stage > stopAt) break;
    const nextIsClient = next === 'client' || state.customObjects.some((item) => item.id === next && item.type === 'client');
    const previousStage = stageForNode[flow.route[index - 1]] || 0;
    const isResponseReturn = nextIsClient && previousStage === 4;
    addWireTravel(timeline, flow.route[index - 1], next, { response: isResponseReturn });
    lastIndex = index;
    timeline.call(() => {
      const node = nodes[next] || state.customNodes.get(next);
      node?.classList.add('is-active');
      document.querySelector('#scene-caption').textContent = `Pacote seguindo o fio até ${flowName(next)}.`;
    });
    appendTraceStage(stage);
    if (nextIsClient) break;
    if (stage === stopAt && traceStop) break;
  }

  if (traceStop) {
    const deniedAtAuthorization = events.some((event) => event.step === 'object authorization' && event.state === 'denied');
    const responseIndex = deniedAtAuthorization
      ? routeNodes.findIndex((id, index) => index > lastIndex && stageForNode[id] === 4)
      : -1;
    if (responseIndex > lastIndex) {
      const responseId = routeNodes[responseIndex];
      addWireTravel(timeline, routeNodes[lastIndex], responseId, { response: true });
      timeline.call(() => {
        const responseNode = nodes[responseId] || state.customNodes.get(responseId);
        responseNode?.classList.add('is-active');
        document.querySelector('#scene-caption').textContent = `A autorização bloqueou o pedido. A resposta segue pelo retorno até ${flowName(responseId)}.`;
      });
      lastIndex = responseIndex;
      appendTraceStage(4);
      for (let index = responseIndex + 1; index < routeNodes.length; index += 1) {
        const next = routeNodes[index];
        const isClient = next === 'client' || state.customObjects.some((item) => item.id === next && item.type === 'client');
        addWireTravel(timeline, routeNodes[index - 1], next, { response: true });
        timeline.call(() => {
          const node = nodes[next] || state.customNodes.get(next);
          node?.classList.add('is-active');
          document.querySelector('#scene-caption').textContent = isClient
            ? 'Resposta 403 percorreu o fio de retorno e chegou ao cliente.'
            : `Resposta seguindo o retorno até ${flowName(next)}.`;
        });
        if (isClient) break;
      }
    } else {
      for (let index = lastIndex; index > 0; index -= 1) {
        addWireTravel(timeline, flow.route[index], flow.route[index - 1], { response: true });
      }
    }
  }
  events.forEach((event, index) => {
    if (event.step !== 'response' || traceApplied.has(index)) return;
    traceApplied.add(index);
    timeline.call(() => paintTraceEvent(event, body, routeNodes));
    nodesForEvent(event, routeNodes).forEach((node) => {
      timeline.fromTo(node, { scale: 1 }, { scale: 1.04, duration: state.reduceMotion ? 0 : 0.14, yoyo: true, repeat: 1, transformOrigin: '50% 50%' });
    });
  });
  timeline.call(() => {
    Object.values(nodes).forEach((node) => node.classList.remove('is-active'));
    state.customNodes.forEach((node) => node.classList.remove('is-active'));
    packet.classList.remove('is-response');
    gsap.set(packet, { autoAlpha: 0 });
  });
  await play(timeline);
}

function summaryFor(result) {
  const { status, policy, authId, body } = result;
  if (status === 401) return 'A API recusou o pedido: faltou um token válido.';
  if (status === 400) return 'A API recusou o identificador enviado.';
  if (status === 404) return 'Esse perfil não existe.';
  if (status === 403) return `${identities[authId]?.name || 'O usuário'} não é proprietário deste perfil.`;
  if (status === 200 && !policy && authId && authId !== result.targetId) return `${body.data.name} foi entregue sem checagem de propriedade.`;
  if (status === 200) return `A API entregou o perfil de ${body.data.name}.`;
  return `Resposta HTTP ${status}.`;
}

function updateResponse(result, elapsed) {
  const badge = document.querySelector('#response-status');
  badge.textContent = `HTTP ${result.status}`;
  badge.className = `status-code ${result.status >= 400 ? 'bad' : result.status === 200 && !result.policy && result.authId !== result.targetId ? 'warn' : ''}`;
  document.querySelector('#result-message').textContent = summaryFor(result);
  const request = result.body.request || {};
  document.querySelector('#result-meta').textContent = `${request.method || 'GET'} ${request.path || ''} · ${request.durationMs ?? '—'} ms no servidor · ${elapsed.toFixed(1)} ms no painel`;
  document.querySelector('#response-body').textContent = JSON.stringify(result.body, null, 2);
  document.querySelector('#scene-request-id').textContent = request.id ? `request ${request.id}` : 'sem request ID';
}

function appendHistory(result) {
  state.history.unshift(result);
  const body = document.querySelector('#history-body');
  body.replaceChildren();
  for (const item of state.history) {
    const row = document.createElement('tr');
    const fields = [item.time, item.requestId, item.identity, `ID ${item.targetId}`, item.policy ? 'ativa' : 'ignorada', `HTTP ${item.status}`];
    fields.forEach((value, index) => {
      const cell = document.createElement('td');
      cell.textContent = value || '—';
      if (index === 1) cell.className = 'history-code';
      if (index === 5) cell.className = `history-status ${item.status >= 400 ? 'bad' : !item.policy && item.status === 200 && item.authId !== item.targetId ? 'warn' : ''}`;
      row.append(cell);
    });
    body.append(row);
  }
  document.querySelector('#history-count').textContent = String(state.history.length).padStart(2, '0');
  document.querySelector('#clear-history').disabled = false;
}

async function setPolicy(enabled) {
  const response = await fetch('/api/lab/policy', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enforceAuthorization: enabled }),
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Falha ao alterar regra (${response.status}).`);
  state.policy = body.enforceAuthorization;
  syncPolicy();
}

function showDisconnectedFlow(missing) {
  const from = flowName(missing.from);
  const to = flowName(missing.to);
  resetNodes();
  document.querySelector('#outcome-code').textContent = '—';
  document.querySelector('#outcome-mark').textContent = '×';
  document.querySelector('#outcome-state').textContent = 'fluxo interrompido';
  document.querySelector('#outcome-detail').textContent = `Conecte ${from} a ${to}.`;
  document.querySelector('#response-status').textContent = 'SEM FIO';
  document.querySelector('#response-status').className = 'status-code bad';
  document.querySelector('#result-message').textContent = 'Pedido não enviado: a cadeia de conexões está incompleta.';
  document.querySelector('#result-meta').textContent = `Falta uma ligação de ${from} para ${to}. Nenhuma chamada HTTP foi feita.`;
  document.querySelector('#response-body').textContent = JSON.stringify({ sent: false, reason: 'incomplete_flow', missingConnection: `${from} → ${to}` }, null, 2);
  document.querySelector('#scene-caption').textContent = `Execução parada: ligue ${from} a ${to} para continuar.`;
  document.querySelector('#scene-request-id').textContent = 'sem request ID';
  (nodes[missing.from] || state.customNodes.get(missing.from))?.classList.add('connection-gap');
  (nodes[missing.to] || state.customNodes.get(missing.to))?.classList.add('connection-gap');
}

async function executeRequest(targetId = state.targetId, policy = state.policy) {
  const pathState = executionPathState();
  if (!pathState.connected) {
    showDisconnectedFlow(pathState.missing);
    return null;
  }
  if (!targetId) {
    document.querySelector('#scene-caption').textContent = 'Arraste um perfil até a rota para começar.';
    return null;
  }
  await setPolicy(policy);
  state.targetId = String(targetId);
  document.querySelector('#target-id').value = state.targetId;
  resetNodes();

  const identity = state.userId;
  const target = state.targetId;
  const withoutToken = state.noAuth;
  const headers = {};
  if (!withoutToken) headers.Authorization = `Bearer ${identities[identity].token}`;
  const endpoint = `/api/users/${encodeURIComponent(target)}`;
  const started = performance.now();
  const pending = fetch(endpoint, { method: 'GET', headers, cache: 'no-store' })
    .then(async (response) => ({ response, body: await response.json() }))
    .catch((error) => ({ error }));

  nodes.client.classList.add('is-active');
  document.querySelector('#scene-caption').textContent = `GET ${endpoint} enviado. Aguardando a resposta da API…`;
  const received = await pending;
  if (received.error) {
    const errorBody = { error: 'API indisponível', message: received.error.message };
    document.querySelector('#scene-caption').textContent = 'O pedido saiu, mas não chegou uma resposta HTTP.';
    document.querySelector('#outcome-code').textContent = 'OFF';
    document.querySelector('#outcome-mark').textContent = '×';
    setNodeState(nodes.response, 'denied', 'Servidor não respondeu', errorBody.message);
    document.querySelector('#response-status').textContent = 'SEM RESPOSTA';
    document.querySelector('#response-status').className = 'status-code bad';
    document.querySelector('#result-message').textContent = errorBody.error;
    document.querySelector('#response-body').textContent = JSON.stringify(errorBody, null, 2);
    return { status: 0, body: errorBody, policy, authId: withoutToken ? '' : identity, targetId: target };
  }

  const elapsed = performance.now() - started;
  const { response, body } = received;
  const result = { status: response.status, policy, authId: withoutToken ? '' : identity, targetId: target, body };
  await animateTrace(body.trace, body);
  updateResponse(result, elapsed);
  document.querySelector('#scene-caption').textContent = summaryFor(result);
  appendHistory({
    time: new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date()),
    requestId: body.request?.id,
    identity: withoutToken ? 'sem token' : identities[identity].name,
    authId: result.authId,
    targetId: target,
    policy,
    status: response.status,
  });
  return result;
}

function renderComparison(first, second) {
  const root = document.querySelector('#comparison-results');
  root.replaceChildren();
  [
    { title: 'REGRA IGNORADA', result: first },
    { title: 'PROPRIETÁRIO CONFERIDO', result: second },
  ].forEach(({ title, result }) => {
    const card = document.createElement('article');
    const cross = result.status === 200 && result.authId && result.authId !== result.targetId;
    card.className = `compare-tile ${cross ? 'cross-open' : result.status === 403 ? 'cross-blocked' : ''}`;
    const label = document.createElement('small'); label.textContent = title;
    const code = document.createElement('strong'); code.textContent = result.status ? `HTTP ${result.status}` : 'SEM RESPOSTA';
    const text = document.createElement('b'); text.textContent = cross ? 'O perfil atravessou sem autorização' : result.status === 403 ? 'A API interrompeu o acesso' : result.body.data ? `Perfil de ${result.body.data.name} retornado` : result.body.error || 'Sem perfil no corpo';
    const request = document.createElement('p'); request.textContent = `GET /api/users/${result.targetId} · ${result.body.request?.id || 'sem request ID'}`;
    card.append(label, code, text, request);
    root.append(card);
  });
}

function storeCases() {
  localStorage.setItem('securitylab-cases-v1', JSON.stringify(state.cases));
  renderCases();
}

function renderCases() {
  const root = document.querySelector('#case-list');
  root.replaceChildren();
  if (!state.cases.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-cases';
    empty.textContent = 'Nenhum caso preparado. Os casos ficam salvos neste navegador.';
    root.append(empty);
    return;
  }
  state.cases.forEach((testCase) => {
    const card = document.createElement('article');
    card.className = 'saved-case';
    const info = document.createElement('div');
    info.className = 'saved-case-info';
    const title = document.createElement('b'); title.textContent = testCase.name;
    const summary = document.createElement('small');
    summary.textContent = `${testCase.noAuth ? 'sem token' : identities[testCase.userId].name} → ${profiles[testCase.targetId]} · ID ${testCase.targetId} · ${testCase.policy ? 'proprietário verificado' : 'regra ignorada'}`;
    info.append(title, summary);
    const actions = document.createElement('div'); actions.className = 'saved-case-actions';
    const load = document.createElement('button'); load.type = 'button'; load.textContent = 'Carregar';
    load.addEventListener('click', () => withBusy(async () => {
      state.userId = testCase.userId || '1';
      state.noAuth = Boolean(testCase.noAuth);
      state.targetId = String(testCase.targetId);
      document.querySelector('#target-id').value = state.targetId;
      syncClient();
      state.policy = Boolean(testCase.policy);
      syncPolicy();
      setObjectSelection('profile', state.targetId);
      resetNodes();
      sendButton.disabled = !hasExecutionPath();
      compareButton.disabled = !hasExecutionPath();
    }));
    const run = document.createElement('button'); run.type = 'button'; run.className = 'run-case'; run.textContent = 'Executar ↗';
    run.addEventListener('click', () => withBusy(async () => {
      state.userId = testCase.userId || '1';
      state.noAuth = Boolean(testCase.noAuth);
      state.targetId = String(testCase.targetId);
      document.querySelector('#target-id').value = state.targetId;
      syncClient();
      setObjectSelection('profile', state.targetId);
      await executeRequest(state.targetId, Boolean(testCase.policy));
    }));
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-case'; remove.setAttribute('aria-label', `Excluir caso ${testCase.name}`); remove.textContent = '×';
    remove.addEventListener('click', () => { state.cases = state.cases.filter((item) => item.id !== testCase.id); storeCases(); });
    actions.append(load, run, remove);
    card.append(info, actions);
    root.append(card);
  });
}

function createCase(event) {
  event.preventDefault();
  const name = document.querySelector('#case-name').value.trim();
  if (!name) return;
  const user = document.querySelector('#case-user').value;
  state.cases.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    userId: user === 'none' ? '1' : user,
    noAuth: user === 'none',
    targetId: document.querySelector('#case-profile').value,
    policy: document.querySelector('#case-policy').value === 'true',
  });
  storeCases();
  document.querySelector('#case-name').value = '';
}

function loadCases() {
  try {
    const saved = JSON.parse(localStorage.getItem('securitylab-cases-v1') || '[]');
    state.cases = Array.isArray(saved) ? saved
      .filter((item) => item && typeof item.name === 'string' && item.name.trim() && profiles[String(item.targetId)])
      .map((item) => ({
        id: String(item.id || `${Date.now()}-${Math.random()}`),
        name: item.name.slice(0, 48),
        userId: identities[String(item.userId)] ? String(item.userId) : '1',
        noAuth: Boolean(item.noAuth),
        targetId: String(item.targetId),
        policy: Boolean(item.policy),
      })) : [];
  } catch { state.cases = []; }
  renderCases();
}

document.querySelector('#case-form').addEventListener('submit', createCase);
document.querySelector('#case-user').addEventListener('change', (event) => {
  if (event.target.value === 'none') document.querySelector('#case-policy').value = 'true';
});
document.querySelector('#select-tool').addEventListener('click', () => setTool('select'));
document.querySelector('#wire-tool').addEventListener('click', () => setTool(state.tool === 'wire' ? 'select' : 'wire'));
document.querySelector('#arrow-tool').addEventListener('click', () => setTool(state.tool === 'arrow' ? 'select' : 'arrow'));
world.addEventListener('click', handleCanvasClick);
document.querySelector('#zoom-out').addEventListener('click', () => setZoom(state.zoom / 1.15));
document.querySelector('#zoom-in').addEventListener('click', () => setZoom(state.zoom * 1.15));
document.querySelector('#zoom-fit').addEventListener('click', fitCanvasContent);
document.querySelector('#delete-selection').addEventListener('click', deleteSelection);
document.querySelector('#restore-wires').addEventListener('click', () => {
  state.hiddenWires = {};
  const incident = {
    client: ['wire-client-auth', 'wire-response'],
    authentication: ['wire-client-auth', 'wire-auth-request'],
    lookup: ['wire-auth-request', 'wire-request-gate'],
    authorization: ['wire-request-gate', 'wire-gate-outcome'],
    response: ['wire-gate-outcome', 'wire-response'],
  };
  state.removedNodes.forEach((key) => (incident[key] || []).forEach((id) => { state.hiddenWires[id] = true; }));
  state.selectedWireId = '';
  localStorage.setItem('securitylab-board-hidden-wires-v1', JSON.stringify(state.hiddenWires));
  refreshWires();
});

async function runComparison() {
  return withBusy(async () => {
    state.noAuth = false;
    syncClient();
    const first = await executeRequest(state.targetId, false);
    const second = await executeRequest(state.targetId, true);
    if (first && second) renderComparison(first, second);
  });
}

async function withBusy(task) {
  if (state.busy) return;
  state.busy = true;
  setBusyVisual(true);
  try { await task(); }
  catch (error) { document.querySelector('#scene-caption').textContent = `Não foi possível executar: ${error.message}`; }
  finally { state.busy = false; setBusyVisual(false); }
}

function setBusyVisual(busy) {
  sendButton.disabled = busy || !state.targetId || !hasExecutionPath();
  compareButton.disabled = busy || !state.targetId || !hasExecutionPath();
  document.querySelector('#play-label').textContent = busy ? 'Executando…' : 'Reproduzir fluxo';
  document.querySelector('.play-icon').textContent = busy ? 'Ⅱ' : '▶';
  sendButton.classList.toggle('is-playing', busy);
  document.querySelectorAll('.object-card').forEach((card) => { card.disabled = busy; });
  document.querySelectorAll('.policy-toggle, .custom-policy-toggle').forEach((button) => { button.disabled = busy; });
  document.querySelector('#reset-board').disabled = busy;
}

function applyIdentity(value) {
  if (value === 'none') {
    state.noAuth = true;
  } else {
    state.noAuth = false;
    state.userId = value;
  }
  syncClient();
  resetNodes();
}

function applyProfile(value, shouldRun = false) {
  state.targetId = value;
  document.querySelector('#target-id').value = value;
  setObjectSelection('profile', value);
  document.querySelector('#record-state').textContent = `Perfil ${profiles[value]}`;
  document.querySelector('#record-detail').textContent = 'Objeto recebido. Preparando GET /api/users/' + value;
  syncCustomContainers();
  sendButton.disabled = !hasExecutionPath();
  compareButton.disabled = !hasExecutionPath();
  document.querySelector('#scene-caption').textContent = shouldRun
    ? `Perfil ${profiles[value]} encaixado na rota.`
    : `Perfil ${profiles[value]} pronto. Pressione Reproduzir fluxo para enviar.`;
  if (shouldRun) withBusy(() => executeRequest(value, state.policy));
}

let drag = null;
let suppressClickUntil = 0;
function startDrag(event, card) {
  if (state.busy || event.button !== 0) return;
  const rect = card.getBoundingClientRect();
  drag = { type: card.dataset.dragType, id: card.dataset.id || '', card, startX: event.clientX, startY: event.clientY, offsetX: rect.width / 2, offsetY: rect.height / 2, active: false };
  card.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!drag) return;
  if (!drag.active) {
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6) return;
    drag.active = true;
    drag.ghost = document.createElement('div');
    drag.ghost.className = 'drag-ghost';
    drag.ghost.textContent = drag.card.querySelector('.object-name b').textContent;
    document.body.append(drag.ghost);
    drag.card.classList.add('being-dragged');
  }
  gsap.set(drag.ghost, { x: event.clientX - drag.offsetX, y: event.clientY - drag.offsetY });
  document.querySelectorAll('.drop-zone.is-drop-target').forEach((zone) => zone.classList.remove('is-drop-target'));
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.drop-zone');
  if (target && acceptsDrop(target.dataset.drop, drag.type)) target.classList.add('is-drop-target');
}

function acceptsDrop(zone, type) {
  return (zone === 'identity' && type === 'identity') || (zone === 'profile' && type === 'profile') || (zone === 'policy' && type === 'policy');
}

function endDrag(event) {
  if (!drag) return;
  const current = drag;
  drag = null;
  if (!current.active) return;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.drop-zone');
  const onBoard = flowViewport.contains(document.elementFromPoint(event.clientX, event.clientY));
  current.ghost.remove();
  current.card.classList.remove('being-dragged');
  document.querySelectorAll('.drop-zone.is-drop-target').forEach((zone) => zone.classList.remove('is-drop-target'));
  suppressClickUntil = Date.now() + 350;
  if ((current.type === 'note' || current.type === 'step' || current.type === 'component') && onBoard) {
    createCustomObject({ type: current.type === 'component' ? current.id : current.type }, worldPoint(event));
    return;
  }
  if (!target || !acceptsDrop(target.dataset.drop, current.type)) return;
  if (current.type === 'identity') applyIdentity(current.id);
  if (current.type === 'profile') applyProfile(current.id, false);
  if (current.type === 'policy') withBusy(async () => { await setPolicy(true); resetNodes(); });
}

function enablePointerDrag(card) {
  card.addEventListener('pointerdown', (event) => startDrag(event, card));
  card.addEventListener('pointermove', moveDrag);
  card.addEventListener('pointerup', endDrag);
  card.addEventListener('pointercancel', endDrag);
  card.addEventListener('click', () => {
    if (state.busy || Date.now() < suppressClickUntil) return;
    if (card.dataset.dragType === 'note' || card.dataset.dragType === 'step' || card.dataset.dragType === 'component') {
      const rect = flowViewport.getBoundingClientRect();
      createCustomObject({ type: card.dataset.dragType === 'component' ? card.dataset.id : card.dataset.dragType }, worldPoint({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }));
    }
    if (card.dataset.dragType === 'identity') applyIdentity(card.dataset.id);
    if (card.dataset.dragType === 'profile') applyProfile(card.dataset.id, false);
    if (card.dataset.dragType === 'policy') withBusy(async () => { await setPolicy(true); resetNodes(); });
  });
}

document.querySelectorAll('.object-card').forEach(enablePointerDrag);
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

let movingNode = null;
let suppressGateClickUntil = 0;
function startNodeMove(event, node, grip) {
  if (state.busy || state.spaceHeld || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  if (node.dataset.boardId) {
    state.selectedObjectId = node.dataset.boardId;
    state.selectedArrowId = '';
    state.selectedWireId = '';
    updateCanvasSelection();
  }
  movingNode = { node, grip, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false };
  grip.setPointerCapture(event.pointerId);
}
function moveNode(event) {
  if (!movingNode) return;
  const delta = Math.hypot(event.clientX - movingNode.startX, event.clientY - movingNode.startY);
  if (!movingNode.active && delta < 3) return;
  movingNode.active = true;
  movingNode.node.classList.add('moving-node');
  world.classList.add('is-arranging');
  const bounds = world.getBoundingClientRect();
  const width = logicalWorld.width;
  const height = logicalWorld.height;
  const halfWidth = movingNode.node.getBoundingClientRect().width / state.zoom / 2;
  const halfHeight = movingNode.node.getBoundingClientRect().height / state.zoom / 2;
  const x = Math.min(width - halfWidth - 8, Math.max(halfWidth + 8, (event.clientX - bounds.left) / state.zoom));
  const y = Math.min(height - halfHeight - 18, Math.max(halfHeight + 24, (event.clientY - bounds.top) / state.zoom));
  movingNode.node.style.left = `${x / width * 100}%`;
  movingNode.node.style.top = `${y / height * 100}%`;
  movingNode.node.style.transform = 'translate(-50%, -50%)';
  refreshWires();
}
function endNodeMove() {
  if (!movingNode) return;
  const current = movingNode;
  movingNode = null;
  current.node.classList.remove('moving-node');
  world.classList.remove('is-arranging');
  if (current.active) {
    persistLayout();
    persistCustomObjects();
    suppressGateClickUntil = Date.now() + 250;
  }
}
Object.entries(nodes).forEach(([key, node]) => {
  installConnectorHandles(node);
  const grip = node.querySelector('.move-grip');
  grip.addEventListener('pointerdown', (event) => startNodeMove(event, node, grip));
  grip.addEventListener('pointermove', moveNode);
  grip.addEventListener('pointerup', endNodeMove);
  grip.addEventListener('pointercancel', endNodeMove);
  grip.addEventListener('keydown', (event) => {
    const directions = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] };
    const delta = directions[event.key];
    if (!delta) return;
    event.preventDefault();
    const point = nodePoint(node);
    const halfWidth = node.getBoundingClientRect().width / state.zoom / 2;
    const halfHeight = node.getBoundingClientRect().height / state.zoom / 2;
    const x = Math.min(logicalWorld.width - halfWidth - 8, Math.max(halfWidth + 8, point.x + delta[0]));
    const y = Math.min(logicalWorld.height - halfHeight - 18, Math.max(halfHeight + 24, point.y + delta[1]));
    setNodePosition(key, { x: x / logicalWorld.width * 100, y: y / logicalWorld.height * 100 });
    persistLayout();
  });
});

document.querySelector('#policy-toggle').addEventListener('click', () => withBusy(async () => { await setPolicy(!state.policy); resetNodes(); }));
nodes.authorization.addEventListener('click', (event) => {
  if (state.tool === 'arrow' || Date.now() < suppressGateClickUntil || event.target.closest('button, .move-grip')) return;
  document.querySelector('#policy-toggle').click();
});
sendButton.addEventListener('click', () => {
  if (!hasExecutionPath()) {
    showDisconnectedFlow(executionPathState().missing);
    return;
  }
  if (!state.targetId) {
    document.querySelector('#scene-caption').textContent = 'Escolha um perfil antes de reproduzir o fluxo.';
    return;
  }
  withBusy(() => executeRequest(state.targetId, state.policy));
});
document.querySelector('#pause-button').addEventListener('click', toggleAnimationPause);
compareButton.addEventListener('click', runComparison);
document.querySelector('#reset-board').addEventListener('click', () => withBusy(async () => {
  resetLayout();
  requestAnimationFrame(() => { flowViewport.scrollLeft = 0; flowViewport.scrollTop = 0; });
  applyIdentity('1');
  state.targetId = '';
  document.querySelector('#target-id').value = '';
  setObjectSelection('profile', '');
  await setPolicy(true);
  document.querySelector('#comparison-results').innerHTML = '<div class="comparison-placeholder">Os dois resultados reais vão aparecer aqui.<br>Caio → perfil 2 é o exemplo clássico.</div>';
  resetNodes();
  sendButton.disabled = true;
  compareButton.disabled = true;
}));
document.querySelector('#clear-history').addEventListener('click', () => {
  state.history = [];
  document.querySelector('#history-body').innerHTML = '<tr><td colspan="6" class="empty-history">As chamadas desta sessão aparecem aqui.</td></tr>';
  document.querySelector('#history-count').textContent = '00';
  document.querySelector('#clear-history').disabled = true;
});

async function initialize() {
  try {
    const [statusResponse, policyResponse] = await Promise.all([fetch('/api/status'), fetch('/api/lab/policy')]);
    if (!statusResponse.ok || !policyResponse.ok) throw new Error('API indisponível');
    const policy = await policyResponse.json();
    state.policy = policy.enforceAuthorization;
    syncClient();
    syncPolicy();
    document.querySelector('#server-status').textContent = 'API conectada';
  } catch {
    document.querySelector('#server-status').textContent = 'API indisponível';
    document.querySelector('.state-dot').classList.add('offline');
  }
  resetNodes();
  sendButton.disabled = true;
  compareButton.disabled = true;
}

installDefaultDeleteButtons();
applySavedLayout();
setTool('select');
try {
  const savedObjects = JSON.parse(localStorage.getItem(customObjectsKey) || '[]');
  if (Array.isArray(savedObjects)) savedObjects.filter((item) => item && typeof item.title === 'string').forEach((item) => createCustomObject({ ...item, restore: true }));
} catch { state.customObjects = []; state.customNodes.clear(); }
loadCases();
requestAnimationFrame(fitCanvasContent);
document.querySelector('#zoom-label').textContent = '100%';
window.addEventListener('resize', refreshWires);
initialize();
