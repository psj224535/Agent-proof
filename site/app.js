'use strict';

const grid = document.querySelector('#agent-grid');
const emptyState = document.querySelector('#empty-state');
const search = document.querySelector('#agent-search');
const roleFilter = document.querySelector('#role-filter');
let agents = [];

function shortAddress(value) {
  return value ? `${value.slice(0, 8)}…${value.slice(-6)}` : '—';
}

function text(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function link(label, href, className = '') {
  const node = document.createElement('a');
  node.textContent = label;
  node.href = href;
  node.className = className;
  node.target = '_blank';
  node.rel = 'noreferrer';
  return node;
}

function copyButton(value, label) {
  const button = text('button', label, 'copy-button');
  button.type = 'button';
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(value);
      button.textContent = '복사됨';
      setTimeout(() => { button.textContent = label; }, 1300);
    } catch {
      button.textContent = '복사 실패';
    }
  });
  return button;
}

function agentCard(agent) {
  const article = document.createElement('article');
  article.className = 'agent-card';

  const top = document.createElement('div');
  top.className = 'card-top';
  const avatar = document.createElement('div');
  avatar.className = 'agent-avatar';
  if (agent.image) {
    const image = document.createElement('img');
    image.src = agent.image;
    image.alt = '';
    avatar.append(image);
  } else {
    avatar.textContent = agent.name.slice(0, 2).toUpperCase();
  }
  const identity = document.createElement('div');
  identity.className = 'agent-identity';
  const labels = document.createElement('div');
  labels.className = 'labels';
  labels.append(text('span', agent.role, 'role-chip'));
  labels.append(text('span', agent.status === 'registered' ? 'Registered' : 'Draft', 'role-chip'));
  labels.append(text('span', agent.active ? 'Active' : 'Inactive', agent.active ? 'status-chip active' : 'status-chip'));
  identity.append(labels, text('h3', agent.name), text('p', agent.description));
  top.append(avatar, identity);

  const facts = document.createElement('dl');
  facts.className = 'facts';
  for (const [label, value] of [
    ['Agent ID', agent.agentId ? `#${agent.agentId}` : '등록 전'],
    ['Network', agent.network],
    ['Owner', shortAddress(agent.owner)]
  ]) {
    const item = document.createElement('div');
    item.append(text('dt', label), text('dd', value));
    facts.append(item);
  }

  const services = document.createElement('div');
  services.className = 'services';
  services.append(text('span', 'Services', 'services-label'));
  for (const service of agent.services) services.append(text('span', service, 'service-chip'));

  const primary = document.createElement('div');
  primary.className = 'primary-actions';
  if (agent.scanUrl) primary.append(link('8004scan에서 확인 ↗', agent.scanUrl, 'primary-link'));
  if (agent.explorerUrl) primary.append(link('Etherscan ↗', agent.explorerUrl, 'secondary-link'));

  const documents = document.createElement('div');
  documents.className = 'document-actions';
  if (agent.registrationUrl) documents.append(link('Registration JSON', agent.registrationUrl));
  if (agent.cardUrl) documents.append(link('A2A Agent Card', agent.cardUrl));
  if (agent.owner) documents.append(copyButton(agent.owner, 'Owner 복사'));

  article.append(top, facts, services, primary, documents);
  return article;
}

function render() {
  const query = search.value.trim().toLowerCase();
  const role = roleFilter.value;
  const visible = agents.filter(agent => {
    const haystack = [agent.name, agent.role, agent.description, agent.agentId, agent.owner, ...agent.services].join(' ').toLowerCase();
    return (!query || haystack.includes(query)) && (!role || agent.role === role);
  });

  grid.replaceChildren(...visible.map(agentCard));
  emptyState.hidden = visible.length !== 0;
}

async function start() {
  try {
    const response = await fetch('agents.json', {cache: 'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Agent catalog must be an array');
    agents = data;

    document.querySelector('#agent-count').textContent = String(agents.length);
    document.querySelector('#active-count').textContent = String(agents.filter(agent => agent.active).length);
    document.querySelector('#network-count').textContent = String(new Set(agents.map(agent => agent.chainId)).size);

    for (const role of [...new Set(agents.map(agent => agent.role))].sort()) {
      const option = document.createElement('option');
      option.value = role;
      option.textContent = role;
      roleFilter.append(option);
    }
    render();
  } catch (error) {
    grid.replaceChildren(text('p', `Agent 카탈로그를 불러오지 못했습니다: ${error.message}`, 'load-error'));
  }
}

search.addEventListener('input', render);
roleFilter.addEventListener('change', render);
start();
