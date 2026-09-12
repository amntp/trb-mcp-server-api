#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  tcApiCall,
  storeSessionToken,
  getSessionToken,
  clearSessionToken,
  type Region,
  type ApiType,
  VALID_REGIONS,
  getCoreBaseUrl,
  getBcfBaseUrl,
} from "./tc-api-client.js";

import { workspaceApiDocs } from "./data/workspace-api.js";
import { restApiDocs } from "./data/rest-api.js";
import { bcfApiDocs } from "./data/bcf-api.js";
import { viewerApiDocs } from "./data/viewer-api.js";
import { markupApiDocs } from "./data/markup-api.js";
import { viewApiDocs } from "./data/view-api.js";
import { panelsApiDocs } from "./data/panels-api.js";
import { authDocs } from "./data/auth.js";
import { regionsDocs } from "./data/regions.js";
import { extensionsDocs } from "./data/extensions.js";
import { typescriptTypes } from "./data/typescript-types.js";
import { projectSetupDocs } from "./data/project-setup.js";
import { codeExamples } from "./data/code-examples.js";
import { propertySetDocs } from "./data/property-set.js";
import { pitfallsDocs } from "./data/pitfalls.js";
import { restApiExtendedDocs } from "./data/rest-api-extended.js";
import { sdkDocs } from "./data/sdk.js";
import { registerDomainTools } from "./tc-domain-tools.js";
import { registerTcApps, EXT_APPS_SDK_URL, SERVER_ORIGIN } from "./tc-apps.js";
import { registerTcAppsExtra } from "./tc-apps-extra.js";
import {
  storeViewerState,
  getViewerState,
  resolveUserKeys,
  buildBcfViewpoint,
  describeState,
  describeStore,
  type ViewerState,
} from "./viewer-state.js";
import { analyzeTgaSelection } from "./tga-analysis.js";
import { createTcExtensionHtml } from "./tc-extension-html.js";
import { TC_EXTENSION_ICON_BASE64 } from "./tc-extension-icon.js";

// Build a flat searchable index of all documentation sections
interface DocSection {
  category: string;
  key: string;
  title: string;
  content: string;
}

const BCF_DASHBOARD_APP_URI = "ui://trimble-connect/bcf-dashboard.html";
const BCF_CREATE_APP_URI = "ui://trimble-connect/bcf-create.html";

type BcfTopicSummary = {
  guid: string;
  title: string;
  status: string;
  priority: string;
  type: string;
  assignedTo: string;
  created: string;
  modified: string;
};

type BcfDashboardData = {
  projectId: string;
  region: string;
  generatedAt: string;
  total: number;
  showing: number;
  counts: {
    byStatus: Record<string, number>;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
  };
  topics: BcfTopicSummary[];
};

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const candidates = [record.items, record.topics, record.data, record.results];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) {
        return candidate.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
      }
    }
  }
  return [];
}

function toText(value: unknown, fallback = "-"): string {
  if (value === undefined || value === null || value === "") return fallback;
  return String(value);
}

function toDateText(value: unknown): string {
  const text = toText(value, "");
  return text ? text.substring(0, 10) : "-";
}

function incrementCount(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function buildBcfDashboardData(projectId: string, region: string, rawTopics: unknown, limit: number): BcfDashboardData {
  const topics = asRecordArray(rawTopics);
  const summaries = topics.map((topic) => ({
    guid: toText(topic.guid ?? topic.id),
    title: toText(topic.title, "(sans titre)"),
    status: toText(topic.topic_status ?? topic.status),
    priority: toText(topic.priority),
    type: toText(topic.topic_type ?? topic.type),
    assignedTo: toText(topic.assigned_to ?? topic.assignee ?? topic.assignedTo),
    created: toDateText(topic.creation_date ?? topic.created ?? topic.created_at),
    modified: toDateText(topic.modified_date ?? topic.modified ?? topic.modified_at),
  }));

  const counts = {
    byStatus: {} as Record<string, number>,
    byPriority: {} as Record<string, number>,
    byType: {} as Record<string, number>,
  };

  for (const topic of summaries) {
    incrementCount(counts.byStatus, topic.status);
    incrementCount(counts.byPriority, topic.priority);
    incrementCount(counts.byType, topic.type);
  }

  return {
    projectId,
    region,
    generatedAt: new Date().toISOString(),
    total: summaries.length,
    showing: Math.min(limit, summaries.length),
    counts,
    topics: summaries.slice(0, limit),
  };
}

function createBcfDashboardAppHtml(): string {
  return String.raw`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Trimble Connect BCF Dashboard</title>
  <style>
    :root { color-scheme: light; font-family: Inter, "Open Sans", Arial, sans-serif; }
    body { margin: 0; background: #f8fafc; color: #1e293b; }
    .app { padding: 14px; }
    .header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 12px; }
    h1 { font-size: 16px; line-height: 1.2; margin: 0 0 4px; }
    .muted { color: #64748b; font-size: 12px; }
    .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
    .card { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; box-shadow: 0 1px 2px rgba(15,23,42,.04); }
    .card strong { display: block; font-size: 18px; margin-bottom: 2px; }
    .toolbar { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
    input, select, button { border: 1px solid #cbd5e1; border-radius: 8px; background: white; color: #0f172a; font-size: 12px; padding: 7px 9px; }
    input { flex: 1 1 160px; min-width: 0; }
    button { cursor: pointer; font-weight: 600; }
    button.primary { background: #0ea5e9; border-color: #0ea5e9; color: white; }
    table { width: 100%; border-collapse: collapse; background: white; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; font-size: 12px; }
    th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; }
    tr:last-child td { border-bottom: 0; }
    .pill { display: inline-block; padding: 2px 7px; border-radius: 999px; background: #e0f2fe; color: #0369a1; white-space: nowrap; }
    .empty, .error { padding: 18px; border: 1px dashed #cbd5e1; border-radius: 10px; background: white; color: #64748b; }
    .error { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
    @media (max-width: 520px) { .cards { grid-template-columns: 1fr; } th:nth-child(5), td:nth-child(5) { display: none; } }
  </style>
</head>
<body>
  <main class="app">
    <div class="header">
      <div>
        <h1>Dashboard BCF Trimble Connect</h1>
        <div class="muted" id="subtitle">En attente des données...</div>
      </div>
      <button id="refreshBtn" class="primary" type="button">Rafraîchir</button>
    </div>
    <section class="cards">
      <div class="card"><strong id="total">-</strong><span class="muted">BCF au total</span></div>
      <div class="card"><strong id="openCount">-</strong><span class="muted">Ouverts / New</span></div>
      <div class="card"><strong id="highCount">-</strong><span class="muted">Priorité haute</span></div>
    </section>
    <div class="toolbar">
      <input id="search" type="search" placeholder="Filtrer par titre, statut, priorité..." />
      <select id="statusFilter"><option value="">Tous les statuts</option></select>
      <button id="askBtn" type="button">Demander une analyse</button>
    </div>
    <div id="tableWrap" class="empty">Les données du tool vont s'afficher ici.</div>
  </main>
  <script type="module">
    let mcpApp = null;
    let dashboardData = null;
    const els = {
      subtitle: document.getElementById('subtitle'),
      total: document.getElementById('total'),
      openCount: document.getElementById('openCount'),
      highCount: document.getElementById('highCount'),
      search: document.getElementById('search'),
      statusFilter: document.getElementById('statusFilter'),
      tableWrap: document.getElementById('tableWrap'),
      refreshBtn: document.getElementById('refreshBtn'),
      askBtn: document.getElementById('askBtn'),
    };

    function countMatching(record, needles) {
      return Object.entries(record || {}).reduce((sum, [key, count]) => needles.some(n => key.toLowerCase().includes(n)) ? sum + count : sum, 0);
    }

    function render(data) {
      if (!data) return;
      dashboardData = data;
      els.subtitle.textContent = 'Projet ' + data.projectId + ' - région ' + data.region + ' - généré le ' + new Date(data.generatedAt).toLocaleString('fr-FR');
      els.total.textContent = data.total ?? 0;
      els.openCount.textContent = countMatching(data.counts?.byStatus, ['new', 'open', 'ouvert']);
      els.highCount.textContent = countMatching(data.counts?.byPriority, ['high', 'critical', 'haute', 'critique']);

      const statuses = Object.keys(data.counts?.byStatus || {}).sort();
      els.statusFilter.innerHTML = '<option value="">Tous les statuts</option>' + statuses.map(s => '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>').join('');
      renderTable();
    }

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
    }

    function renderTable() {
      const data = dashboardData;
      if (!data) return;
      const query = els.search.value.trim().toLowerCase();
      const status = els.statusFilter.value;
      const rows = (data.topics || []).filter(topic => {
        const text = [topic.title, topic.status, topic.priority, topic.type, topic.assignedTo].join(' ').toLowerCase();
        return (!query || text.includes(query)) && (!status || topic.status === status);
      });
      if (rows.length === 0) {
        els.tableWrap.className = 'empty';
        els.tableWrap.textContent = 'Aucun BCF ne correspond au filtre.';
        return;
      }
      els.tableWrap.className = '';
      els.tableWrap.innerHTML = '<table><thead><tr><th>Titre</th><th>Statut</th><th>Priorité</th><th>Type</th><th>Assigné à</th><th>Créé</th></tr></thead><tbody>' +
        rows.map(topic => '<tr>' +
          '<td><strong>' + escapeHtml(topic.title) + '</strong><div class="muted">' + escapeHtml(topic.guid) + '</div></td>' +
          '<td><span class="pill">' + escapeHtml(topic.status) + '</span></td>' +
          '<td>' + escapeHtml(topic.priority) + '</td>' +
          '<td>' + escapeHtml(topic.type) + '</td>' +
          '<td>' + escapeHtml(topic.assignedTo) + '</td>' +
          '<td>' + escapeHtml(topic.created) + '</td>' +
        '</tr>').join('') + '</tbody></table>';
    }

    async function connectMcpApp() {
      try {
        const mod = await import('${EXT_APPS_SDK_URL}');
        const { App, PostMessageTransport } = mod;
        mcpApp = new App({ name: 'Trimble Connect BCF Dashboard', version: '1.0.0' });
        mcpApp.ontoolinput = () => {
          els.tableWrap.className = 'empty';
          els.tableWrap.textContent = 'Chargement des BCF...';
        };
        mcpApp.ontoolresult = ({ structuredContent }) => render(structuredContent);
        mcpApp.ontoolcancelled = ({ reason }) => {
          els.tableWrap.className = 'error';
          els.tableWrap.textContent = 'Exécution annulée: ' + reason;
        };
        await mcpApp.connect(new PostMessageTransport(window.parent));
      } catch (error) {
        els.tableWrap.className = 'error';
        els.tableWrap.textContent = 'MCP Apps SDK non chargé. Le résumé texte reste disponible dans le chat.';
        console.error(error);
      }
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      const params = msg?.params || {};
      const structured = params.structuredContent || params.result?.structuredContent;
      if (structured) render(structured);
    });

    els.search.addEventListener('input', renderTable);
    els.statusFilter.addEventListener('change', renderTable);
    els.refreshBtn.addEventListener('click', async () => {
      if (!dashboardData || !mcpApp?.callServerTool) return;
      const result = await mcpApp.callServerTool({
        name: 'tc_bcf_dashboard_app',
        arguments: { region: dashboardData.region, projectId: dashboardData.projectId, limit: dashboardData.showing || 30 },
      });
      if (!result.isError && result.structuredContent) render(result.structuredContent);
    });
    els.askBtn.addEventListener('click', async () => {
      if (!mcpApp?.sendMessage || !dashboardData) return;
      await mcpApp.sendMessage({
        role: 'user',
        content: [{ type: 'text', text: 'Analyse ce dashboard BCF et donne-moi les priorités d’action.' }],
      });
    });

    connectMcpApp();
  </script>
</body>
</html>`;
}

type BcfCreateContext = {
  region: string;
  projectId: string;
  prefill: {
    title: string;
    description: string;
    topicType: string;
    priority: string;
    assignedTo: string;
  };
  extensions: {
    topicTypes: string[];
    priorities: string[];
    statuses: string[];
  };
  users: { email: string; name: string }[];
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function buildBcfCreateUsers(rawUsers: unknown): { email: string; name: string }[] {
  const records = asRecordArray(rawUsers);
  return records
    .map((user) => {
      const email = toText(user.email ?? user.id, "");
      const first = toText(user.firstName ?? user.first_name, "");
      const last = toText(user.lastName ?? user.last_name, "");
      const fullName = `${first} ${last}`.trim();
      const name = fullName || toText(user.name, email);
      return { email, name };
    })
    .filter((user) => user.email !== "");
}

function createBcfCreateAppHtml(): string {
  return String.raw`<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Créer un BCF Trimble Connect</title>
  <style>
    :root { color-scheme: light; font-family: Inter, "Open Sans", Arial, sans-serif; }
    body { margin: 0; background: #f8fafc; color: #1e293b; }
    .app { padding: 14px; }
    .header { margin-bottom: 12px; }
    h1 { font-size: 16px; line-height: 1.2; margin: 0 0 4px; }
    .muted { color: #64748b; font-size: 12px; }
    form { display: grid; gap: 10px; }
    .field { display: grid; gap: 4px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    label { font-size: 12px; font-weight: 600; color: #334155; }
    input, select, textarea { border: 1px solid #cbd5e1; border-radius: 8px; background: white; color: #0f172a; font-size: 13px; padding: 8px 9px; width: 100%; box-sizing: border-box; }
    textarea { min-height: 70px; resize: vertical; }
    .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
    button { cursor: pointer; font-weight: 600; border: 1px solid #cbd5e1; border-radius: 8px; background: white; color: #0f172a; font-size: 13px; padding: 8px 14px; }
    button.primary { background: #0ea5e9; border-color: #0ea5e9; color: white; }
    button:disabled { opacity: .6; cursor: not-allowed; }
    .banner { padding: 10px 12px; border-radius: 8px; font-size: 12px; display: none; }
    .banner.show { display: block; }
    .banner.success { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
    .banner.error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
    .checkbox { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #334155; font-weight: 500; }
    .checkbox input { width: auto; }
    .checkbox.hidden { display: none; }
    @media (max-width: 480px) { .row { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main class="app">
    <div class="header">
      <h1>Créer un BCF</h1>
      <div class="muted" id="subtitle">En attente du contexte projet...</div>
    </div>
    <div id="banner" class="banner"></div>
    <form id="bcfForm">
      <div class="field">
        <label for="title">Titre *</label>
        <input id="title" name="title" type="text" required placeholder="Ex. Collision gaine / poutre niveau 2" />
      </div>
      <div class="field">
        <label for="description">Description</label>
        <textarea id="description" name="description" placeholder="Décrivez le problème, la localisation, l'action attendue..."></textarea>
      </div>
      <div class="row">
        <div class="field">
          <label for="topicType">Type</label>
          <select id="topicType" name="topicType"></select>
        </div>
        <div class="field">
          <label for="priority">Priorité</label>
          <select id="priority" name="priority"></select>
        </div>
      </div>
      <div class="field">
        <label for="assignedTo">Assigné à</label>
        <select id="assignedTo" name="assignedTo"><option value="">— Personne —</option></select>
      </div>
      <label class="checkbox" id="viewpointField">
        <input id="attachViewpoint" name="attachViewpoint" type="checkbox" checked />
        <span>Joindre la vue 3D actuelle (caméra + capture + sélection) — nécessite le panneau « Agent Eyes » ouvert</span>
      </label>
      <div class="actions">
        <button id="submitBtn" class="primary" type="submit">Créer le BCF</button>
      </div>
    </form>
  </main>
  <script type="module">
    let mcpApp = null;
    let ctx = null;
    const els = {
      subtitle: document.getElementById('subtitle'),
      banner: document.getElementById('banner'),
      form: document.getElementById('bcfForm'),
      title: document.getElementById('title'),
      description: document.getElementById('description'),
      topicType: document.getElementById('topicType'),
      priority: document.getElementById('priority'),
      assignedTo: document.getElementById('assignedTo'),
      attachViewpoint: document.getElementById('attachViewpoint'),
      viewpointField: document.getElementById('viewpointField'),
      submitBtn: document.getElementById('submitBtn'),
    };

    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[ch]));
    }

    function setBanner(type, message) {
      els.banner.className = 'banner show ' + type;
      els.banner.textContent = message;
    }

    function fillSelect(select, values, selected, placeholder) {
      const opts = [];
      if (placeholder !== undefined) opts.push('<option value="">' + escapeHtml(placeholder) + '</option>');
      for (const v of values) {
        const isSel = selected && selected === v ? ' selected' : '';
        opts.push('<option value="' + escapeHtml(v) + '"' + isSel + '>' + escapeHtml(v) + '</option>');
      }
      select.innerHTML = opts.join('');
    }

    function applyContext(data) {
      if (!data) return;
      ctx = data;
      els.subtitle.textContent = 'Projet ' + data.projectId + ' — région ' + data.region;
      const ext = data.extensions || {};
      fillSelect(els.topicType, ext.topicTypes || [], data.prefill?.topicType, 'Par défaut');
      fillSelect(els.priority, ext.priorities || [], data.prefill?.priority, 'Par défaut');
      els.assignedTo.innerHTML = '<option value="">— Personne —</option>' +
        (data.users || []).map(u => '<option value="' + escapeHtml(u.email) + '">' + escapeHtml(u.name) + ' (' + escapeHtml(u.email) + ')</option>').join('');
      if (data.prefill?.assignedTo) els.assignedTo.value = data.prefill.assignedTo;
      if (data.prefill?.title) els.title.value = data.prefill.title;
      if (data.prefill?.description) els.description.value = data.prefill.description;
    }

    async function connectMcpApp() {
      try {
        const mod = await import('${EXT_APPS_SDK_URL}');
        const { App, PostMessageTransport } = mod;
        mcpApp = new App({ name: 'Trimble Connect BCF Create', version: '1.0.0' });
        mcpApp.ontoolresult = ({ structuredContent }) => applyContext(structuredContent);
        await mcpApp.connect(new PostMessageTransport(window.parent));
      } catch (error) {
        setBanner('error', "SDK MCP Apps non chargé. Utilisez la commande texte de création BCF dans le chat.");
        console.error(error);
      }
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;
      const params = msg?.params || {};
      const structured = params.structuredContent || params.result?.structuredContent;
      if (structured) applyContext(structured);
    });

    function collectFields() {
      const fields = { title: els.title.value.trim() };
      const description = els.description.value.trim();
      if (description) fields.description = description;
      if (els.topicType.value) fields.topicType = els.topicType.value;
      if (els.priority.value) fields.priority = els.priority.value;
      if (els.assignedTo.value) fields.assignedTo = els.assignedTo.value;
      return fields;
    }

    // Create the topic on the server; optionally attach the live 3D viewpoint
    // captured by the "Agent Eyes" extension through the viewer bridge.
    async function createTopic(fields, wantsViewpoint) {
      const result = await mcpApp.callServerTool({
        name: 'tc_bcf_create_topic',
        arguments: { region: ctx.region, projectId: ctx.projectId, ...fields },
      });
      const resultText = (result?.content || []).map(c => c.text).filter(Boolean).join('\n');
      if (result?.isError) {
        setBanner('error', "Échec de la création: " + (resultText || 'erreur inconnue'));
        return;
      }
      let guid = null;
      const match = resultText.match(/"guid"\s*:\s*"([^"]+)"/);
      if (match) guid = match[1];

      if (wantsViewpoint && guid) {
        setBanner('success', "BCF créé, attachement de la vue 3D en cours...");
        const vpResult = await mcpApp.callServerTool({
          name: 'tc_create_viewpoint_from_viewer',
          arguments: { region: ctx.region, projectId: ctx.projectId, topicId: guid },
        });
        if (vpResult?.isError) {
          const vpText = (vpResult?.content || []).map(c => c.text).filter(Boolean).join('\n');
          setBanner('error', "BCF « " + fields.title + " » créé, mais vue 3D non attachée: " + (vpText || 'erreur inconnue') + " Vérifiez que le panneau « Agent Eyes » est ouvert dans le viewer 3D.");
        } else {
          setBanner('success', "BCF « " + fields.title + " » créé avec la vue 3D actuelle (caméra + capture + sélection).");
        }
      } else if (wantsViewpoint && !guid) {
        setBanner('error', "BCF créé mais son identifiant n'a pas pu être lu — vue 3D non attachée.");
      } else {
        setBanner('success', "BCF « " + fields.title + " » créé avec succès.");
      }
      els.form.reset();
      applyContext(ctx);
    }

    els.form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!ctx) { setBanner('error', "Contexte projet indisponible."); return; }
      const fields = collectFields();
      if (!fields.title) { setBanner('error', "Le titre est obligatoire."); return; }
      if (!mcpApp?.callServerTool) { setBanner('error', "Connexion à l'agent indisponible."); return; }

      els.submitBtn.disabled = true;
      setBanner('success', "Création du BCF en cours...");
      try {
        await createTopic(fields, els.attachViewpoint.checked);
      } catch (error) {
        setBanner('error', "Erreur: " + (error?.message || String(error)));
      } finally {
        els.submitBtn.disabled = false;
      }
    });

    connectMcpApp();
  </script>
</body>
</html>`;
}

function buildDocIndex(): DocSection[] {
  const sections: DocSection[] = [];

  const addSections = (category: string, obj: Record<string, string> | string) => {
    if (typeof obj === "string") {
      sections.push({
        category,
        key: category,
        title: category,
        content: obj,
      });
    } else {
      for (const [key, content] of Object.entries(obj)) {
        const titleMatch = content.match(/^#\s+(.+)/m);
        sections.push({
          category,
          key,
          title: titleMatch?.[1] ?? key,
          content,
        });
      }
    }
  };

  addSections("workspace-api", workspaceApiDocs);
  addSections("rest-api", restApiDocs);
  addSections("bcf-api", bcfApiDocs);
  addSections("viewer-api", viewerApiDocs);
  addSections("markup-api", markupApiDocs);
  addSections("view-api", viewApiDocs);
  addSections("panels-api", panelsApiDocs);
  addSections("auth", authDocs);
  addSections("regions", regionsDocs);
  addSections("extensions", extensionsDocs);
  addSections("typescript-types", typescriptTypes);
  addSections("project-setup", projectSetupDocs);
  addSections("code-examples", codeExamples);
  addSections("property-set", propertySetDocs);
  addSections("pitfalls", pitfallsDocs);
  addSections("rest-api-extended", restApiExtendedDocs);
  addSections("sdk", sdkDocs);

  return sections;
}

const docIndex = buildDocIndex();

// ── MCP Server Factory ──

const apiCategories = [
  "workspace-api",
  "rest-api",
  "rest-api-extended",
  "bcf-api",
  "viewer-api",
  "markup-api",
  "view-api",
  "panels-api",
  "auth",
  "regions",
  "extensions",
  "typescript-types",
  "project-setup",
  "code-examples",
  "property-set",
  "pitfalls",
  "sdk",
] as const;

function createServer(): McpServer {
  const srv = new McpServer({
    name: "trimble-connect-api",
    version: "1.2.0",
  });

  srv.tool(
    "search_trimble_connect_docs",
    "Search across all Trimble Connect for Browser API documentation. Returns matching sections with code examples.",
    {
      query: z.string().describe("Search query — keywords or question about Trimble Connect APIs"),
    },
    async ({ query }) => {
      const terms = query.toLowerCase().split(/\s+/);
      const scored = docIndex
        .map((section) => {
          const text = (section.content + " " + section.title + " " + section.category).toLowerCase();
          let score = 0;
          for (const term of terms) {
            if (text.includes(term)) score++;
            if (section.title.toLowerCase().includes(term)) score += 2;
            if (section.category.toLowerCase().includes(term)) score += 1;
          }
          return { section, score };
        })
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      if (scored.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No results found for "${query}". Try broader terms like: workspace-api, viewer, rest-api, bcf, markup, auth, regions, extensions, property-set, typescript-types, project-setup, code-examples, pitfalls` }],
        };
      }

      const results = scored
        .map((s) => `## [${s.section.category}/${s.section.key}] ${s.section.title}\n\n${s.section.content}`)
        .join("\n\n---\n\n");

      return { content: [{ type: "text" as const, text: results }] };
    }
  );

  srv.tool(
    "get_api_reference",
    "Get the complete reference documentation for a specific Trimble Connect API category.",
    {
      category: z.enum(apiCategories).describe("API category to retrieve"),
      section: z.string().optional().describe("Optional: specific section within the category"),
    },
    async ({ category, section }) => {
      const matching = docIndex.filter((s) => s.category === category);
      if (matching.length === 0) {
        return { content: [{ type: "text" as const, text: `Category "${category}" not found. Available: ${apiCategories.join(", ")}` }] };
      }
      if (section) {
        const specific = matching.find((s) => s.key.toLowerCase() === section.toLowerCase() || s.title.toLowerCase().includes(section.toLowerCase()));
        if (specific) return { content: [{ type: "text" as const, text: specific.content }] };
        return { content: [{ type: "text" as const, text: `Section "${section}" not found in ${category}. Available: ${matching.map((s) => s.key).join(", ")}` }] };
      }
      return { content: [{ type: "text" as const, text: matching.map((s) => s.content).join("\n\n---\n\n") }] };
    }
  );

  srv.tool(
    "get_extension_starter",
    "Get a complete starter template for a Trimble Connect extension.",
    {
      type: z.enum(["project", "viewer3d", "embedded"]).describe("Type of extension"),
      framework: z.enum(["vanilla", "react"]).optional().describe("Framework to use. Default: vanilla TypeScript"),
    },
    async ({ type, framework = "vanilla" }) => {
      const parts: string[] = [];
      if (type === "embedded") { parts.push(extensionsDocs.embedded); }
      else { parts.push(extensionsDocs.manifests); }
      if (framework === "react" && type !== "embedded") { parts.push(codeExamples.reactHookPattern); parts.push(codeExamples.viewerBridge); }
      else if (type === "project") { parts.push(codeExamples.projectExtension); }
      else if (type === "viewer3d") { parts.push(codeExamples.viewerExtension); }
      parts.push(authDocs.integrated);
      parts.push(projectSetupDocs.projectStructure);
      if (framework === "react") parts.push(projectSetupDocs.viteConfig);
      parts.push(codeExamples.errorHandling);
      parts.push(regionsDocs.overview);
      return { content: [{ type: "text" as const, text: parts.join("\n\n---\n\n") }] };
    }
  );

  srv.tool(
    "get_viewer_api_guide",
    "Get a comprehensive guide for a specific Viewer 3D API topic.",
    {
      topic: z.enum(["camera","selection","objectState","models","sectionPlanes","snapshots","boundingBoxes","layers","icons","tools","objects","hierarchy","idConversion","placement","pointClouds","trimbim","markup-text","markup-arrow","markup-line","markup-cloud","markup-measurement","markup-all","view","units","annotation-workflow"]).describe("Viewer 3D API topic"),
    },
    async ({ topic }) => {
      const topicMap: Record<string, string> = {
        camera: viewerApiDocs.camera, selection: viewerApiDocs.selection, objectState: viewerApiDocs.objectState,
        models: viewerApiDocs.models, sectionPlanes: viewerApiDocs.sectionPlanes, snapshots: viewerApiDocs.snapshots,
        boundingBoxes: viewerApiDocs.boundingBoxes, layers: viewerApiDocs.layers, icons: viewerApiDocs.icons,
        tools: viewerApiDocs.tools, objects: viewerApiDocs.objects, hierarchy: viewerApiDocs.hierarchy,
        idConversion: viewerApiDocs.idConversion, placement: viewerApiDocs.placement, pointClouds: viewerApiDocs.pointClouds,
        trimbim: viewerApiDocs.trimbim, "markup-text": markupApiDocs.textMarkup, "markup-arrow": markupApiDocs.arrowMarkup,
        "markup-line": markupApiDocs.lineMarkup, "markup-cloud": markupApiDocs.cloudMarkup,
        "markup-measurement": markupApiDocs.measurementMarkup,
        "markup-all": [markupApiDocs.overview, markupApiDocs.interfaces, markupApiDocs.textMarkup, markupApiDocs.arrowMarkup, markupApiDocs.lineMarkup, markupApiDocs.cloudMarkup, markupApiDocs.measurementMarkup, markupApiDocs.removeMarkups].join("\n\n---\n\n"),
        view: viewApiDocs.overview, units: codeExamples.unitsConversion, "annotation-workflow": codeExamples.annotationWorkflow,
      };
      const doc = topicMap[topic];
      if (!doc) return { content: [{ type: "text" as const, text: `Topic "${topic}" not found. Available: ${Object.keys(topicMap).join(", ")}` }] };
      return { content: [{ type: "text" as const, text: doc }] };
    }
  );

  srv.tool(
    "list_available_docs",
    "List all available documentation categories and sections in this Trimble Connect MCP server.",
    {},
    async () => {
      const categories = new Map<string, string[]>();
      for (const section of docIndex) {
        if (!categories.has(section.category)) categories.set(section.category, []);
        categories.get(section.category)!.push(`  - ${section.key}: ${section.title}`);
      }
      const output = Array.from(categories.entries()).map(([cat, sections]) => `## ${cat}\n${sections.join("\n")}`).join("\n\n");
      return { content: [{ type: "text" as const, text: `# Trimble Connect API Documentation — Table of Contents\n\n${output}` }] };
    }
  );

  // ═══════════════════════════════════════════════════
  // API EXECUTION TOOLS — Call Trimble Connect APIs
  // ═══════════════════════════════════════════════════

  const regionEnum = z.enum(["us", "eu", "ap", "ap-au"]).describe("Trimble Connect region: us (North America), eu (Europe), ap (Asia-Pacific), ap-au (Australia)");

  function getToken(extra: { sessionId?: string }): string {
    const token = extra.sessionId ? getSessionToken(extra.sessionId) : undefined;
    if (!token) throw new Error("No auth token available. Configure the MCP tool in Trimble Agent Studio with an Authorization header: Bearer {actorToken?scopes=openid tc}");
    return token;
  }

  srv.registerResource(
    "trimble-connect-bcf-dashboard-app",
    BCF_DASHBOARD_APP_URI,
    {
      title: "Trimble Connect BCF Dashboard",
      description: "Interactive MCP App that visualizes Trimble Connect BCF topics inside Trimble Assist.",
      mimeType: "text/html+skybridge",
      _meta: {
        "ui": {
          "csp": {
            "resource_domains": [SERVER_ORIGIN],
            "connect_domains": [SERVER_ORIGIN],
          },
          "prefersBorder": true,
        },
        "openai/widgetDescription": "Interactive dashboard for filtering and analyzing Trimble Connect BCF topics.",
        "openai/widgetPrefersBorder": true,
      },
    },
    async () => ({
      contents: [
        {
          uri: BCF_DASHBOARD_APP_URI,
          mimeType: "text/html+skybridge",
          text: createBcfDashboardAppHtml(),
          _meta: {
            "ui": {
              "csp": {
                "resource_domains": [SERVER_ORIGIN],
                "connect_domains": [SERVER_ORIGIN],
              },
              "prefersBorder": true,
            },
            "openai/widgetDescription": "Interactive dashboard for filtering and analyzing Trimble Connect BCF topics.",
            "openai/widgetPrefersBorder": true,
          },
        },
      ],
    })
  );

  srv.registerResource(
    "trimble-connect-bcf-create-app",
    BCF_CREATE_APP_URI,
    {
      title: "Créer un BCF Trimble Connect",
      description: "Interactive MCP App form to create a Trimble Connect BCF topic inside Trimble Assist.",
      mimeType: "text/html+skybridge",
      _meta: {
        "ui": {
          "csp": {
            "resource_domains": [SERVER_ORIGIN],
            "connect_domains": [SERVER_ORIGIN],
          },
          "prefersBorder": true,
        },
        "openai/widgetDescription": "Interactive form to create a Trimble Connect BCF topic.",
        "openai/widgetPrefersBorder": true,
      },
    },
    async () => ({
      contents: [
        {
          uri: BCF_CREATE_APP_URI,
          mimeType: "text/html+skybridge",
          text: createBcfCreateAppHtml(),
          _meta: {
            "ui": {
              "csp": {
                "resource_domains": [SERVER_ORIGIN],
                "connect_domains": [SERVER_ORIGIN],
              },
              "prefersBorder": true,
            },
            "openai/widgetDescription": "Interactive form to create a Trimble Connect BCF topic.",
            "openai/widgetPrefersBorder": true,
          },
        },
      ],
    })
  );

  srv.tool(
    "tc_api_call",
    "Execute any Trimble Connect REST API call. Use the documentation tools first to find the right endpoint, then use this tool to execute it. Supports Core API and BCF API.",
    {
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).describe("HTTP method"),
      region: regionEnum,
      path: z.string().describe("API path (e.g. /projects, /files/{fileId}, /todos). Do NOT include the base URL."),
      apiType: z.enum(["core", "bcf"]).default("core").describe("API type: core (/tc/api/2.0) or bcf (/bcf/2.1)"),
      query: z.record(z.string(), z.string()).optional().describe("Query parameters as key-value pairs (e.g. {projectId: '...', type: 'FILE'})"),
      body: z.any().optional().describe("Request body for POST/PUT/PATCH (JSON object)"),
    },
    async ({ method, region, path, apiType, query, body }, extra) => {
      const token = getToken(extra);
      const result = await tcApiCall({ method, region: region as Region, path, apiType: apiType as ApiType, query, body, authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      const summary = `${method} ${path} → ${result.status} ${result.statusText}`;
      if (result.status >= 400) {
        return { content: [{ type: "text" as const, text: `ERROR: ${summary}\n\n${text}` }], isError: true };
      }
      return { content: [{ type: "text" as const, text: `${summary}\n\n${text}` }] };
    }
  );

  srv.tool(
    "tc_get_regions",
    "Get all available Trimble Connect regions and their API base URLs. Call this first to determine which region a project is in.",
    {},
    async (_args, extra) => {
      const token = getToken(extra);
      const result = await tcApiCall({ method: "GET", region: "us", path: "/regions", authToken: token });
      const regionInfo = VALID_REGIONS.map((r) => `- **${r}**: Core=${getCoreBaseUrl(r as Region)}, BCF=${getBcfBaseUrl(r as Region)}`).join("\n");
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: `# Trimble Connect Regions\n\n${regionInfo}\n\n## API Response:\n${text}` }] };
    }
  );

  srv.tool(
    "tc_get_current_user",
    "Get the current authenticated user's profile information.",
    { region: regionEnum.default("us") },
    async ({ region }, extra) => {
      const token = getToken(extra);
      const result = await tcApiCall({ method: "GET", region: region as Region, path: "/users/me", authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.tool(
    "tc_list_projects",
    "List all projects the authenticated user has access to in a given region.",
    {
      region: regionEnum,
      fullyLoaded: z.boolean().default(false).describe("If true, return full project details including rootId"),
    },
    async ({ region, fullyLoaded }, extra) => {
      const token = getToken(extra);
      const query: Record<string, string> = {};
      if (fullyLoaded) query.fullyLoaded = "true";
      const result = await tcApiCall({ method: "GET", region: region as Region, path: "/projects", query, authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.tool(
    "tc_get_project",
    "Get details of a specific project.",
    {
      region: regionEnum,
      projectId: z.string().describe("Project ID"),
    },
    async ({ region, projectId }, extra) => {
      const token = getToken(extra);
      const result = await tcApiCall({ method: "GET", region: region as Region, path: `/projects/${projectId}`, authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.tool(
    "tc_create_project",
    "Create a new project in Trimble Connect.",
    {
      region: regionEnum,
      name: z.string().describe("Project name"),
      description: z.string().optional().describe("Project description"),
    },
    async ({ region, name, description }, extra) => {
      const token = getToken(extra);
      const body: Record<string, string> = { name };
      if (description) body.description = description;
      const result = await tcApiCall({ method: "POST", region: region as Region, path: "/projects", body, authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.tool(
    "tc_list_project_users",
    "List all members of a project.",
    {
      region: regionEnum,
      projectId: z.string().describe("Project ID"),
    },
    async ({ region, projectId }, extra) => {
      const token = getToken(extra);
      const result = await tcApiCall({ method: "GET", region: region as Region, path: `/projects/${projectId}/users`, authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.tool(
    "tc_search_files",
    "Search for files in a project.",
    {
      region: regionEnum,
      projectId: z.string().describe("Project ID"),
      query: z.string().default("*").describe("Search query (use * for all files)"),
      type: z.enum(["FILE", "FOLDER"]).default("FILE").describe("Object type to search for"),
    },
    async ({ region, projectId, query: q, type: t }, extra) => {
      const token = getToken(extra);
      const result = await tcApiCall({ method: "GET", region: region as Region, path: "/search", query: { query: q, projectId, type: t }, authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.tool(
    "tc_get_folder_contents",
    "List the contents (files and subfolders) of a folder.",
    {
      region: regionEnum,
      folderId: z.string().describe("Folder ID (use project's rootId for root folder)"),
    },
    async ({ region, folderId }, extra) => {
      const token = getToken(extra);
      const result = await tcApiCall({ method: "GET", region: region as Region, path: `/folders/${folderId}/items`, authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.tool(
    "tc_get_file",
    "Get details of a specific file including versions and download URL.",
    {
      region: regionEnum,
      fileId: z.string().describe("File ID"),
      includeDownloadUrl: z.boolean().default(false).describe("If true, also fetch the download URL"),
    },
    async ({ region, fileId, includeDownloadUrl }, extra) => {
      const token = getToken(extra);
      const result = await tcApiCall({ method: "GET", region: region as Region, path: `/files/${fileId}`, authToken: token });
      let text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      if (includeDownloadUrl) {
        const dlResult = await tcApiCall({ method: "GET", region: region as Region, path: `/files/${fileId}/downloadurl`, authToken: token });
        const dlText = typeof dlResult.body === "string" ? dlResult.body : JSON.stringify(dlResult.body, null, 2);
        text += `\n\n## Download URL:\n${dlText}`;
      }
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.tool(
    "tc_list_todos",
    "List all todos/notes in a project.",
    {
      region: regionEnum,
      projectId: z.string().describe("Project ID"),
    },
    async ({ region, projectId }, extra) => {
      const token = getToken(extra);
      const result = await tcApiCall({ method: "GET", region: region as Region, path: "/todos", query: { projectId }, authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.tool(
    "tc_create_todo",
    "Create a new todo/note in a project.",
    {
      region: regionEnum,
      projectId: z.string().describe("Project ID"),
      label: z.string().describe("Todo title"),
      description: z.string().optional().describe("Todo description/content"),
    },
    async ({ region, projectId, label, description }, extra) => {
      const token = getToken(extra);
      const body: Record<string, unknown> = { label, projectId };
      if (description) body.description = description;
      const result = await tcApiCall({ method: "POST", region: region as Region, path: "/todos", body, authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.tool(
    "tc_update_todo",
    "Update an existing todo/note.",
    {
      region: regionEnum,
      todoId: z.string().describe("Todo ID"),
      label: z.string().optional().describe("New title"),
      description: z.string().optional().describe("New description"),
      done: z.boolean().optional().describe("Mark as done or not done"),
    },
    async ({ region, todoId, label, description, done }, extra) => {
      const token = getToken(extra);
      const body: Record<string, unknown> = {};
      if (label !== undefined) body.label = label;
      if (description !== undefined) body.description = description;
      if (done !== undefined) body.done = done;
      const result = await tcApiCall({ method: "PUT", region: region as Region, path: `/todos/${todoId}`, body, authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.tool(
    "tc_list_views",
    "List all 3D views saved in a project.",
    {
      region: regionEnum,
      projectId: z.string().describe("Project ID"),
    },
    async ({ region, projectId }, extra) => {
      const token = getToken(extra);
      const result = await tcApiCall({ method: "GET", region: region as Region, path: "/views", query: { projectId }, authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.tool(
    "tc_list_clashsets",
    "List all clash sets in a project.",
    {
      region: regionEnum,
      projectId: z.string().describe("Project ID"),
    },
    async ({ region, projectId }, extra) => {
      const token = getToken(extra);
      const result = await tcApiCall({ method: "GET", region: region as Region, path: "/clashsets", query: { projectId }, authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.tool(
    "tc_list_activities",
    "List recent activities in a project (audit trail).",
    {
      region: regionEnum,
      projectId: z.string().describe("Project ID"),
      pageSize: z.number().default(20).describe("Number of activities to return"),
    },
    async ({ region, projectId, pageSize }, extra) => {
      const token = getToken(extra);
      const result = await tcApiCall({
        method: "POST", region: region as Region, path: "/activities/list",
        body: { objectType: "PROJECT", objectId: projectId, pageSize },
        authToken: token,
      });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.tool(
    "tc_bcf_list_topics",
    "List BCF topics (issues) in a project.",
    {
      region: regionEnum,
      projectId: z.string().describe("Project ID"),
    },
    async ({ region, projectId }, extra) => {
      const token = getToken(extra);
      const result = await tcApiCall({ method: "GET", region: region as Region, path: `/projects/${projectId}/topics`, apiType: "bcf", authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.registerTool(
    "tc_bcf_dashboard_app",
    {
      title: "Afficher le dashboard BCF interactif",
      description: "Show an interactive MCP App dashboard for Trimble Connect BCF topics. Use this when the user asks for a BCF dashboard, visual BCF summary, filters, charts, or an interactive table of BCF issues.",
      inputSchema: {
        region: regionEnum,
        projectId: z.string().describe("Trimble Connect project ID"),
        limit: z.number().min(1).max(100).default(30).describe("Maximum number of BCF topics to include in the dashboard"),
      },
      _meta: {
        "ui": {
          "resourceUri": BCF_DASHBOARD_APP_URI,
        },
        "openai/outputTemplate": BCF_DASHBOARD_APP_URI,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Chargement du dashboard BCF...",
        "openai/toolInvocation/invoked": "Dashboard BCF prêt.",
      },
    },
    async ({ region, projectId, limit }, extra) => {
      const token = getToken(extra);
      const result = await tcApiCall({
        method: "GET",
        region: region as Region,
        path: `/projects/${projectId}/topics`,
        apiType: "bcf",
        authToken: token,
      });

      if (result.status >= 400) {
        const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
        return {
          content: [{ type: "text" as const, text: `Impossible de charger le dashboard BCF: ${result.status} ${result.statusText}\n\n${text}` }],
          isError: true,
        };
      }

      const dashboard = buildBcfDashboardData(projectId, region as string, result.body, limit);
      const openCount = Object.entries(dashboard.counts.byStatus).reduce((sum, [status, count]) => {
        const key = status.toLowerCase();
        return key.includes("new") || key.includes("open") || key.includes("ouvert") ? sum + count : sum;
      }, 0);
      const highCount = Object.entries(dashboard.counts.byPriority).reduce((sum, [priority, count]) => {
        const key = priority.toLowerCase();
        return key.includes("high") || key.includes("critical") || key.includes("haute") || key.includes("critique") ? sum + count : sum;
      }, 0);

      return {
        content: [
          {
            type: "text" as const,
            text: `Dashboard BCF généré pour le projet ${projectId}: ${dashboard.total} BCF au total, ${openCount} ouverts/New, ${highCount} en priorité haute/critique. L'interface interactive permet de filtrer et analyser les ${dashboard.showing} premiers BCF.`,
          },
        ],
        structuredContent: dashboard,
        _meta: {
          "ui": {
            "resourceUri": BCF_DASHBOARD_APP_URI,
          },
          "openai/outputTemplate": BCF_DASHBOARD_APP_URI,
          "openai/widgetAccessible": true,
          "openai/toolInvocation/invoked": "Dashboard BCF prêt.",
        },
      };
    }
  );

  srv.tool(
    "tc_bcf_create_topic",
    "Create a new BCF topic (issue) in a project.",
    {
      region: regionEnum,
      projectId: z.string().describe("Project ID"),
      title: z.string().describe("Topic title"),
      description: z.string().optional().describe("Topic description"),
      topicType: z.string().optional().describe("Topic type (e.g. 'Issue', 'Request', 'Comment')"),
      priority: z.string().optional().describe("Priority (e.g. 'Critical', 'Major', 'Normal', 'Minor')"),
      assignedTo: z.string().optional().describe("Email of the user to assign the topic to"),
    },
    async ({ region, projectId, title, description, topicType, priority, assignedTo }, extra) => {
      const token = getToken(extra);
      const body: Record<string, unknown> = { title };
      if (description) body.description = description;
      if (topicType) body.topic_type = topicType;
      if (priority) body.priority = priority;
      if (assignedTo) body.assigned_to = assignedTo;
      const result = await tcApiCall({ method: "POST", region: region as Region, path: `/projects/${projectId}/topics`, apiType: "bcf", body, authToken: token });
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      return { content: [{ type: "text" as const, text: text }] };
    }
  );

  srv.registerTool(
    "tc_bcf_create_app",
    {
      title: "Ouvrir le formulaire de création BCF",
      description: "Show an interactive MCP App form to create a Trimble Connect BCF topic. Use this when the user wants to create/open/fill a BCF, an issue, or a topic via a FORM in the chat (e.g. 'affiche le formulaire de création de BCF'). Optional fields prefill the form. The form can attach the current 3D viewpoint (camera + snapshot + selection) via the Agent Eyes viewer bridge. For direct creation without a form, use tc_bcf_create_topic + tc_create_viewpoint_from_viewer instead.",
      inputSchema: {
        region: regionEnum,
        projectId: z.string().describe("Trimble Connect project ID"),
        title: z.string().optional().describe("Optional prefilled topic title"),
        description: z.string().optional().describe("Optional prefilled description"),
        topicType: z.string().optional().describe("Optional prefilled topic type"),
        priority: z.string().optional().describe("Optional prefilled priority"),
        assignedTo: z.string().optional().describe("Optional prefilled assignee email"),
      },
      _meta: {
        "ui": {
          "resourceUri": BCF_CREATE_APP_URI,
        },
        "openai/outputTemplate": BCF_CREATE_APP_URI,
        "openai/widgetAccessible": true,
        "openai/toolInvocation/invoking": "Ouverture du formulaire BCF...",
        "openai/toolInvocation/invoked": "Formulaire BCF prêt.",
      },
    },
    async ({ region, projectId, title, description, topicType, priority, assignedTo }, extra) => {
      const token = getToken(extra);

      const extensions = { topicTypes: [] as string[], priorities: [] as string[], statuses: [] as string[] };
      let users: { email: string; name: string }[] = [];

      try {
        const extResult = await tcApiCall({
          method: "GET",
          region: region as Region,
          path: `/projects/${projectId}/extensions`,
          apiType: "bcf",
          authToken: token,
        });
        if (extResult.status < 400 && extResult.body && typeof extResult.body === "object") {
          const ext = extResult.body as Record<string, unknown>;
          extensions.topicTypes = asStringArray(ext.topic_type ?? ext.topicType);
          extensions.priorities = asStringArray(ext.priority ?? ext.priorities);
          extensions.statuses = asStringArray(ext.topic_status ?? ext.topicStatus);
        }
      } catch { /* extensions are optional */ }

      try {
        const usersResult = await tcApiCall({
          method: "GET",
          region: region as Region,
          path: `/projects/${projectId}/users`,
          authToken: token,
        });
        if (usersResult.status < 400) users = buildBcfCreateUsers(usersResult.body);
      } catch { /* users list is optional */ }

      const context: BcfCreateContext = {
        region: region as string,
        projectId,
        prefill: {
          title: title ?? "",
          description: description ?? "",
          topicType: topicType ?? "",
          priority: priority ?? "",
          assignedTo: assignedTo ?? "",
        },
        extensions,
        users,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: `Formulaire de création BCF ouvert pour le projet ${projectId} (région ${region}). ${users.length} membre(s) disponible(s) pour assignation. Remplissez le formulaire puis validez pour créer le BCF.`,
          },
        ],
        structuredContent: context,
        _meta: {
          "ui": {
            "resourceUri": BCF_CREATE_APP_URI,
          },
          "openai/outputTemplate": BCF_CREATE_APP_URI,
          "openai/widgetAccessible": true,
          "openai/toolInvocation/invoked": "Formulaire BCF prêt.",
        },
      };
    }
  );

  // ═══════════════════════════════════════════════════
  // DOMAIN TOOLS — Full Trimble Connect Core + BCF API coverage
  // (one tool per API domain, endpoint selected via "action")
  // ═══════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════
  // VIEWER BRIDGE TOOLS — Live 3D viewer state pushed by
  // the "Agent Eyes" Trimble Connect extension
  // ═══════════════════════════════════════════════════

  srv.tool(
    "get_current_viewer_state",
    "Get the LIVE state of the user's Trimble Connect 3D viewer: current camera (position/target/up), selected objects with their IFC GUIDs, loaded models and snapshot availability. Requires the 'Agent Eyes' extension panel to be open in Trimble Connect — if no state is available, ask the user to open it. Check age_seconds/stale to warn the user when the data is old. Use this whenever a request refers to what the user currently sees ('these objects', 'my current view'...).",
    {},
    async (_args, extra) => {
      const token = getToken(extra);
      const user = await resolveUserKeys(token);
      const match = getViewerState(user.keys);
      if (!match) {
        console.error(`[viewer-state] get_current_viewer_state: no state for keys=[${user.keys.join(", ")}]`);
        return {
          content: [{
            type: "text" as const,
            text: "No viewer state available for this user. Ask the user to open the 'Agent Eyes' extension panel in Trimble Connect (left sidebar) and keep it open, then retry.",
          }],
          isError: true,
        };
      }
      const described = { matched_by: match.matchedBy, ...describeState(match.entry) };
      return { content: [{ type: "text" as const, text: JSON.stringify(described, null, 2) }] };
    }
  );

  srv.tool(
    "tc_create_viewpoint_from_viewer",
    "Create a BCF viewpoint on an existing topic directly from the user's LIVE 3D viewer state: perspective camera, selected components (IFC GUIDs) and PNG snapshot. The snapshot is attached server-side and never passes through the model. Requires the 'Agent Eyes' extension panel to be open in Trimble Connect. Typical flow: 1) tc_bcf action topic_create, 2) this tool with the returned topic GUID.",
    {
      region: regionEnum,
      projectId: z.string().describe("Trimble Connect project ID"),
      topicId: z.string().describe("GUID of the BCF topic to attach the viewpoint to"),
      bcfVersion: z.enum(["2.1", "3.0"]).default("2.1").describe("BCF API version"),
      includeSnapshot: z.boolean().default(true).describe("Attach the viewer snapshot image to the viewpoint"),
      includeSelection: z.boolean().default(true).describe("Attach the selected components (IFC GUIDs) to the viewpoint"),
    },
    async ({ region, projectId, topicId, bcfVersion, includeSnapshot, includeSelection }, extra) => {
      const token = getToken(extra);
      const user = await resolveUserKeys(token);
      const match = getViewerState(user.keys);
      if (!match) {
        console.error(`[viewer-state] tc_create_viewpoint_from_viewer: no state for keys=[${user.keys.join(", ")}]`);
        return {
          content: [{
            type: "text" as const,
            text: "No viewer state available for this user. Ask the user to open the 'Agent Eyes' extension panel in Trimble Connect (left sidebar) and keep it open, then retry.",
          }],
          isError: true,
        };
      }
      const entry = match.entry;

      const state: ViewerState = { ...entry.state };
      if (!includeSnapshot) delete state.snapshot;
      if (!includeSelection) delete state.selection;

      const viewpoint = buildBcfViewpoint(state, bcfVersion);
      if (!viewpoint.perspective_camera) {
        return {
          content: [{ type: "text" as const, text: "The cached viewer state has no camera data. Ask the user to move the camera in the 3D viewer (with the Agent Eyes panel open) and retry." }],
          isError: true,
        };
      }

      const result = await tcApiCall({
        method: "POST",
        region: region as Region,
        path: `/projects/${projectId}/topics/${topicId}/viewpoints`,
        apiType: "bcf",
        bcfVersion,
        body: viewpoint,
        authToken: token,
      });

      const ageSeconds = Math.round((Date.now() - entry.storedAt) / 1000);
      const text = typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2);
      if (result.status >= 400) {
        console.error(`[viewer-state] POST viewpoint failed: ${result.status} ${result.statusText} — ${text.slice(0, 500)}`);
        return { content: [{ type: "text" as const, text: `ERROR: POST viewpoint → ${result.status} ${result.statusText}\n\n${text}` }], isError: true };
      }

      // Link the models loaded in the viewer to the topic (what the TC UI
      // calls "Link model"), so the topic is not flagged as missing its model.
      let modelLink = "no model info from viewer";
      const models = (state.models ?? []).filter((m) => m.name);
      if (models.length > 0) {
        try {
          const filesResult = await tcApiCall({
            method: "PUT",
            region: region as Region,
            path: `/projects/${projectId}/topics/${topicId}/files`,
            apiType: "bcf",
            bcfVersion,
            body: models.map((m) => ({
              file_name: m.name,
              reference: m.versionId ?? m.id,
            })),
            authToken: token,
          });
          modelLink = filesResult.status < 400
            ? `linked ${models.length} model(s): ${models.map((m) => m.name).join(", ")}`
            : `failed (${filesResult.status} ${filesResult.statusText})`;
          if (filesResult.status >= 400) {
            const detail = typeof filesResult.body === "string" ? filesResult.body : JSON.stringify(filesResult.body);
            console.error(`[viewer-state] PUT topic files failed: ${filesResult.status} — ${detail.slice(0, 500)}`);
          }
        } catch (error) {
          modelLink = `failed (${String(error)})`;
          console.error(`[viewer-state] PUT topic files threw: ${String(error)}`);
        }
      }

      const staleWarning = ageSeconds > 120 ? `\n\nWARNING: the viewer state was ${ageSeconds}s old — verify the viewpoint matches what the user expects.` : "";
      return {
        content: [{
          type: "text" as const,
          text: `Viewpoint created on topic ${topicId} (viewer state age: ${ageSeconds}s, snapshot: ${state.snapshot ? "yes" : "no"}, components: ${includeSelection ? (state.selection ?? []).reduce((n, s) => n + (s.externalIds?.length ?? 0), 0) : 0}, model link: ${modelLink}).${staleWarning}\n\n${text}`,
        }],
      };
    }
  );

  srv.tool(
    "viewer_bridge_debug",
    "Diagnostic tool for the Agent Eyes viewer bridge. Returns the identity resolved from the calling token, the identities currently holding viewer state on the server, and whether they match. Use only when get_current_viewer_state or tc_create_viewpoint_from_viewer report that no viewer state is available.",
    {},
    async (_args, extra) => {
      const token = getToken(extra);
      const user = await resolveUserKeys(token);
      const payload = (() => {
        try {
          const part = token.replace(/^Bearer\s+/i, "").split(".")[1];
          const claims = JSON.parse(Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
          return { sub: claims.sub, email: claims.email, azp: claims.azp, scope: claims.scope, identity_type: claims.identity_type };
        } catch {
          return { error: "token is not a decodable JWT" };
        }
      })();
      const match = getViewerState(user.keys);
      const report = {
        caller_resolved_keys: user.keys,
        caller_email: user.email ?? null,
        caller_token_claims: payload,
        store: describeStore(),
        match: match ? match.matchedBy : "none",
      };
      console.log(`[viewer-state] debug: ${JSON.stringify(report)}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(report, null, 2) }] };
    }
  );

  registerTcApps(srv, getToken);
  registerTcAppsExtra(srv, getToken);

  registerDomainTools(srv, getToken);

  return srv;
}

// ═══════════════════════════════════════
// Start the server
// ═══════════════════════════════════════

async function main() {
  const isHttpMode = process.argv.includes("--http") || !!process.env.PORT;

  if (isHttpMode) {
    const app = express();
    app.use(cors());
    // 10 MB limit: the Agent Eyes extension pushes viewer snapshots (base64 PNG)
    app.use(express.json({ limit: "10mb" }));

    // ── Transport state ──
    const transports: Record<string, StreamableHTTPServerTransport> = {};
    const sseTransports: Record<string, { server: McpServer; transport: SSEServerTransport }> = {};

    /**
     * The MCP SDK strictly requires "Accept: application/json, text/event-stream".
     * Some clients (e.g. the Trimble Agent Studio connector registry validator)
     * send a simpler Accept header, which would trigger a 406. Normalize it so
     * any reasonable client can complete the handshake.
     */
    const normalizeAcceptHeader = (req: express.Request) => {
      const accept = (req.headers["accept"] as string | undefined) ?? "";
      if (accept.includes("application/json") && accept.includes("text/event-stream")) return;

      const normalized = "application/json, text/event-stream";
      req.headers["accept"] = normalized;
      // The MCP SDK converts the request via @hono/node-server, which reads
      // rawHeaders instead of the parsed headers object — patch both.
      const raw = req.rawHeaders;
      let found = false;
      for (let i = 0; i < raw.length - 1; i += 2) {
        if (raw[i].toLowerCase() === "accept") {
          raw[i + 1] = normalized;
          found = true;
        }
      }
      if (!found) raw.push("Accept", normalized);
    };

    const handleMcpPost = async (req: express.Request, res: express.Response) => {
      try {
        normalizeAcceptHeader(req);
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        // Capture auth token from every request (Agent Studio injects it)
        const authHeader = req.headers["authorization"] as string | undefined;
        if (authHeader && sessionId) {
          const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
          storeSessionToken(sessionId, token);
        }

        // Diagnostic logging for tool and resource traffic
        const method = (req.body as { method?: string } | undefined)?.method;
        if (method === "tools/call") {
          const params = (req.body as { params?: { name?: string; arguments?: unknown } }).params;
          const argKeys = params?.arguments && typeof params.arguments === "object" ? Object.keys(params.arguments as object).join(",") : "";
          console.log(`[mcp] tools/call ${params?.name ?? "?"} args={${argKeys}} session=${sessionId ?? "-"}`);
        } else if (method === "resources/read") {
          const params = (req.body as { params?: { uri?: string } }).params;
          console.log(`[mcp] resources/read ${params?.uri ?? "?"} session=${sessionId ?? "-"}`);
        } else if (method === "resources/list") {
          console.log(`[mcp] resources/list session=${sessionId ?? "-"}`);
        }

        if (sessionId && transports[sessionId]) {
          await transports[sessionId].handleRequest(req, res, req.body);
          return;
        }

        if (!sessionId && isInitializeRequest(req.body)) {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            // Plain JSON responses (instead of SSE streams) so that simple
            // clients and connection validators can parse the handshake.
            enableJsonResponse: true,
            onsessioninitialized: (sid) => {
              transports[sid] = transport;
              // Store token for the new session too
              if (authHeader) {
                const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
                storeSessionToken(sid, token);
              }
            },
          });

          transport.onclose = () => {
            const sid = transport.sessionId;
            if (sid) {
              delete transports[sid];
              clearSessionToken(sid);
            }
          };

          const sessionServer = createServer();
          await sessionServer.connect(transport);
          await transport.handleRequest(req, res, req.body);
          return;
        }

        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID provided" },
          id: null,
        });
      } catch (error) {
        console.error("POST error:", error);
        if (!res.headersSent) {
          res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: String(error) }, id: null });
        }
      }
    };

    const handleMcpGet = async (req: express.Request, res: express.Response) => {
      normalizeAcceptHeader(req);
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (sessionId && transports[sessionId]) {
        await transports[sessionId].handleRequest(req, res);
        return;
      }
      const transport = new SSEServerTransport("/messages", res);
      const sessionServer = createServer();
      sseTransports[transport.sessionId] = { server: sessionServer, transport };
      res.on("close", () => { delete sseTransports[transport.sessionId]; });
      await sessionServer.connect(transport);
    };

    const handleMcpDelete = async (req: express.Request, res: express.Response) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      if (sessionId && transports[sessionId]) {
        await transports[sessionId].handleRequest(req, res);
        delete transports[sessionId];
      } else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Bad Request: No valid session ID" },
          id: null,
        });
      }
    };

    app.post("/mcp", handleMcpPost);
    app.get("/mcp", handleMcpGet);
    app.delete("/mcp", handleMcpDelete);

    app.post("/", handleMcpPost);
    app.get("/", handleMcpGet);
    app.delete("/", handleMcpDelete);

    app.get("/sse", async (req, res) => {
      const transport = new SSEServerTransport("/messages", res);
      const sessionServer = createServer();
      sseTransports[transport.sessionId] = { server: sessionServer, transport };
      res.on("close", () => { delete sseTransports[transport.sessionId]; });
      await sessionServer.connect(transport);
    });

    app.post("/messages", async (req, res) => {
      const sessionId = req.query.sessionId as string;
      const entry = sseTransports[sessionId];
      if (!entry) { res.status(400).json({ error: "No active session" }); return; }
      await entry.transport.handlePostMessage(req, res);
    });

    // ── Viewer-state bridge (Agent Eyes extension) ──

    app.post("/viewer-state", async (req, res) => {
      try {
        const authHeader = req.headers["authorization"] as string | undefined;
        if (!authHeader) {
          res.status(401).json({ error: "Missing Authorization header" });
          return;
        }
        const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
        const user = await resolveUserKeys(token);
        if (user.keys.length === 0) {
          res.status(401).json({ error: "Could not resolve user identity from token" });
          return;
        }
        storeViewerState(user.keys, (req.body ?? {}) as ViewerState, user.email);
        console.log(`[viewer-state] stored for keys=[${user.keys.join(", ")}]`);
        res.json({ ok: true, storedAt: new Date().toISOString() });
      } catch (error) {
        res.status(500).json({ error: String(error) });
      }
    });

    // Extension manifest + page, served from this same host so a single
    // deployment carries both the MCP server and the extension UI.
    app.get("/tc-extension/manifest.json", (req, res) => {
      const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.headers.host;
      const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
      res.json({
        title: "Agent Eyes",
        url: `${proto}://${host}/tc-extension/index.html`,
        icon: `${proto}://${host}/tc-extension/icon.png`,
        description: "Partage la caméra, la sélection et une capture du viewer 3D avec l'agent IA Trimble Connect",
        enabled: true,
      });
    });

    app.get(["/tc-extension", "/tc-extension/", "/tc-extension/index.html"], (_req, res) => {
      res.type("html").send(createTcExtensionHtml());
    });

    app.get("/tc-extension/icon.png", (_req, res) => {
      res.type("png").send(Buffer.from(TC_EXTENSION_ICON_BASE64, "base64"));
    });

    // ── Self-hosted MCP Apps SDK bundle ──
    // Served to the sandboxed MCP App iframes (origin "null"), hence the
    // permissive CORS header. Built by esbuild at compile time (see package.json).
    let extAppsBundleCache: Buffer | undefined;
    app.get("/assets/ext-apps.js", async (_req, res) => {
      try {
        if (!extAppsBundleCache) {
          const { readFile } = await import("node:fs/promises");
          extAppsBundleCache = await readFile(new URL("./ext-apps.bundle.js", import.meta.url));
        }
        res.set({
          "Content-Type": "text/javascript; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600",
        }).send(extAppsBundleCache);
      } catch (error) {
        console.error(`[assets] ext-apps bundle unavailable: ${String(error)}`);
        res.status(404).send("ext-apps bundle not found");
      }
    });

    // ── Health check ──
    app.get("/health", (_req, res) => {
      res.json({ status: "ok", server: "trimble-connect-api", version: "1.2.0" });
    });

    const port = parseInt(process.env.PORT || "3001", 10);
    app.listen(port, () => {
      console.error(`Trimble Connect MCP Server (HTTP) running on port ${port}`);

      // Keep-alive: ping ourselves every 13 minutes to prevent Render free tier from sleeping
      const KEEP_ALIVE_MS = 13 * 60 * 1000;
      const selfUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
      setInterval(async () => {
        try {
          await fetch(`${selfUrl}/health`);
        } catch { /* ignore */ }
      }, KEEP_ALIVE_MS);
    });
  } else {
    const stdioServer = createServer();
    const transport = new StdioServerTransport();
    await stdioServer.connect(transport);
    console.error("Trimble Connect MCP Server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
