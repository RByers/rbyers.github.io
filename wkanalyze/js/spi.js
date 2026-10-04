/**
 * WebKit iOS Private API (SPI) & DMA Interoperability Analyzer — Frontend Logic
 *
 * Security & Architecture Invariants:
 * - Zero build step; loads data from window.__WKANALYZE_SPI_INVENTORY__ and window.__WKANALYZE_SPI_HISTORY__
 * - Strictly NO fetch() or XMLHttpRequest (compatible with x20web opaque sandboxed origins)
 * - Strictly NO innerHTML, outerHTML, insertAdjacentHTML, or document.write (uses safe DOM APIs only)
 */

(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const WEBKIT_GH_COMMIT_BASE = 'https://github.com/WebKit/WebKit/commit/';
  const WEBKIT_GH_BLOB_BASE = 'https://github.com/WebKit/WebKit/blob/main/';

  // High-contrast dark-theme palette (no purple/violet on dark)
  const SLICE_PALETTE = [
    '#38bdf8', '#2dd4bf', '#34d399', '#fbbf24', '#fb7185', '#fb923c',
    '#0ea5e9', '#10b981', '#f43f5e', '#f59e0b', '#06b6d4', '#14b8a6',
    '#eab308', '#f97316', '#60a5fa', '#4ade80', '#94a3b8'
  ];

  const AVAILABILITY_META = {
    'apple-only-entitlement-or-daemon': {
      shortLabel: 'Tier 1: Entitlement / XPC Restricted',
      badgeClass: 'badge-rose',
      color: '#fb7185',
      description: 'Gated at runtime by restricted com.apple.private.* or system entitlements or privileged Mach services inaccessible to 3P apps and 3P browser engines.'
    },
    'apple-only-internal-sdk': {
      shortLabel: 'Tier 2: Apple-Internal SDK Only',
      badgeClass: 'badge-orange',
      color: '#fb923c',
      description: 'Gated by requires = ["USE_APPLE_INTERNAL_SDK"], categorized as [[not-web-essential]], or bound to internal-only private frameworks.'
    },
    '3p-via-browserenginekit-or-system-webkit': {
      shortLabel: 'Tier 3: BrowserEngineKit / System WebKit',
      badgeClass: 'badge-teal',
      color: '#2dd4bf',
      description: 'Raw SPI symbols are private, but equivalent capabilities are exposed to approved 3P EU browser engines via BrowserEngineKit or to standard apps via WKWebView.'
    },
    '3p-inprocess-private-symbol-unentitled': {
      shortLabel: 'Tier 4: In-Process Private Symbol',
      badgeClass: 'badge-amber',
      color: '#fbbf24',
      description: 'In-process private C/ObjC APIs in public frameworks that do not check a Mach entitlement at runtime, but are prohibited for direct 3P use by App Store review.'
    },
    'conditionally-promoted-to-public-sdk': {
      shortLabel: 'Tier 5: Conditionally Promoted to SDK',
      badgeClass: 'badge-emerald',
      color: '#34d399',
      description: 'Guarded by !SDKDB_HAS_* or requires-sdk after being promoted to public API in newer iOS SDKs.'
    }
  };

  const FEATURE_DESCRIPTIONS = {
    'UIKit Views, Scrolling, Gestures & Text Input': 'Enables native iOS text selection loupes, non-public gesture recognizers, context menus, drag-and-drop sessions, keyboard input peripherals, scroll view physics, and system view hosting.',
    'Networking, HTTP/3, WebTransport & Cookies': 'Enables low-level CFNetwork/Network.framework HTTP/3, WebTransport, TLS session configuration, system proxy/VPN credential lookups, and cookie storage partitioning.',
    'Graphics, CoreAnimation, Color, HDR & IOSurface': 'Enables zero-copy IOSurface buffer sharing across process boundaries, CoreAnimation remote layer hosting (CAContext/CALayerHost), HDR headroom, and CoreGraphics compositing.',
    'Media Playback, AirPlay, AVFoundation & Codecs': 'Powers AVFoundation/MediaToolbox decoding, Fig/CMTime media pipelines, Spatial Audio, AirPlay route picking, fullscreen AVPlayerViewController hooks, and WebRTC capture.',
    'System Integration, App Links, QuickLook & File Previews': 'Integrates Universal Links (LaunchServices), Handoff, QuickLook document previews, ShareSheet services, and SpringBoard/FrontBoard app launching.',
    'Authentication, Passkeys, Enterprise SSO & Security': 'Powers AuthenticationServices Passkey/WebAuthn credential providers, AuthKit/ExtensibleSSO enterprise login, Security.framework TLS trust evaluation, and Keychain access.',
    'Typography, Fonts, Emoji & Rich Text': 'Provides CoreText font table inspection, glyph shaping, system UI font descriptors (CTFontDescriptorCreateForUIType), emoji rendering, and NSAttributedString conversion.',
    'Privacy, Tracking Prevention, Content Filtering & Safe Browsing': 'Enforces WebPrivacy tracking prevention, SafariSafeBrowsing malware checks, NetworkExtension/WebContentAnalysis parental & enterprise filters, and ScreenTime.',
    'Visual Intelligence, Live Text (VisionKit) & Writing Tools': 'Integrates VisionKit Live Text image analysis, UIIntelligenceSupport Siri AI context, and system Writing Tools text rewriting overlays.',
    'Process Management, RunningBoard, XPC & System Lifecycle': 'Manages RunningBoard process assertions, Jetsam memory pressure limits, Darwin XPC/Mach bootstrap services, and Seatbelt sandbox extensions.',
    'Data Detectors, Look Up, Translation & Link Preview': 'Enables inline phone/date/address DataDetectors, dictionary Look Up, _LTTranslator system translation, and LinkPresentation rich previews.',
    'Legacy WebKit1 (WebKitLegacy) Compatibility': 'Supports legacy single-process WebView / WebFrame private Objective-C SPIs in WebKitLegacy used by system-hosted HTML views.',
    'Apple Pay, PassKit & Wallet Installments': 'Drives PassKit Apple Pay payment sheets, merchant validation, PKPaymentAuthorizationController private delegates, and Wallet installment flows.',
    'Accessibility & Speech Synthesis': 'Connects WebCore’s accessibility tree and ARIA live regions with iOS VoiceOver, AccessibilitySupport, and AVSpeechSynthesizer.',
    'Web Push Notifications & Home Screen WebClips (webpushd)': 'Powers the webpushd daemon, UserNotifications private routing, and UIApplication Home Screen WebClip management.',
    'Web Extensions & Native Messaging': 'Supports Safari/WebKit WebExtension background contexts and native extension messaging.',
    'VisionOS, Spatial Computing & 3D <model> Rendering': 'Supports HTML <model> element rendering, RealityKit/CoreRE 3D entity hosting, and spatial computing scenes.'
  };

  const state = {
    inventory: null,
    history: null,
    categoryLabelsById: new Map(),
    legacyCatLabelsById: new Map(),

    uniqueSpiRows: [],
    tomlRows: [],
    configRows: [],
    commits: [],
    commitsByHash: new Map(),
    commitsBySpiName: new Map(),

    activeTab: 'insights',
    pieGroupBy: 'feature_category',
    historyChartMode: 'trajectory',
    trajectoryMetric: 'totals',

    dataSubView: 'spi',

    spiGranularity: 'config',
    spiFilters: {
      search: '',
      process: 'all',
      feature: 'all',
      availability: 'all',
      framework: 'all',
      module: 'all',
      kind: 'all',
      legacyStatus: 'all'
    },
    spiSortField: 'name',
    spiSortDir: 'asc',
    spiPage: 1,
    spiPageSize: 50,
    filteredSpiRows: [],
    expandedSpiRowIds: new Set(),

    commitFilters: {
      search: '',
      legacyMode: 'all',
      category: 'all',
      featureArea: 'all',
      module: 'all',
      legacyAddCat: 'all'
    },
    commitSortField: 'date',
    commitSortDir: 'desc',
    commitPage: 1,
    commitPageSize: 50,
    filteredCommits: [],
    expandedCommitHashes: new Set(),
    filterBannerText: ''
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined && v !== null) {
          node.setAttribute(k, String(v));
        }
      }
    }
    return node;
  }

  function safeExternalUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return null;
    try {
      const parsed = new URL(rawUrl, window.location.href);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch (_e) {
      return null;
    }
    return null;
  }

  function createExternalLink(url, text, className, title) {
    const safe = safeExternalUrl(url);
    if (!safe) {
      return el('span', className, text);
    }
    const a = el('a', className, text);
    a.href = safe;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    if (title) a.title = title;
    return a;
  }

  function fmtNum(n) {
    if (n === undefined || n === null || Number.isNaN(Number(n))) return '0';
    return Number(n).toLocaleString('en-US');
  }

  function fmtPct(n, digits = 1) {
    if (n === undefined || n === null || Number.isNaN(Number(n))) return '0.0%';
    return Number(n).toFixed(digits) + '%';
  }

  function fmtDateShort(isoOrDate) {
    if (!isoOrDate) return '';
    return String(isoOrDate).slice(0, 10);
  }

  function getProcessesForOccurrence(spi, occ) {
    const mod = occ.module;
    if (mod === 'JavaScriptCore') return ['JavaScriptCore'];
    if (mod === 'WebGPU') return ['GPU'];
    if (mod === 'WebKitLegacy') return ['WebKitLegacy (In-Process)'];
    if (mod === 'WebCore') return ['WebCore (WebContent/GPU)'];

    const rawProcs = Array.isArray(spi.processes) ? spi.processes : [];
    const wkProcs = rawProcs.filter(
      (p) => p !== 'WebCore (WebContent/GPU)' && p !== 'JavaScriptCore' && p !== 'WebKitLegacy (In-Process)'
    );
    return wkProcs.length > 0 ? wkProcs : ['UIProcess'];
  }

  function formatRequiresGuard(occ) {
    const parts = [];
    if (Array.isArray(occ.requires) && occ.requires.length > 0) {
      parts.push(...occ.requires);
    }
    if (Array.isArray(occ.requires_os) && occ.requires_os.length > 0) {
      parts.push('os: ' + occ.requires_os.join(','));
    }
    if (Array.isArray(occ.requires_sdk) && occ.requires_sdk.length > 0) {
      parts.push('sdk: ' + occ.requires_sdk.join(','));
    }
    return parts.join(' | ');
  }

  function extractModulesFromTouchedFiles(touchedFiles) {
    const mods = new Set();
    for (const f of touchedFiles || []) {
      const pathStr = typeof f === 'string' ? f : f && f.file ? f.file : '';
      const parts = pathStr.split('/');
      if (parts.length >= 2 && parts[0] === 'Source') {
        mods.add(parts[1]);
      }
    }
    return Array.from(mods);
  }

  function buildDatasets(inventory, history) {
    state.inventory = inventory;
    state.history = history;

    for (const cat of history.metadata.by_category || []) {
      state.categoryLabelsById.set(cat.id, cat.label);
    }
    if (history.legacy_policy_analysis && Array.isArray(history.legacy_policy_analysis.by_addition_category)) {
      for (const lcat of history.legacy_policy_analysis.by_addition_category) {
        state.legacyCatLabelsById.set(lcat.id, lcat.label);
      }
    }

    const commits = Array.isArray(history.commits) ? history.commits : [];
    state.commits = commits.map((c) => {
      const totalsAfter = c.totals_after || {};
      return Object.assign({}, c, {
        dateShort: fmtDateShort(c.date),
        unique_spis: totalsAfter.unique_spis || 0,
        legacy_file_entries: totalsAfter.legacy_file_entries || 0,
        reviewed_file_entries: totalsAfter.reviewed_file_entries || 0,
        touchedModules: extractModulesFromTouchedFiles(c.touched_toml_files)
      });
    });

    for (const c of state.commits) {
      state.commitsByHash.set(c.hash, c);
      state.commitsByHash.set(c.short_hash, c);

      const allTouchedEntries = []
        .concat(c.added || [])
        .concat(c.removed || [])
        .concat(c.modified || []);
      for (const entry of allTouchedEntries) {
        if (!entry || !entry.name) continue;
        let list = state.commitsBySpiName.get(entry.name);
        if (!list) {
          list = [];
          state.commitsBySpiName.set(entry.name, list);
        }
        if (!list.some((existing) => existing.hash === c.hash)) {
          list.push(c);
        }
      }
    }

    const spis = Array.isArray(inventory.spis) ? inventory.spis : [];
    const uniqueRows = [];
    const tomlRows = [];
    const configRows = [];

    for (const spi of spis) {
      const occs = Array.isArray(spi.occurrences) ? spi.occurrences : [];
      const allConfigsForSpi = [];

      occs.forEach((occ, occIdx) => {
        const procs = getProcessesForOccurrence(spi, occ);
        const reqStr = formatRequiresGuard(occ);
        const reqLinks = [];
        if (occ.request) reqLinks.push(String(occ.request));
        if (occ.cleanup) reqLinks.push(String(occ.cleanup));

        for (const proc of procs) {
          allConfigsForSpi.push({
            occIdx,
            processType: proc,
            module: occ.module,
            file: occ.file,
            form: occ.form,
            reason: occ.reason || '',
            requiresStr: reqStr,
            inInitialBaseline: Boolean(occ.in_initial_baseline),
            addedAfterBaseline: Boolean(occ.added_after_baseline),
            reAddedAfterBaseline: Boolean(occ.re_added_after_baseline),
            introducedInCommit: occ.introduced_in_commit || null,
            introducedInDate: fmtDateShort(occ.introduced_in_date),
            legacyAdditionCategory: occ.legacy_addition_category || null,
            reqLinks
          });
        }
      });

      const totalConfigsForSpi = allConfigsForSpi.length;
      const hasLegacyFile = (spi.toml_files || []).some((f) => f.endsWith('AllowedSPI-legacy.toml'));
      const hasReviewedFile = (spi.toml_files || []).some((f) => f.endsWith('AllowedSPI.toml'));
      const hasReAdded = occs.some((o) => Boolean(o.re_added_after_baseline));

      uniqueRows.push({
        rowId: 'unique::' + spi.id,
        granularity: 'unique',
        spi,
        occ: occs[0] || {},
        name: spi.name,
        kind: spi.kind,
        processType: (spi.processes || []).join(', '),
        processesList: spi.processes || [],
        module: (spi.modules || []).join(', '),
        modulesList: spi.modules || [],
        file: (spi.toml_files || []).join(', '),
        form: (spi.forms || []).join(', '),
        framework: spi.framework || 'Unknown',
        featureCategory: spi.feature_category || 'Uncategorized',
        availability3p: spi.availability_3p || '',
        isAppleOnly: Boolean(spi.is_apple_only),
        hasLegacyFile,
        hasReviewedFile,
        addedAfterBaseline: Boolean(spi.added_to_legacy_after_baseline),
        reAddedAfterBaseline: hasReAdded,
        totalConfigsForSpi,
        allConfigsForSpi
      });

      occs.forEach((occ, occIdx) => {
        const procs = getProcessesForOccurrence(spi, occ);
        const isLegacyOcc = String(occ.file || '').endsWith('AllowedSPI-legacy.toml');
        const reqStr = formatRequiresGuard(occ);

        tomlRows.push({
          rowId: 'toml::' + spi.id + '::' + occIdx,
          granularity: 'toml',
          spi,
          occ,
          name: spi.name,
          kind: spi.kind,
          processType: procs.join(', '),
          processesList: procs,
          module: occ.module || '',
          modulesList: [occ.module || ''],
          file: occ.file || '',
          form: occ.form || '',
          requiresStr: reqStr,
          framework: spi.framework || 'Unknown',
          featureCategory: spi.feature_category || 'Uncategorized',
          availability3p: spi.availability_3p || '',
          isAppleOnly: Boolean(spi.is_apple_only),
          hasLegacyFile: isLegacyOcc,
          hasReviewedFile: !isLegacyOcc,
          addedAfterBaseline: Boolean(occ.added_after_baseline),
          reAddedAfterBaseline: Boolean(occ.re_added_after_baseline),
          totalConfigsForSpi,
          allConfigsForSpi
        });

        for (const proc of procs) {
          configRows.push({
            rowId: 'cfg::' + spi.id + '::' + occIdx + '::' + proc,
            granularity: 'config',
            spi,
            occ,
            name: spi.name,
            kind: spi.kind,
            processType: proc,
            processesList: [proc],
            module: occ.module || '',
            modulesList: [occ.module || ''],
            file: occ.file || '',
            form: occ.form || '',
            requiresStr: reqStr,
            framework: spi.framework || 'Unknown',
            featureCategory: spi.feature_category || 'Uncategorized',
            availability3p: spi.availability_3p || '',
            isAppleOnly: Boolean(spi.is_apple_only),
            hasLegacyFile: isLegacyOcc,
            hasReviewedFile: !isLegacyOcc,
            addedAfterBaseline: Boolean(occ.added_after_baseline),
            reAddedAfterBaseline: Boolean(occ.re_added_after_baseline),
            totalConfigsForSpi,
            allConfigsForSpi
          });
        }
      });
    }

    state.uniqueSpiRows = uniqueRows;
    state.tomlRows = tomlRows;
    state.configRows = configRows;
  }

  function getStateSnapshot() {
    return {
      activeTab: state.activeTab,
      pieGroupBy: state.pieGroupBy,
      historyChartMode: state.historyChartMode,
      trajectoryMetric: state.trajectoryMetric,
      dataSubView: state.dataSubView,
      spiGranularity: state.spiGranularity,
      spiFilters: { ...state.spiFilters },
      spiSortField: state.spiSortField,
      spiSortDir: state.spiSortDir,
      spiPage: state.spiPage,
      spiPageSize: state.spiPageSize,
      expandedSpiRowIds: Array.from(state.expandedSpiRowIds),
      commitFilters: { ...state.commitFilters },
      commitSortField: state.commitSortField,
      commitSortDir: state.commitSortDir,
      commitPage: state.commitPage,
      commitPageSize: state.commitPageSize,
      expandedCommitHashes: Array.from(state.expandedCommitHashes),
      filterBannerText: state.filterBannerText
    };
  }

  function applyStateSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    state.activeTab = snap.activeTab === 'data' ? 'data' : 'insights';
    state.pieGroupBy = snap.pieGroupBy || 'feature_category';
    state.historyChartMode = snap.historyChartMode || 'trajectory';
    state.trajectoryMetric = snap.trajectoryMetric || 'totals';
    state.dataSubView = ['spi', 'commits', 'both'].includes(snap.dataSubView) ? snap.dataSubView : 'spi';
    state.spiGranularity = ['config', 'toml', 'unique'].includes(snap.spiGranularity) ? snap.spiGranularity : 'config';
    state.spiFilters = {
      search: (snap.spiFilters && snap.spiFilters.search) || '',
      process: (snap.spiFilters && snap.spiFilters.process) || 'all',
      feature: (snap.spiFilters && snap.spiFilters.feature) || 'all',
      availability: (snap.spiFilters && snap.spiFilters.availability) || 'all',
      framework: (snap.spiFilters && snap.spiFilters.framework) || 'all',
      module: (snap.spiFilters && snap.spiFilters.module) || 'all',
      kind: (snap.spiFilters && snap.spiFilters.kind) || 'all',
      legacyStatus: (snap.spiFilters && snap.spiFilters.legacyStatus) || 'all'
    };
    state.spiSortField = snap.spiSortField || 'name';
    state.spiSortDir = snap.spiSortDir === 'desc' ? 'desc' : 'asc';
    state.spiPage = snap.spiPage || 1;
    state.spiPageSize = snap.spiPageSize || 50;
    state.expandedSpiRowIds = new Set(Array.isArray(snap.expandedSpiRowIds) ? snap.expandedSpiRowIds : []);
    state.commitFilters = {
      search: (snap.commitFilters && snap.commitFilters.search) || '',
      legacyMode: (snap.commitFilters && snap.commitFilters.legacyMode) || 'all',
      category: (snap.commitFilters && snap.commitFilters.category) || 'all',
      featureArea: (snap.commitFilters && snap.commitFilters.featureArea) || 'all',
      module: (snap.commitFilters && snap.commitFilters.module) || 'all',
      legacyAddCat: (snap.commitFilters && snap.commitFilters.legacyAddCat) || 'all'
    };
    state.commitSortField = snap.commitSortField || 'date';
    state.commitSortDir = snap.commitSortDir === 'asc' ? 'asc' : 'desc';
    state.commitPage = snap.commitPage || 1;
    state.commitPageSize = snap.commitPageSize || 50;
    state.expandedCommitHashes = new Set(Array.isArray(snap.expandedCommitHashes) ? snap.expandedCommitHashes : []);
    state.filterBannerText = snap.filterBannerText || '';
  }

  function buildFilterBannerTextFromState() {
    const descParts = [];
    const sf = state.spiFilters;
    const cf = state.commitFilters;
    if (sf.feature !== 'all') descParts.push('Feature Category = "' + sf.feature + '"');
    if (sf.availability !== 'all') {
      const label = AVAILABILITY_META[sf.availability]
        ? AVAILABILITY_META[sf.availability].shortLabel
        : sf.availability === 'apple-only-all'
          ? 'All Strictly Apple-Only SPIs (635)'
          : sf.availability;
      descParts.push('3P Availability = "' + label + '"');
    }
    if (sf.framework !== 'all') descParts.push('Framework = "' + sf.framework + '"');
    if (sf.module !== 'all') descParts.push('WebKit Module = "' + sf.module + '"');
    if (sf.kind !== 'all') descParts.push('Declaration Kind = "' + sf.kind + '"');
    if (sf.process !== 'all') descParts.push('Process Configuration = "' + sf.process + '"');
    if (sf.legacyStatus !== 'all') descParts.push('Allowlist Filter = "' + sf.legacyStatus + '"');
    if (sf.search) descParts.push('Search Query = "' + sf.search + '"');
    if (cf.legacyMode === 'legacy_additions_only') {
      descParts.push('24 Post-Baseline Commits Adding to AllowedSPI-legacy.toml');
    }
    if (cf.category !== 'all') {
      const catLabel = state.categoryLabelsById.get(cf.category) || cf.category;
      descParts.push('Commit Purpose Category = "' + catLabel + '"');
    }
    if (cf.featureArea !== 'all') descParts.push('Commit Feature Area = "' + cf.featureArea + '"');
    if (cf.module !== 'all') descParts.push('Touched Module = "' + cf.module + '"');
    if (cf.legacyAddCat !== 'all') {
      const lLabel = state.legacyCatLabelsById.get(cf.legacyAddCat) || cf.legacyAddCat;
      descParts.push('Legacy Addition Root Cause = "' + lLabel + '"');
    }
    if (cf.search) descParts.push('Commit Search = "' + cf.search + '"');
    return descParts.length > 0 ? 'Active Insight Filter: ' + descParts.join(' \u2022 ') : '';
  }

  function loadStateFromHash() {
    applyStateSnapshot({});
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) return;
    if (!raw.includes('=')) return;
    try {
      const params = new URLSearchParams(raw);
      const tabParam = params.get('tab');
      const hasDataParam =
        tabParam === 'data' ||
        params.has('subview') ||
        params.has('granularity') ||
        params.has('q') ||
        params.has('proc') ||
        params.has('feat') ||
        params.has('avail') ||
        params.has('fw') ||
        params.has('mod') ||
        params.has('kind') ||
        params.has('leg') ||
        params.has('cq') ||
        params.has('cmode') ||
        params.has('ccat') ||
        params.has('carea') ||
        params.has('cmod') ||
        params.has('clcat');
      if (hasDataParam) {
        state.activeTab = 'data';
      }
      const subview = params.get('subview');
      if (subview && ['spi', 'commits', 'both'].includes(subview)) {
        state.dataSubView = subview;
      }
      const gran = params.get('granularity');
      if (gran && ['config', 'toml', 'unique'].includes(gran)) {
        state.spiGranularity = gran;
      }
      if (params.has('pie')) state.pieGroupBy = params.get('pie') || 'feature_category';
      if (params.has('hmode')) state.historyChartMode = params.get('hmode') || 'trajectory';
      if (params.has('tmetric')) state.trajectoryMetric = params.get('tmetric') || 'totals';

      if (params.has('q')) state.spiFilters.search = params.get('q') || '';
      if (params.has('proc')) state.spiFilters.process = params.get('proc') || 'all';
      if (params.has('feat')) state.spiFilters.feature = params.get('feat') || 'all';
      if (params.has('avail')) state.spiFilters.availability = params.get('avail') || 'all';
      if (params.has('fw')) state.spiFilters.framework = params.get('fw') || 'all';
      if (params.has('mod')) state.spiFilters.module = params.get('mod') || 'all';
      if (params.has('kind')) state.spiFilters.kind = params.get('kind') || 'all';
      if (params.has('leg')) state.spiFilters.legacyStatus = params.get('leg') || 'all';

      if (params.has('cq')) state.commitFilters.search = params.get('cq') || '';
      if (params.has('cmode')) state.commitFilters.legacyMode = params.get('cmode') || 'all';
      if (params.has('ccat')) state.commitFilters.category = params.get('ccat') || 'all';
      if (params.has('carea')) state.commitFilters.featureArea = params.get('carea') || 'all';
      if (params.has('cmod')) state.commitFilters.module = params.get('cmod') || 'all';
      if (params.has('clcat')) state.commitFilters.legacyAddCat = params.get('clcat') || 'all';
      if (params.has('cexp')) {
        const cexp = params.get('cexp');
        if (cexp) state.expandedCommitHashes.add(cexp);
      }

      state.filterBannerText = buildFilterBannerTextFromState();
    } catch (_e) {
      // Ignore malformed hash
    }
  }

  function buildTargetHash() {
    const params = new URLSearchParams();
    if (state.activeTab === 'insights') {
      if (state.pieGroupBy !== 'feature_category') params.set('pie', state.pieGroupBy);
      if (state.historyChartMode !== 'trajectory') params.set('hmode', state.historyChartMode);
      if (state.trajectoryMetric !== 'totals') params.set('tmetric', state.trajectoryMetric);
    } else {
      params.set('tab', 'data');
      if (state.dataSubView !== 'spi') params.set('subview', state.dataSubView);
      if (state.spiGranularity !== 'config') params.set('granularity', state.spiGranularity);

      const sf = state.spiFilters;
      if (sf.search) params.set('q', sf.search);
      if (sf.process !== 'all') params.set('proc', sf.process);
      if (sf.feature !== 'all') params.set('feat', sf.feature);
      if (sf.availability !== 'all') params.set('avail', sf.availability);
      if (sf.framework !== 'all') params.set('fw', sf.framework);
      if (sf.module !== 'all') params.set('mod', sf.module);
      if (sf.kind !== 'all') params.set('kind', sf.kind);
      if (sf.legacyStatus !== 'all') params.set('leg', sf.legacyStatus);

      const cf = state.commitFilters;
      if (cf.search) params.set('cq', cf.search);
      if (cf.legacyMode !== 'all') params.set('cmode', cf.legacyMode);
      if (cf.category !== 'all') params.set('ccat', cf.category);
      if (cf.featureArea !== 'all') params.set('carea', cf.featureArea);
      if (cf.module !== 'all') params.set('cmod', cf.module);
      if (cf.legacyAddCat !== 'all') params.set('clcat', cf.legacyAddCat);
    }
    const str = params.toString();
    return str ? '#' + str : '';
  }

  function syncStateToHistory(push) {
    const targetHash = buildTargetHash();
    const targetUrl = window.location.pathname + window.location.search + targetHash;
    const snapshot = getStateSnapshot();
    if (push && window.location.hash !== targetHash) {
      window.history.pushState(snapshot, '', targetUrl);
    } else {
      window.history.replaceState(snapshot, '', targetUrl);
    }
  }

  function restoreUiFromState() {
    const pieSelect = document.getElementById('pieGroupBySelect');
    if (pieSelect) pieSelect.value = state.pieGroupBy;
    const hModeSelect = document.getElementById('historyChartModeSelect');
    if (hModeSelect) hModeSelect.value = state.historyChartMode;
    const tMetricSelect = document.getElementById('trajectoryMetricSelect');
    if (tMetricSelect) tMetricSelect.value = state.trajectoryMetric;

    renderPieSection();
    renderHistoryEvolutionSection();

    syncGranularityButtons();
    document.getElementById('spiSearchInput').value = state.spiFilters.search;
    document.getElementById('spiProcessFilter').value = state.spiFilters.process;
    document.getElementById('spiFeatureFilter').value = state.spiFilters.feature;
    document.getElementById('spiAvailabilityFilter').value = state.spiFilters.availability;
    document.getElementById('spiFrameworkFilter').value = state.spiFilters.framework;
    document.getElementById('spiModuleFilter').value = state.spiFilters.module;
    document.getElementById('spiKindFilter').value = state.spiFilters.kind;
    document.getElementById('spiLegacyStatusFilter').value = state.spiFilters.legacyStatus;
    document.getElementById('spiPageSizeSelect').value = String(state.spiPageSize);

    document.getElementById('commitSearchInput').value = state.commitFilters.search;
    document.getElementById('commitLegacyModeFilter').value = state.commitFilters.legacyMode;
    document.getElementById('commitCategoryFilter').value = state.commitFilters.category;
    document.getElementById('commitFeatureAreaFilter').value = state.commitFilters.featureArea;
    document.getElementById('commitModuleFilter').value = state.commitFilters.module;
    document.getElementById('commitLegacyAddCatFilter').value = state.commitFilters.legacyAddCat;
    document.getElementById('commitPageSizeSelect').value = String(state.commitPageSize);

    const banner = document.getElementById('activeFilterBanner');
    const bannerText = document.getElementById('activeFilterBannerText');
    if (state.filterBannerText) {
      banner.classList.remove('hidden');
      bannerText.textContent = state.filterBannerText;
    } else {
      banner.classList.add('hidden');
    }

    setDataSubView(state.dataSubView, { skipHistory: true });
    applySpiFiltersAndRender({ preservePage: true, skipHistory: true });
    applyCommitFiltersAndRender({ preservePage: true, skipHistory: true });
    switchMainTab(state.activeTab, { skipScroll: true, skipHistory: true });
  }

  function switchMainTab(tabName, opts) {
    const isObj = opts && typeof opts === 'object';
    const skipScroll = isObj ? Boolean(opts.skipScroll) : Boolean(opts);
    const skipHistory = isObj ? Boolean(opts.skipHistory) : false;
    const pushHistory = isObj && opts.pushHistory !== undefined ? Boolean(opts.pushHistory) : !skipHistory;

    state.activeTab = tabName === 'data' ? 'data' : 'insights';
    const isInsights = state.activeTab === 'insights';

    const btnInsights = document.getElementById('tabBtnInsights');
    const btnData = document.getElementById('tabBtnData');
    const panelInsights = document.getElementById('insightsTabPanel');
    const panelData = document.getElementById('dataTabPanel');
    const quickJumps = document.getElementById('insightsQuickJumps');

    btnInsights.classList.toggle('active', isInsights);
    btnInsights.setAttribute('aria-selected', String(isInsights));
    btnData.classList.toggle('active', !isInsights);
    btnData.setAttribute('aria-selected', String(!isInsights));

    panelInsights.classList.toggle('hidden', !isInsights);
    panelData.classList.toggle('hidden', isInsights);
    if (quickJumps) {
      quickJumps.classList.toggle('hidden', !isInsights);
    }

    if (isInsights) {
      renderHistoryEvolutionSection();
    }

    if (!skipHistory) {
      syncStateToHistory(pushHistory);
    }

    if (!skipScroll) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  function setDataSubView(subView, opts) {
    const skipHistory = opts && opts.skipHistory;
    const pushHistory = opts && opts.pushHistory !== undefined ? Boolean(opts.pushHistory) : !skipHistory;

    state.dataSubView = subView;
    document.querySelectorAll('[data-subview-btn]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-subview-btn') === subView);
    });

    const spiView = document.getElementById('spiInventorySubView');
    const commitsView = document.getElementById('commitHistorySubView');

    if (subView === 'spi') {
      spiView.classList.remove('hidden');
      commitsView.classList.add('hidden');
    } else if (subView === 'commits') {
      spiView.classList.add('hidden');
      commitsView.classList.remove('hidden');
    } else {
      spiView.classList.remove('hidden');
      commitsView.classList.remove('hidden');
    }

    if (!skipHistory) {
      syncStateToHistory(pushHistory);
    }
  }

  function jumpToDataTab(opts) {
    const subview = opts.subview || 'spi';
    setDataSubView(subview, { skipHistory: true });

    resetSpiFilterStateOnly();
    resetCommitFilterStateOnly();
    state.expandedSpiRowIds.clear();
    state.expandedCommitHashes.clear();

    const descParts = [];

    if (subview === 'spi' || subview === 'both') {
      if (opts.granularity) {
        state.spiGranularity = opts.granularity;
        syncGranularityButtons();
      }
      if (opts.feature) {
        state.spiFilters.feature = opts.feature;
        document.getElementById('spiFeatureFilter').value = opts.feature;
        descParts.push('Feature Category = "' + opts.feature + '"');
      }
      if (opts.availability) {
        state.spiFilters.availability = opts.availability;
        document.getElementById('spiAvailabilityFilter').value = opts.availability;
        const label = AVAILABILITY_META[opts.availability]
          ? AVAILABILITY_META[opts.availability].shortLabel
          : opts.availability === 'apple-only-all'
            ? 'All Strictly Apple-Only SPIs (635)'
            : opts.availability;
        descParts.push('3P Availability = "' + label + '"');
      }
      if (opts.framework) {
        state.spiFilters.framework = opts.framework;
        document.getElementById('spiFrameworkFilter').value = opts.framework;
        descParts.push('Framework = "' + opts.framework + '"');
      }
      if (opts.module) {
        state.spiFilters.module = opts.module;
        document.getElementById('spiModuleFilter').value = opts.module;
        descParts.push('WebKit Module = "' + opts.module + '"');
      }
      if (opts.kind) {
        state.spiFilters.kind = opts.kind;
        document.getElementById('spiKindFilter').value = opts.kind;
        descParts.push('Declaration Kind = "' + opts.kind + '"');
      }
      if (opts.process) {
        state.spiFilters.process = opts.process;
        document.getElementById('spiProcessFilter').value = opts.process;
        descParts.push('Process Configuration = "' + opts.process + '"');
      }
      if (opts.legacyStatus) {
        state.spiFilters.legacyStatus = opts.legacyStatus;
        document.getElementById('spiLegacyStatusFilter').value = opts.legacyStatus;
        descParts.push('Allowlist Filter = "' + opts.legacyStatus + '"');
      }
      if (opts.search) {
        state.spiFilters.search = opts.search;
        document.getElementById('spiSearchInput').value = opts.search;
        descParts.push('Search Query = "' + opts.search + '"');
      }
      applySpiFiltersAndRender({ skipHistory: true });
    }

    if (subview === 'commits' || subview === 'both') {
      if (opts.legacyOnly) {
        state.commitFilters.legacyMode = 'legacy_additions_only';
        document.getElementById('commitLegacyModeFilter').value = 'legacy_additions_only';
        descParts.push('24 Post-Baseline Commits Adding to AllowedSPI-legacy.toml');
      }
      if (opts.commitCategory) {
        state.commitFilters.category = opts.commitCategory;
        document.getElementById('commitCategoryFilter').value = opts.commitCategory;
        const catLabel = state.categoryLabelsById.get(opts.commitCategory) || opts.commitCategory;
        descParts.push('Commit Purpose Category = "' + catLabel + '"');
      }
      if (opts.commitFeatureArea) {
        state.commitFilters.featureArea = opts.commitFeatureArea;
        document.getElementById('commitFeatureAreaFilter').value = opts.commitFeatureArea;
        descParts.push('Commit Feature Area = "' + opts.commitFeatureArea + '"');
      }
      if (opts.commitModule) {
        state.commitFilters.module = opts.commitModule;
        document.getElementById('commitModuleFilter').value = opts.commitModule;
        descParts.push('Touched Module = "' + opts.commitModule + '"');
      }
      if (opts.legacyAddCat) {
        state.commitFilters.legacyAddCat = opts.legacyAddCat;
        document.getElementById('commitLegacyAddCatFilter').value = opts.legacyAddCat;
        const lLabel = state.legacyCatLabelsById.get(opts.legacyAddCat) || opts.legacyAddCat;
        descParts.push('Legacy Addition Root Cause = "' + lLabel + '"');
      }
      if (opts.commitSearch) {
        state.commitFilters.search = opts.commitSearch;
        document.getElementById('commitSearchInput').value = opts.commitSearch;
        descParts.push('Commit Search = "' + opts.commitSearch + '"');
      }
      if (opts.expandCommitHash) {
        state.expandedCommitHashes.add(opts.expandCommitHash);
      }
      applyCommitFiltersAndRender({ skipHistory: true });
    }

    const banner = document.getElementById('activeFilterBanner');
    const bannerText = document.getElementById('activeFilterBannerText');
    if (descParts.length > 0) {
      state.filterBannerText = 'Active Insight Filter: ' + descParts.join(' \u2022 ');
      banner.classList.remove('hidden');
      bannerText.textContent = state.filterBannerText;
    } else {
      state.filterBannerText = '';
      banner.classList.add('hidden');
    }

    switchMainTab('data', { skipScroll: false, skipHistory: true });
    syncStateToHistory(true);
  }

  // =========================================================================
  // SECTION 3: Interactive Pie / Donut Chart of Allowed SPIs & Features
  // =========================================================================

  function getPieGroupingData(groupBy) {
    const meta = state.inventory.metadata;
    const totalUnique = meta.totals.unique_spis || 2014;

    if (groupBy === 'availability_3p') {
      return (meta.by_availability_3p || []).map((item) => {
        const avMeta = AVAILABILITY_META[item.id] || {};
        return {
          key: item.id,
          label: avMeta.shortLabel || item.label,
          count: item.count,
          percentage: item.percentage,
          color: avMeta.color || '#38bdf8',
          description: item.description,
          jumpOpts: { subview: 'spi', granularity: 'unique', availability: item.id }
        };
      });
    }

    if (groupBy === 'module') {
      const entries = Object.entries(meta.by_module || {}).sort((a, b) => (b[1].total || 0) - (a[1].total || 0));
      const rawTotal = meta.totals.raw_block_entries || 2097;
      const modDescriptions = {
        WebKit: 'Multi-process UIProcess, WebContent, Networking, GPUProcess, and webpushd system integration SPIs.',
        WebCore: 'Platform Abstraction Layer (PAL) & core rendering, layout, media, CoreText, and graphics SPIs.',
        WebKitLegacy: 'Single-process legacy WebKit1 / UIWebView compatibility SPIs (100% in AllowedSPI-legacy.toml).',
        JavaScriptCore: 'JS engine Mach exception handling, JIT/ExecutableAllocator, and Darwin OS thread/memory SPIs.',
        WebGPU: 'Metal shader compilation & GPU device private SPIs.'
      };
      return entries.map(([mod, obj], idx) => {
        const cnt = typeof obj === 'number' ? obj : obj.total || 0;
        return {
          key: mod,
          label: mod + ' Module',
          count: cnt,
          percentage: Number(((cnt / rawTotal) * 100).toFixed(1)),
          color: SLICE_PALETTE[idx % SLICE_PALETTE.length],
          description: modDescriptions[mod] || '',
          jumpOpts: { subview: 'spi', granularity: 'toml', module: mod }
        };
      });
    }

    if (groupBy === 'kind') {
      const entries = Object.entries(meta.by_kind_unique || {}).sort((a, b) => b[1] - a[1]);
      const kindDescriptions = {
        selectors: 'Objective-C selectors invoked on system classes (UIKit, AVKit, PassKit, SafariServices, etc.).',
        symbols: 'C / C++ functions, global constants, and Darwin/CoreText/CoreGraphics/CFNetwork symbols.',
        classes: 'Private Objective-C classes instantiated or subclassed by WebKit.',
        'swift-decls': 'Non-public Swift Foundation/UIKit/UIIntelligenceSupport declarations imported by WebKit Swift files.'
      };
      return entries.map(([kind, count], idx) => ({
        key: kind,
        label: kind,
        count,
        percentage: Number(((count / totalUnique) * 100).toFixed(1)),
        color: SLICE_PALETTE[idx % SLICE_PALETTE.length],
        description: kindDescriptions[kind] || '',
        jumpOpts: { subview: 'spi', granularity: 'unique', kind }
      }));
    }

    return (meta.by_feature_category || []).map((item, idx) => ({
      key: item.feature_category,
      label: item.feature_category,
      count: item.count,
      percentage: item.percentage,
      color: SLICE_PALETTE[idx % SLICE_PALETTE.length],
      description: FEATURE_DESCRIPTIONS[item.feature_category] || 'Contributes to WebKit iOS platform integration.',
      jumpOpts: { subview: 'spi', granularity: 'config', feature: item.feature_category }
    }));
  }

  function polarToCartesian(cx, cy, r, angleInDegrees) {
    const rad = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: cx + r * Math.cos(rad),
      y: cy + r * Math.sin(rad)
    };
  }

  function describeDonutArc(cx, cy, rOuter, rInner, startAngle, endAngle) {
    const clampedEnd = endAngle - startAngle >= 359.99 ? startAngle + 359.95 : endAngle;
    const startOuter = polarToCartesian(cx, cy, rOuter, clampedEnd);
    const endOuter = polarToCartesian(cx, cy, rOuter, startAngle);
    const startInner = polarToCartesian(cx, cy, rInner, clampedEnd);
    const endInner = polarToCartesian(cx, cy, rInner, startAngle);
    const largeArcFlag = clampedEnd - startAngle <= 180 ? '0' : '1';

    return [
      'M', startOuter.x.toFixed(2), startOuter.y.toFixed(2),
      'A', rOuter, rOuter, 0, largeArcFlag, 0, endOuter.x.toFixed(2), endOuter.y.toFixed(2),
      'L', endInner.x.toFixed(2), endInner.y.toFixed(2),
      'A', rInner, rInner, 0, largeArcFlag, 1, startInner.x.toFixed(2), startInner.y.toFixed(2),
      'Z'
    ].join(' ');
  }

  function renderPieSection() {
    const svg = document.getElementById('featurePieSvg');
    const listContainer = document.getElementById('featurePieList');
    const tooltip = document.getElementById('pieTooltip');
    const listHeader = document.getElementById('pieListHeaderTitle');

    const slices = getPieGroupingData(state.pieGroupBy);
    const totalCount = slices.reduce((acc, s) => acc + s.count, 0);

    if (listHeader) {
      listHeader.textContent =
        state.pieGroupBy === 'feature_category'
          ? 'All 17 Feature Categories & Capabilities Enabled (Click Any Row to Filter Raw Data)'
          : 'Breakdown Slices (' + slices.length + ' Groups \u2014 Click Any Row to Filter Raw Data)';
    }

    svg.replaceChildren();
    listContainer.replaceChildren();

    const cx = 190;
    const cy = 190;
    const rOuter = 156;
    const rInner = 86;

    const slicesGroup = svgEl('g');
    svg.appendChild(slicesGroup);

    const centerGroup = svgEl('g');
    const centerValueText = svgEl('text', {
      x: cx,
      y: cy - 8,
      'text-anchor': 'middle',
      fill: '#f8fafc',
      'font-family': 'JetBrains Mono, monospace',
      'font-size': '26',
      'font-weight': '700'
    });
    centerValueText.textContent = fmtNum(totalCount);

    const centerSubText1 = svgEl('text', {
      x: cx,
      y: cy + 15,
      'text-anchor': 'middle',
      fill: '#94a3b8',
      'font-size': '11.5',
      'font-weight': '600'
    });
    centerSubText1.textContent = state.pieGroupBy === 'module' ? 'TOML Entries' : 'Unique iOS SPIs';

    const centerSubText2 = svgEl('text', {
      x: cx,
      y: cy + 33,
      'text-anchor': 'middle',
      fill: '#38bdf8',
      'font-size': '11',
      'font-weight': '600'
    });
    centerSubText2.textContent = slices.length + ' categories';

    centerGroup.appendChild(centerValueText);
    centerGroup.appendChild(centerSubText1);
    centerGroup.appendChild(centerSubText2);
    svg.appendChild(centerGroup);

    let currentAngle = 0;

    slices.forEach((slice) => {
      const sweep = totalCount > 0 ? (slice.count / totalCount) * 360 : 0;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweep;
      currentAngle = endAngle;

      const pathData = describeDonutArc(cx, cy, rOuter, rInner, startAngle, endAngle);
      const pathNode = svgEl('path', {
        d: pathData,
        fill: slice.color,
        stroke: '#0f172a',
        'stroke-width': '2',
        class: 'pie-slice-path'
      });

      const row = el('div', 'feature-slice-row');
      const topRow = el('div', 'feature-slice-top');

      const nameWrap = el('div', 'feature-slice-name');
      const swatch = el('span', 'slice-swatch');
      swatch.style.backgroundColor = slice.color;
      nameWrap.appendChild(swatch);
      nameWrap.appendChild(el('span', '', slice.label));

      const rightWrap = el('div', 'feature-slice-right');
      rightWrap.appendChild(
        el('span', 'feature-slice-stats', fmtNum(slice.count) + ' (' + fmtPct(slice.percentage) + ')')
      );
      const jumpBtn = el('button', 'insight-data-link', 'View Raw SPIs \u2192');
      jumpBtn.type = 'button';
      rightWrap.appendChild(jumpBtn);

      topRow.appendChild(nameWrap);
      topRow.appendChild(rightWrap);

      const barTrack = el('div', 'feature-slice-bar-track');
      const barFill = el('div', 'feature-slice-bar-fill');
      barFill.style.width = Math.max(2, slice.percentage) + '%';
      barFill.style.backgroundColor = slice.color;
      barTrack.appendChild(barFill);

      const desc = el('div', 'feature-slice-desc', slice.description);

      row.appendChild(topRow);
      row.appendChild(barTrack);
      row.appendChild(desc);

      function highlightSlice(active) {
        row.classList.toggle('hovered', active);
        pathNode.classList.toggle('hovered', active);
        slicesGroup.classList.toggle(
          'has-hovered-slice',
          active || Boolean(slicesGroup.querySelector('.pie-slice-path.hovered'))
        );
        if (active) {
          centerValueText.textContent = fmtNum(slice.count);
          centerSubText1.textContent = fmtPct(slice.percentage) + ' of total';
          centerSubText2.textContent =
            slice.label.length > 24 ? slice.label.slice(0, 22) + '\u2026' : slice.label;
        } else {
          centerValueText.textContent = fmtNum(totalCount);
          centerSubText1.textContent = state.pieGroupBy === 'module' ? 'TOML Entries' : 'Unique iOS SPIs';
          centerSubText2.textContent = slices.length + ' categories';
          tooltip.classList.add('hidden');
        }
      }

      pathNode.addEventListener('mouseenter', (ev) => {
        highlightSlice(true);
        showPieTooltip(ev, slice);
      });
      pathNode.addEventListener('mousemove', (ev) => {
        showPieTooltip(ev, slice);
      });
      pathNode.addEventListener('mouseleave', () => {
        highlightSlice(false);
      });
      pathNode.addEventListener('click', () => {
        jumpToDataTab(slice.jumpOpts);
      });

      row.addEventListener('mouseenter', () => highlightSlice(true));
      row.addEventListener('mouseleave', () => highlightSlice(false));
      row.addEventListener('click', () => {
        jumpToDataTab(slice.jumpOpts);
      });

      slicesGroup.appendChild(pathNode);
      listContainer.appendChild(row);
    });
  }

  function showPieTooltip(ev, slice) {
    const tooltip = document.getElementById('pieTooltip');
    const box = document.querySelector('.pie-chart-box');
    if (!tooltip || !box) return;

    tooltip.replaceChildren();
    const title = el('div', 'tooltip-title');
    title.appendChild(el('span', '', slice.label));
    title.appendChild(el('span', 'tooltip-val', fmtPct(slice.percentage)));
    tooltip.appendChild(title);

    const row1 = el('div', 'tooltip-row');
    row1.appendChild(el('span', 'tooltip-label', 'Allowed SPI Count:'));
    row1.appendChild(el('span', 'tooltip-val', fmtNum(slice.count)));
    tooltip.appendChild(row1);

    if (slice.description) {
      const desc = el('div', '', slice.description);
      desc.style.marginTop = '6px';
      desc.style.fontSize = '11.5px';
      desc.style.color = '#cbd5e1';
      tooltip.appendChild(desc);
    }

    const hint = el('div', '', 'Click to inspect these SPIs in the Raw Data tab \u2192');
    hint.style.marginTop = '6px';
    hint.style.fontSize = '11px';
    hint.style.fontWeight = '600';
    hint.style.color = '#38bdf8';
    tooltip.appendChild(hint);

    tooltip.classList.remove('hidden');
    const rect = box.getBoundingClientRect();
    const ttWidth = tooltip.offsetWidth || 240;
    const left = Math.max(8, Math.min(ev.clientX - rect.left + 12, Math.max(8, rect.width - ttWidth - 8)));
    const top = Math.max(8, ev.clientY - rect.top - 20);
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  // =========================================================================
  // SECTION 4: Historical Evolution Over Time (159 Commits)
  // =========================================================================

  function renderHistoryEvolutionSection() {
    const mode = state.historyChartMode;
    const metricControl = document.getElementById('trajectoryMetricControl');
    if (metricControl) {
      metricControl.classList.toggle('hidden', mode !== 'trajectory');
    }

    if (mode === 'trajectory') {
      renderTrajectoryChart();
    } else if (mode === 'purpose_category') {
      renderCategoryBarChart(state.history.metadata.by_category || [], 'commitCategory');
    } else {
      renderCategoryBarChart(state.history.metadata.by_feature_area || [], 'commitFeatureArea');
    }

    renderHistoryMilestones();
  }

  function renderTrajectoryChart() {
    const svg = document.getElementById('historyChartSvg');
    const legend = document.getElementById('historyChartLegend');
    const tooltip = document.getElementById('historyTooltip');
    svg.replaceChildren();
    legend.replaceChildren();
    svg.style.height = '';

    const timeline = state.history.timeline || [];
    if (timeline.length === 0) return;

    const rawWidth =
      (svg.parentElement && svg.parentElement.clientWidth) ||
      Math.max(320, (document.documentElement.clientWidth || 1200) - 48);
    const width = Math.max(320, rawWidth);
    const isMobile = width < 640;
    const height = isMobile ? 275 : 325;
    const padLeft = isMobile ? 44 : 62;
    const padRight = isMobile ? 14 : 28;
    const padTop = isMobile ? 18 : 22;
    const padBottom = isMobile ? 38 : 42;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);

    const metric = state.trajectoryMetric;

    function xForIndex(i) {
      if (timeline.length <= 1) return padLeft;
      return padLeft + (i / (timeline.length - 1)) * plotW;
    }

    if (metric === 'deltas') {
      const legendItems = [
        { color: '#fb7185', label: 'SPIs Added in Commit (+Reviewed / Feature Additions)' },
        { color: '#fbbf24', label: 'Commit Adding to AllowedSPI-legacy.toml (24 post-baseline commits)' },
        { color: '#34d399', label: 'SPIs Removed in Commit (-Cleanups & SDKDB Promotions)' }
      ];
      for (const item of legendItems) {
        const li = el('div', 'legend-item');
        const sw = el('span', 'legend-swatch');
        sw.style.backgroundColor = item.color;
        li.appendChild(sw);
        li.appendChild(el('span', '', item.label));
        legend.appendChild(li);
      }

      const maxDelta = 120;
      const zeroY = padTop + plotH * 0.52;
      const halfH = plotH * 0.45;

      const gridTicks = [-100, -50, 0, 50, 100];
      for (const tick of gridTicks) {
        const y = zeroY - (tick / maxDelta) * halfH;
        svg.appendChild(
          svgEl('line', {
            x1: padLeft,
            y1: y,
            x2: width - padRight,
            y2: y,
            stroke: tick === 0 ? '#475569' : '#1e293b',
            'stroke-width': tick === 0 ? '1.5' : '1',
            'stroke-dasharray': tick === 0 ? '' : '3,3'
          })
        );
        const label = svgEl('text', {
          x: padLeft - 6,
          y: y + 4,
          'text-anchor': 'end',
          fill: '#94a3b8',
          'font-family': 'JetBrains Mono, monospace',
          'font-size': isMobile ? '9.5' : '10.5'
        });
        label.textContent = (tick > 0 ? '+' : '') + tick;
        svg.appendChild(label);
      }

      const barW = Math.max(isMobile ? 2 : 4, plotW / timeline.length - (isMobile ? 0.6 : 1.5));
      timeline.forEach((pt, idx) => {
        if (idx === 0) return; // Skip initial 2,021 baseline dump so post-baseline deltas are legible
        const x = xForIndex(idx) - barW / 2;
        const added = Math.min(maxDelta, pt.added_count || 0);
        const removed = Math.min(maxDelta, pt.removed_count || 0);

        if (added > 0) {
          const h = Math.max(2, (added / maxDelta) * halfH);
          const rect = svgEl('rect', {
            x,
            y: zeroY - h,
            width: barW,
            height: h,
            fill: pt.legacy_added_count > 0 ? '#fbbf24' : '#fb7185',
            class: 'chart-bar-rect'
          });
          attachTimelinePointEvents(rect, pt, tooltip);
          svg.appendChild(rect);
        }

        if (removed > 0) {
          const h = Math.max(2, (removed / maxDelta) * halfH);
          const rect = svgEl('rect', {
            x,
            y: zeroY,
            width: barW,
            height: h,
            fill: '#34d399',
            class: 'chart-bar-rect'
          });
          attachTimelinePointEvents(rect, pt, tooltip);
          svg.appendChild(rect);
        }
      });

      renderTimelineXAxis(svg, timeline, xForIndex, height, padBottom, isMobile);
      return;
    }

    const seriesList =
      metric === 'modules'
        ? [
            { key: 'WebKit', label: 'WebKit (1,051 \u2192 1,405 peak \u2192 1,077)', color: '#38bdf8', getter: (p) => (p.by_module && p.by_module.WebKit) || 0 },
            { key: 'WebCore', label: 'WebCore (840 \u2192 871)', color: '#2dd4bf', getter: (p) => (p.by_module && p.by_module.WebCore) || 0 },
            { key: 'WebKitLegacy', label: 'WebKitLegacy (105 \u2192 114, +8.6%, 0 removals)', color: '#fb7185', getter: (p) => (p.by_module && p.by_module.WebKitLegacy) || 0 },
            { key: 'JavaScriptCore', label: 'JavaScriptCore (23 \u2192 23)', color: '#fbbf24', getter: (p) => (p.by_module && p.by_module.JavaScriptCore) || 0 }
          ]
        : [
            { key: 'legacy_file_entries', label: 'Legacy Allowlist Entries (AllowedSPI-legacy.toml: 1,956 \u2192 1,889)', color: '#fb7185', getter: (p) => p.legacy_file_entries || 0 },
            { key: 'reviewed_file_entries', label: 'Reviewed Allowlist Entries (AllowedSPI.toml: 65 \u2192 496 peak \u2192 197)', color: '#34d399', getter: (p) => p.reviewed_file_entries || 0 }
          ];

    for (const s of seriesList) {
      const li = el('div', 'legend-item');
      const sw = el('span', 'legend-swatch');
      sw.style.backgroundColor = s.color;
      li.appendChild(sw);
      li.appendChild(el('span', '', s.label));
      legend.appendChild(li);
    }

    if (metric === 'totals') {
      const spikeLegend = el('div', 'legend-item');
      const sw = el('span', 'legend-swatch');
      sw.style.backgroundColor = '#fbbf24';
      sw.style.borderRadius = '50%';
      spikeLegend.appendChild(sw);
      spikeLegend.appendChild(el('span', '', 'Amber Marker = Post-Baseline Addition to AllowedSPI-legacy.toml (24 commits)'));
      spikeLegend.addEventListener('click', () => {
        jumpToDataTab({ subview: 'commits', legacyOnly: true });
      });
      legend.appendChild(spikeLegend);
    }

    const maxVal = metric === 'modules' ? 1500 : 2100;
    const yTicks = metric === 'modules' ? [0, 350, 700, 1050, 1400] : [0, 500, 1000, 1500, 2000];

    function yForVal(v) {
      return padTop + plotH - (v / maxVal) * plotH;
    }

    for (const tick of yTicks) {
      const y = yForVal(tick);
      svg.appendChild(
        svgEl('line', {
          x1: padLeft,
          y1: y,
          x2: width - padRight,
          y2: y,
          stroke: '#1e293b',
          'stroke-width': '1',
          'stroke-dasharray': tick === 0 ? '' : '3,3'
        })
      );
      const txt = svgEl('text', {
        x: padLeft - 6,
        y: y + 4,
        'text-anchor': 'end',
        fill: '#94a3b8',
        'font-family': 'JetBrains Mono, monospace',
        'font-size': isMobile ? '9.5' : '10.5'
      });
      txt.textContent = fmtNum(tick);
      svg.appendChild(txt);
    }

    for (const s of seriesList) {
      const pts = timeline.map((pt, i) => xForIndex(i).toFixed(1) + ',' + yForVal(s.getter(pt)).toFixed(1));
      svg.appendChild(
        svgEl('polyline', {
          fill: 'none',
          stroke: s.color,
          'stroke-width': '2.2',
          points: pts.join(' ')
        })
      );
    }

    const spikeMarkers = [];
    timeline.forEach((pt, i) => {
      const cx = xForIndex(i);
      const isLegacySpike = i >= 1 && (pt.legacy_added_count || 0) > 0;

      for (const s of seriesList) {
        const cy = yForVal(s.getter(pt));
        if (s.key === 'legacy_file_entries' && isLegacySpike) {
          const marker = svgEl('circle', {
            cx,
            cy,
            r: isMobile ? '4.2' : '4.8',
            fill: '#fbbf24',
            stroke: '#070b14',
            'stroke-width': '1.5',
            class: 'chart-point-circle'
          });
          attachTimelinePointEvents(marker, pt, tooltip);
          spikeMarkers.push(marker);
        } else {
          const dot = svgEl('circle', {
            cx,
            cy,
            r: isMobile ? '2.2' : '2.8',
            fill: s.color,
            class: 'chart-point-circle'
          });
          attachTimelinePointEvents(dot, pt, tooltip);
          svg.appendChild(dot);
        }
      }
    });
    for (const marker of spikeMarkers) {
      svg.appendChild(marker);
    }

    renderTimelineXAxis(svg, timeline, xForIndex, height, padBottom, isMobile);
  }

  function renderTimelineXAxis(svg, timeline, xForIndex, height, padBottom, isMobile) {
    const labelIndices = isMobile
      ? [0, 50, 101, timeline.length - 1]
      : [0, 25, 50, 77, 101, 130, timeline.length - 1];
    const uniqueIndices = Array.from(new Set(labelIndices)).filter((i) => i >= 0 && i < timeline.length);

    for (const i of uniqueIndices) {
      const pt = timeline[i];
      const x = xForIndex(i);
      const txt = svgEl('text', {
        x,
        y: height - padBottom + 20,
        'text-anchor': i === 0 ? 'start' : i === timeline.length - 1 ? 'end' : 'middle',
        fill: '#94a3b8',
        'font-family': 'JetBrains Mono, monospace',
        'font-size': isMobile ? '9.5' : '10.5'
      });
      txt.textContent = isMobile ? fmtDateShort(pt.date) : fmtDateShort(pt.date) + ' (#' + pt.index + ')';
      svg.appendChild(txt);
    }
  }

  function attachTimelinePointEvents(node, pt, tooltip) {
    const wrapper = document.querySelector('.chart-svg-wrapper');
    node.addEventListener('mouseenter', (ev) => {
      showTimelineTooltip(ev, pt, tooltip, wrapper);
    });
    node.addEventListener('mousemove', (ev) => {
      showTimelineTooltip(ev, pt, tooltip, wrapper);
    });
    node.addEventListener('mouseleave', () => {
      tooltip.classList.add('hidden');
    });
    node.addEventListener('click', () => {
      jumpToDataTab({
        subview: 'commits',
        commitSearch: pt.short_hash,
        expandCommitHash: pt.hash
      });
    });
  }

  function showTimelineTooltip(ev, pt, tooltip, wrapper) {
    if (!tooltip || !wrapper) return;
    tooltip.replaceChildren();

    const title = el('div', 'tooltip-title');
    title.appendChild(el('span', '', fmtDateShort(pt.date) + ' \u2022 ' + pt.short_hash));
    title.appendChild(el('span', 'tooltip-val', 'Commit #' + pt.index));
    tooltip.appendChild(title);

    const subj = el('div', '', pt.subject);
    subj.style.fontWeight = '600';
    subj.style.color = '#e0f2fe';
    subj.style.marginBottom = '6px';
    tooltip.appendChild(subj);

    const catLabel = state.categoryLabelsById.get(pt.primary_category) || pt.primary_category;
    const rows = [
      ['Purpose Category:', catLabel],
      ['Feature Area:', pt.feature_area],
      ['Commit Delta:', '+' + pt.added_count + ' added / -' + pt.removed_count + ' removed'],
      ['Legacy Delta:', '+' + pt.legacy_added_count + ' legacy / -' + pt.legacy_removed_count + ' legacy'],
      ['Total Unique SPIs:', fmtNum(pt.unique_spis)],
      ['Legacy vs. Reviewed:', fmtNum(pt.legacy_file_entries) + ' legacy / ' + fmtNum(pt.reviewed_file_entries) + ' reviewed']
    ];

    for (const [k, v] of rows) {
      const r = el('div', 'tooltip-row');
      r.appendChild(el('span', 'tooltip-label', k));
      r.appendChild(el('span', 'tooltip-val', v));
      tooltip.appendChild(r);
    }

    const hint = el('div', '', 'Click to open & expand this commit in the Data tab \u2192');
    hint.style.marginTop = '6px';
    hint.style.fontSize = '11px';
    hint.style.color = '#38bdf8';
    hint.style.fontWeight = '600';
    tooltip.appendChild(hint);

    tooltip.classList.remove('hidden');
    const rect = wrapper.getBoundingClientRect();
    const ttWidth = tooltip.offsetWidth || 300;
    let left = ev.clientX - rect.left + 14;
    if (left + ttWidth > rect.width - 8) {
      left = ev.clientX - rect.left - ttWidth - 10;
    }
    left = Math.max(8, Math.min(left, Math.max(8, rect.width - ttWidth - 8)));
    const top = Math.max(8, ev.clientY - rect.top - 30);
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function renderCategoryBarChart(items, filterKey) {
    const svg = document.getElementById('historyChartSvg');
    const legend = document.getElementById('historyChartLegend');
    svg.replaceChildren();
    legend.replaceChildren();

    const legendItems = [
      { color: '#fb7185', label: 'Gross SPIs Added in Category (Excluding Initial Baseline Dump)' },
      { color: '#34d399', label: 'Gross SPIs Removed in Category' }
    ];
    for (const item of legendItems) {
      const li = el('div', 'legend-item');
      const sw = el('span', 'legend-swatch');
      sw.style.backgroundColor = item.color;
      li.appendChild(sw);
      li.appendChild(el('span', '', item.label));
      legend.appendChild(li);
    }

    const filtered = items.filter((it) => it.id !== 'initial-allowlist');
    const rawWidth =
      (svg.parentElement && svg.parentElement.clientWidth) ||
      Math.max(320, (document.documentElement.clientWidth || 1200) - 48);
    const width = Math.max(320, rawWidth);
    const isCompact = width < 680;

    const maxVal = Math.max(
      50,
      ...filtered.map((it) => {
        const added = it.id ? it.added_spis : it.feature_area === 'SPI Tooling & Allowlist Baseline' ? Math.max(0, (it.added_spis || 0) - 2021) : it.added_spis || 0;
        return Math.max(added, it.removed_spis || 0);
      })
    );

    if (isCompact) {
      const padLeft = 10;
      const padRight = 10;
      const padTop = 8;
      const padBottom = 8;
      const rowH = 38;
      const height = padTop + padBottom + filtered.length * rowH;
      const plotW = width - padLeft - padRight;

      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.style.height = height + 'px';

      filtered.forEach((it, idx) => {
        const displayLabel = it.label || it.feature_area;
        const filterValue = it.id || it.feature_area;
        const commitsCnt = it.commit_count || 0;
        const rawAdded =
          !it.id && it.feature_area === 'SPI Tooling & Allowlist Baseline'
            ? Math.max(0, (it.added_spis || 0) - 2021)
            : it.added_spis || 0;
        const rawRemoved = it.removed_spis || 0;

        const rowTop = padTop + idx * rowH;
        const label = svgEl('text', {
          x: padLeft,
          y: rowTop + 13,
          'text-anchor': 'start',
          fill: '#e2e8f0',
          'font-size': '11',
          'font-weight': '600'
        });
        const fullLbl = displayLabel + ' (' + commitsCnt + 'c)';
        label.textContent = fullLbl.length > 34 ? fullLbl.slice(0, 32) + '\u2026' : fullLbl;
        svg.appendChild(label);

        const statsTxt = svgEl('text', {
          x: width - padRight,
          y: rowTop + 13,
          'text-anchor': 'end',
          fill: '#94a3b8',
          'font-family': 'JetBrains Mono, monospace',
          'font-size': '10'
        });
        statsTxt.textContent = '+' + fmtNum(rawAdded) + ' / -' + fmtNum(rawRemoved);
        svg.appendChild(statsTxt);

        const addedW = (rawAdded / maxVal) * plotW;
        const removedW = (rawRemoved / maxVal) * plotW;
        const barH = 6.5;

        const rectAdd = svgEl('rect', {
          x: padLeft,
          y: rowTop + 17,
          width: Math.max(2, addedW),
          height: barH,
          fill: '#fb7185',
          rx: '2',
          class: 'chart-bar-rect'
        });
        const rectRem = svgEl('rect', {
          x: padLeft,
          y: rowTop + 17 + barH + 2,
          width: Math.max(2, removedW),
          height: barH,
          fill: '#34d399',
          rx: '2',
          class: 'chart-bar-rect'
        });

        const onClick = () => {
          const opts = { subview: 'commits' };
          opts[filterKey] = filterValue;
          jumpToDataTab(opts);
        };
        rectAdd.addEventListener('click', onClick);
        rectRem.addEventListener('click', onClick);

        svg.appendChild(rectAdd);
        svg.appendChild(rectRem);
      });
      return;
    }

    const height = 325;
    const padLeft = 310;
    const padRight = 105;
    const padTop = 14;
    const padBottom = 20;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.style.height = '';

    const rowH = plotH / Math.max(1, filtered.length);

    filtered.forEach((it, idx) => {
      const displayLabel = it.label || it.feature_area;
      const filterValue = it.id || it.feature_area;
      const commitsCnt = it.commit_count || 0;
      const rawAdded =
        !it.id && it.feature_area === 'SPI Tooling & Allowlist Baseline'
          ? Math.max(0, (it.added_spis || 0) - 2021)
          : it.added_spis || 0;
      const rawRemoved = it.removed_spis || 0;

      const yCenter = padTop + idx * rowH + rowH / 2;

      const label = svgEl('text', {
        x: padLeft - 10,
        y: yCenter + 4,
        'text-anchor': 'end',
        fill: '#e2e8f0',
        'font-size': '11.5',
        'font-weight': '600'
      });
      label.textContent = displayLabel + ' (' + commitsCnt + 'c)';
      svg.appendChild(label);

      const addedW = (rawAdded / maxVal) * plotW;
      const removedW = (rawRemoved / maxVal) * plotW;
      const barH = Math.min(9, rowH * 0.36);

      const rectAdd = svgEl('rect', {
        x: padLeft,
        y: yCenter - barH - 1,
        width: Math.max(2, addedW),
        height: barH,
        fill: '#fb7185',
        rx: '2',
        class: 'chart-bar-rect'
      });
      const rectRem = svgEl('rect', {
        x: padLeft,
        y: yCenter + 1,
        width: Math.max(2, removedW),
        height: barH,
        fill: '#34d399',
        rx: '2',
        class: 'chart-bar-rect'
      });

      const statsTxt = svgEl('text', {
        x: padLeft + Math.max(addedW, removedW) + 8,
        y: yCenter + 4,
        fill: '#94a3b8',
        'font-family': 'JetBrains Mono, monospace',
        'font-size': '10.5'
      });
      statsTxt.textContent = '+' + fmtNum(rawAdded) + ' / -' + fmtNum(rawRemoved);

      const onClick = () => {
        const opts = { subview: 'commits' };
        opts[filterKey] = filterValue;
        jumpToDataTab(opts);
      };
      rectAdd.addEventListener('click', onClick);
      rectRem.addEventListener('click', onClick);

      svg.appendChild(rectAdd);
      svg.appendChild(rectRem);
      svg.appendChild(statsTxt);
    });
  }

  function renderHistoryMilestones() {
    const grid = document.getElementById('historyMilestonesGrid');
    if (!grid) return;
    grid.replaceChildren();

    const milestones = [
      {
        label: '1. Initial Allowlist Baseline',
        date: '2025-07-09',
        hash: 'cbb5741c87c7827a9e28fc74a30327ded0334b88',
        shortHash: 'cbb5741c87c7',
        stats: '1,949 SPIs (1,956 Legacy / 65 Reviewed)',
        desc: 'Creates initial AllowedSPI.toml and AllowedSPI-legacy.toml across JSC, WebCore, WebGPU, WebKit & WebKitLegacy.',
        highlightRose: false
      },
      {
        label: '2. Selector Class Disambiguation',
        date: '2025-08-12',
        hash: 'b9fa7bcf117064356a95aae272fe426d65f30610',
        shortHash: 'b9fa7bcf1170',
        stats: '+90 Legacy Selectors / -94 Legacy',
        desc: 'Adds receiver class disambiguation to audit-spi, uncovering 90 private selectors previously masked by public selector name collisions.',
        highlightRose: true
      },
      {
        label: '3. Promotion & Adoption Bugs',
        date: '2025-08-18',
        hash: '90cf6b9aa51e43760a8037f4610bc3196e716d79',
        shortHash: '90cf6b9aa51e',
        stats: '+37 Reviewed / +6 Legacy / -14',
        desc: 'Updates SPI allowlists with structured request/cleanup radar URLs and conditional SDK guards ahead of iOS enforcement.',
        highlightRose: true
      },
      {
        label: '4. 3D <model> / RealityKit Move',
        date: '2026-02-09',
        hash: 'ade74161104431cfdfba9c853349f4739a0746c2',
        shortHash: 'ade741611044',
        stats: '+309 Reviewed SPIs (2,299 Total)',
        desc: 'Moves WebModelPlayer and 309 RealityKit/CoreRE SPIs into WebKit.framework, driving the allowlist toward its 2,332-SPI peak.',
        highlightRose: false
      },
      {
        label: '5. Peak Allowlist Size (2,332)',
        date: '2026-02-23',
        hash: '4cd4b07456f49e83440d4e5cdbf1742ef33f9ec2',
        shortHash: '4cd4b07456f4',
        stats: '2,332 Unique SPIs (1,911 Legacy / 496 Reviewed)',
        desc: 'All-time peak unique SPI count before internal SDKDB baseline updates promoted hundreds of staged symbols.',
        highlightRose: false
      },
      {
        label: '6. Internal SDKDB Baseline Update',
        date: '2026-02-26',
        hash: '3b57457b56b5e36bd26291a39f1e2e10a78bd660',
        shortHash: '3b57457b56b5',
        stats: '-341 Reviewed / +30 Legacy',
        desc: 'Removes 341 newly-promoted RealityKit/visionOS SPIs from AllowedSPI.toml while backfilling 30 conditional entries into Legacy.',
        highlightRose: true
      },
      {
        label: '7. Swift Decls Schema Migration',
        date: '2026-04-08',
        hash: '8a4f2c1e1043528019419378a7f563307c378742',
        shortHash: '8a4f2c1e1043',
        stats: '+42 Legacy swift-decls / -65 Mangled',
        desc: 'Replaces brittle mangled Swift symbol names with 42 demangled swift-decls entries in WebKit/AllowedSPI-legacy.toml.',
        highlightRose: true
      },
      {
        label: '8. HEAD Snapshot (Sep 30, 2026)',
        date: '2026-09-30',
        hash: 'a216b77387a6884797d2ecfd172ef6fa2983952d',
        shortHash: 'a216b77387a6',
        stats: '2,014 Unique SPIs (1,889 Legacy / 197 Reviewed)',
        desc: 'Net +65 unique SPIs since initial allowlist; 133 net-new post-baseline entries (+18 re-added) remain in AllowedSPI-legacy.toml.',
        highlightRose: false
      }
    ];

    for (const m of milestones) {
      const card = el('div', 'milestone-card' + (m.highlightRose ? ' highlight-rose' : ''));

      const top = el('div', 'milestone-top');
      top.appendChild(el('span', 'milestone-label', m.label));
      top.appendChild(el('span', 'milestone-date', m.date));
      card.appendChild(top);

      const stats = el('div', 'milestone-stats', m.stats);
      if (m.highlightRose) stats.style.color = 'var(--tone-rose)';
      card.appendChild(stats);

      card.appendChild(el('div', 'milestone-desc', m.desc));

      const footer = el('div', '');
      footer.style.display = 'flex';
      footer.style.alignItems = 'center';
      footer.style.justifyContent = 'space-between';
      footer.style.gap = '6px';
      footer.style.marginTop = '4px';

      footer.appendChild(
        createExternalLink(
          WEBKIT_GH_COMMIT_BASE + m.hash,
          'GitHub: ' + m.shortHash,
          'github-commit-link',
          'View commit diff on github.com/WebKit/WebKit'
        )
      );

      const inspectBtn = el(
        'button',
        'insight-data-link' + (m.highlightRose ? ' tone-rose' : ''),
        'Inspect Commit \u2192'
      );
      inspectBtn.type = 'button';
      inspectBtn.addEventListener('click', () => {
        jumpToDataTab({
          subview: 'commits',
          commitSearch: m.shortHash,
          expandCommitHash: m.hash
        });
      });
      footer.appendChild(inspectBtn);

      card.appendChild(footer);
      grid.appendChild(card);
    }
  }

  // =========================================================================
  // SECTION 5: Legacy Allowlist Policy Spotlight ("Only Shrink" vs. Reality)
  // =========================================================================

  function renderLegacySpotlightSection() {
    const lpa = state.history.legacy_policy_analysis;
    if (!lpa) return;

    const wfContainer = document.getElementById('legacyWaterfallList');
    wfContainer.replaceChildren();

    const waterfallSteps = [
      {
        label: '1. Initial Legacy Allowlist Baseline (Jul 9, 2025 \u2014 commit cbb5741c87c7)',
        val: '1,956 file entries (1,886 unique SPIs)',
        cls: '',
        jumpOpts: { subview: 'commits', commitSearch: 'cbb5741c87c7', expandCommitHash: 'cbb5741c87c7827a9e28fc74a30327ded0334b88' }
      },
      {
        label: '2. Initial Baseline Entries Removed by HEAD (Cleanups, SDK promotions & ARKit preview removal)',
        val: '-200 entries removed (-10.2%)',
        cls: 'highlight-removal',
        jumpOpts: { subview: 'commits', commitCategory: 'cleanup-remove-spi' }
      },
      {
        label: '3. Initial Baseline Entries Retained at HEAD (1,738 untouched + 18 removed & re-added)',
        val: '1,756 entries (89.8% retained)',
        cls: '',
        jumpOpts: { subview: 'spi', legacyStatus: 'legacy_file' }
      },
      {
        label: '4. Gross Post-Baseline Additions to AllowedSPI-legacy.toml Across 24 Commits',
        val: '+215 gross added (191 net-new + 24 re-added)',
        cls: 'highlight-addition',
        jumpOpts: { subview: 'commits', legacyOnly: true }
      },
      {
        label: '5. Post-Baseline Legacy Additions Still Present at HEAD',
        val: '+133 net-new (+18 re-added = 151 / 8.0% of HEAD)',
        cls: 'highlight-addition',
        jumpOpts: { subview: 'spi', legacyStatus: 'added_after_baseline' }
      },
      {
        label: '6. Final HEAD AllowedSPI-legacy.toml Count (Sep 30, 2026 \u2014 commit a216b77387a6)',
        val: '1,889 file entries (1,899 raw, -3.4% net)',
        cls: '',
        jumpOpts: { subview: 'spi', legacyStatus: 'legacy_file' }
      }
    ];

    for (const step of waterfallSteps) {
      const row = el('div', 'waterfall-row ' + step.cls);
      row.style.cursor = 'pointer';
      row.title = 'Click to inspect in Raw Data tab';
      row.appendChild(el('span', '', step.label));
      row.appendChild(el('span', 'waterfall-val', step.val));
      row.addEventListener('click', () => jumpToDataTab(step.jumpOpts));
      wfContainer.appendChild(row);
    }

    // Per-Module Legacy Comparison Table
    const modTbody = document.getElementById('legacyModuleTableBody');
    modTbody.replaceChildren();

    for (const m of lpa.by_module || []) {
      const tr = el('tr');
      tr.style.cursor = 'pointer';
      tr.title = 'Click to filter Raw Data to ' + m.module + ' legacy SPIs';

      const pctChange = m.initial_entries > 0 ? ((m.net_change / m.initial_entries) * 100).toFixed(1) : '0.0';
      const netStr =
        (m.net_change > 0 ? '+' : '') +
        m.net_change +
        ' (' +
        (m.net_change > 0 ? '+' : '') +
        pctChange +
        '%)';

      tr.appendChild(el('td', '', m.module));
      tr.appendChild(el('td', '', fmtNum(m.initial_entries)));
      tr.appendChild(
        el(
          'td',
          m.removed_from_initial > 0 ? 'delta-neg-emerald' : 'delta-neutral',
          m.removed_from_initial > 0 ? '-' + m.removed_from_initial : '0'
        )
      );
      tr.appendChild(
        el(
          'td',
          m.re_added_from_initial_at_head > 0 ? 'delta-pos-rose' : 'delta-neutral',
          m.re_added_from_initial_at_head > 0 ? '+' + m.re_added_from_initial_at_head : '0'
        )
      );
      tr.appendChild(
        el(
          'td',
          m.added_after_initial_at_head > 0 ? 'delta-pos-rose' : 'delta-neutral',
          '+' + m.added_after_initial_at_head
        )
      );
      tr.appendChild(el('td', '', fmtNum(m.head_entries)));
      tr.appendChild(
        el(
          'td',
          m.net_change > 0 ? 'delta-pos-rose' : m.net_change < 0 ? 'delta-neg-emerald' : 'delta-neutral',
          netStr
        )
      );

      tr.addEventListener('click', () => {
        jumpToDataTab({ subview: 'spi', module: m.module, legacyStatus: 'legacy_file' });
      });
      modTbody.appendChild(tr);
    }

    // 5 Root-Cause Categories for Legacy Additions
    const catGrid = document.getElementById('legacyCategoriesGrid');
    catGrid.replaceChildren();

    for (const c of lpa.by_addition_category || []) {
      const card = el('div', 'legacy-cat-card');
      card.appendChild(el('h4', '', c.label));
      card.appendChild(
        el(
          'div',
          'legacy-cat-metrics',
          '+' + c.gross_legacy_added + ' gross (' + c.surviving_at_head_count + ' at HEAD) \u2022 ' + c.commit_count + ' commits'
        )
      );
      card.appendChild(el('div', 'legacy-cat-desc', c.description || ''));

      const btn = el('button', 'insight-data-link tone-rose', 'Filter ' + c.commit_count + ' Commits \u2192');
      btn.type = 'button';
      btn.addEventListener('click', () => {
        jumpToDataTab({ subview: 'commits', legacyAddCat: c.id });
      });
      card.appendChild(btn);
      catGrid.appendChild(card);
    }

    // Compact Table of All 24 Commits Adding to AllowedSPI-legacy.toml
    const spotTbody = document.getElementById('legacySpotCommitsBody');
    spotTbody.replaceChildren();

    for (const c of lpa.commits_adding_to_legacy || []) {
      const tr = el('tr', 'item-row');
      tr.appendChild(el('td', '', fmtDateShort(c.date)));

      const tdGh = el('td');
      const ghLink = createExternalLink(
        WEBKIT_GH_COMMIT_BASE + c.hash,
        c.short_hash,
        'github-commit-link',
        'View commit diff on GitHub'
      );
      ghLink.addEventListener('click', (ev) => ev.stopPropagation());
      tdGh.appendChild(ghLink);
      tr.appendChild(tdGh);

      tr.appendChild(el('td', 'delta-pos-rose', '+' + c.legacy_added_count));
      tr.appendChild(
        el(
          'td',
          c.legacy_removed_count > 0 ? 'delta-neg-emerald' : 'delta-neutral',
          c.legacy_removed_count > 0 ? '-' + c.legacy_removed_count : '0'
        )
      );
      tr.appendChild(
        el(
          'td',
          c.still_in_legacy_at_head_count > 0 ? 'delta-pos-rose' : 'delta-neutral',
          fmtNum(c.still_in_legacy_at_head_count) + ' at HEAD'
        )
      );

      const tdCat = el('td');
      const catLabel = state.legacyCatLabelsById.get(c.legacy_addition_category) || c.legacy_addition_category;
      tdCat.appendChild(el('span', 'badge-pill badge-amber', catLabel));
      tr.appendChild(tdCat);

      const tdSubj = el('td');
      const subjTitle = el('div', '', c.subject);
      subjTitle.style.fontWeight = '600';
      subjTitle.style.color = '#f8fafc';
      const whySub = el('div', 'spi-sub-meta', c.legacy_addition_reason || '');
      tdSubj.appendChild(subjTitle);
      tdSubj.appendChild(whySub);
      tr.appendChild(tdSubj);

      const tdAction = el('td');
      const inspectBtn = el('button', 'insight-data-link tone-rose', 'Inspect in Data Tab \u2192');
      inspectBtn.type = 'button';
      inspectBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        jumpToDataTab({
          subview: 'commits',
          commitSearch: c.short_hash,
          expandCommitHash: c.hash
        });
      });
      tdAction.appendChild(inspectBtn);
      tr.appendChild(tdAction);

      tr.addEventListener('click', () => {
        jumpToDataTab({
          subview: 'commits',
          commitSearch: c.short_hash,
          expandCommitHash: c.hash
        });
      });

      spotTbody.appendChild(tr);
    }
  }

  // =========================================================================
  // SECTION 6: Architectural Insights & 8 Predicted 3P BrowserEngineKit Problems
  // =========================================================================

  function renderInsightsAndPredictions() {
    const archGrid = document.getElementById('archInsightsGrid');
    const predGrid = document.getElementById('predictionsGrid');
    archGrid.replaceChildren();
    predGrid.replaceChildren();

    const archInsights = [
      {
        title: '1. Multi-Process Distribution: 2,933 Process Configurations Across 10 Execution Contexts',
        badge: '2,933 Process Configs',
        badgeClass: 'badge-cyan',
        paragraphs: [
          'Expanding WebKit’s 2,014 unique SPIs across the specific process types where they are enabled yields 2,933 distinct process/module configurations (with 628 SPIs active across multiple process types or modules).',
          'WebCore (shared by WebContent and GPU processes for rendering, layout, CoreText, and media) accounts for 870 SPIs, while UIProcess (728 SPIs) and WebKit-Shared (726 SPIs) coordinate system UI, gestures, and XPC. Specialized auxiliary processes—Networking (236), WebContent (158), WebKitLegacy (114), webpushd (104), GPU (36), JavaScriptCore (23), and ModelProcess (15)—each rely on dedicated OS hooks.'
        ],
        links: [
          { label: 'View 870 WebCore (WebContent/GPU) Configs \u2192', tone: '', opts: { subview: 'spi', granularity: 'config', process: 'WebCore (WebContent/GPU)' } },
          { label: 'View 728 UIProcess Configs \u2192', tone: '', opts: { subview: 'spi', granularity: 'config', process: 'UIProcess' } },
          { label: 'View 628 Multi-Config SPIs \u2192', tone: 'tone-amber', opts: { subview: 'spi', granularity: 'config', legacyStatus: 'multi_config' } }
        ]
      },
      {
        title: '2. The 5-Tier Availability Divide: 635 Strictly Apple-Only SPIs vs. 501 Undocumented In-Process Symbols',
        badge: '56.4% Non-Public OS Surface',
        badgeClass: 'badge-rose',
        paragraphs: [
          'While 847 SPIs (42.1%) have functional capabilities bridged via BrowserEngineKit or system WKWebView and 31 (1.5%) are conditionally promoted to newer public SDKs, the remaining 1,136 SPIs (56.4%) represent non-public iOS operating system surface.',
          'Specifically, 375 SPIs (18.6%) are gated at runtime by restricted com.apple.private.* entitlements or privileged Mach services inaccessible to 3P engines; 260 SPIs (12.9%) require USE_APPLE_INTERNAL_SDK or private frameworks; and 501 SPIs (24.9%) are unentitled in-process private symbols prohibited by App Store review.'
        ],
        links: [
          { label: 'Filter 375 Entitlement-Blocked SPIs \u2192', tone: 'tone-rose', opts: { subview: 'spi', availability: 'apple-only-entitlement-or-daemon' } },
          { label: 'Filter 260 Internal-SDK SPIs \u2192', tone: 'tone-amber', opts: { subview: 'spi', availability: 'apple-only-internal-sdk' } },
          { label: 'Filter 501 In-Process Private Symbols \u2192', tone: '', opts: { subview: 'spi', availability: '3p-inprocess-private-symbol-unentitled' } }
        ]
      },
      {
        title: '3. Dynamic Soft-Linking (__TEXT,__dlsym_cstr) & Selector Class Disambiguation',
        badge: '977 Selectors + 809 Symbols',
        badgeClass: 'badge-amber',
        paragraphs: [
          'WebKit’s SOFT_LINK* macros (Source/WTF/wtf/cocoa/SoftLinking.h) dynamically load frameworks and resolve private symbols via dlsym and objc_getClass at runtime, embedding strings into custom Mach-O sections (__TEXT,__dlsym_cstr and __TEXT,__getClass_cstr) so audit-spi can audit them.',
          'When WebKit upgraded audit-spi in August 2025 (commit b9fa7bcf1170) to disambiguate Objective-C selector receiver classes, it immediately uncovered 90 additional private selectors that had been masked by name collisions with unrelated public selectors.'
        ],
        links: [
          { label: 'View 977 Objective-C Selectors \u2192', tone: '', opts: { subview: 'spi', kind: 'selectors' } },
          { label: 'View 809 C/C++ Symbols \u2192', tone: '', opts: { subview: 'spi', kind: 'symbols' } },
          { label: 'View 48 Swift Declarations \u2192', tone: 'tone-emerald', opts: { subview: 'spi', kind: 'swift-decls' } }
        ]
      },
      {
        title: '4. Unreviewed Technical Debt: 90.6% of Raw Entries Remain in AllowedSPI-legacy.toml',
        badge: '1,899 Legacy vs. 198 Reviewed',
        badgeClass: 'badge-orange',
        paragraphs: [
          'Across all 2,097 raw TOML block entries at HEAD, 1,899 (90.6%) reside in AllowedSPI-legacy.toml without request or cleanup radar links, while only 198 entries (9.4%) reside in the reviewed AllowedSPI.toml files.',
          'Even when developers add new features (such as Siri UIIntelligenceSupport context or Site Isolation fraud checks), 9 commits bypassed AllowedSPI.toml and placed new SPIs directly into AllowedSPI-legacy.toml.'
        ],
        links: [
          { label: 'View 1,899 Legacy Allowlist Entries \u2192', tone: 'tone-rose', opts: { subview: 'spi', granularity: 'toml', legacyStatus: 'legacy_file' } },
          { label: 'View 198 Reviewed Allowlist Entries \u2192', tone: 'tone-emerald', opts: { subview: 'spi', granularity: 'toml', legacyStatus: 'reviewed_file' } },
          { label: 'View 9 Bypass Commits \u2192', tone: 'tone-amber', opts: { subview: 'commits', legacyAddCat: 'new-feature-or-bugfix-bypassing-reviewed-allowlist' } }
        ]
      }
    ];

    for (const item of archInsights) {
      archGrid.appendChild(buildInsightCardNode(item));
    }

    const predictions = [
      {
        title: 'Problem 1: UIKit Views, Scrolling Physics, Gestures & Text Input Parity',
        badge: 'UIKit Views & Text Input (282 SPIs)',
        badgeClass: 'badge-rose',
        paragraphs: [
          'UIKit Views, Scrolling, Gestures & Text Input is WebKit’s largest SPI category (282 unique SPIs / 14.0%). Even with BrowserEngineKit’s BETextInteraction and BEScrollView, WebKit directly invokes hundreds of private UIScrollView, UIKeyboardImpl, _UIEditMenuInteraction, and gesture recognizer selectors.',
          'Notably, when WebKit attempted to remove private scrolling selectors (_setAvoidsJumpOnInterruptedBounce: and setTracksImmediatelyWhileDecelerating:), runtime scrolling regressions forced commits 2a02830783a0 and 906c6983e08c to restore them to AllowedSPI-legacy.toml.'
        ],
        riskText: 'Predicted 3P Engine Impact: Jitter or jump regressions during interrupted scroll bounces, differences in CJK IME composition and edit-menu callouts, and lag in adopting new iOS visual treatments (such as scroll pocket backdrop effects).',
        links: [
          { label: 'View 282 UIKit Views & Input SPIs \u2192', tone: 'tone-rose', opts: { subview: 'spi', feature: 'UIKit Views, Scrolling, Gestures & Text Input' } },
          { label: 'Inspect Scroll Regression Restorations \u2192', tone: 'tone-amber', opts: { subview: 'commits', legacyAddCat: 'revert-or-regression-restoration' } }
        ]
      },
      {
        title: 'Problem 2: Networking, HTTP/3, WebTransport, Proxies & Cookie Partitioning',
        badge: 'Networking & CFNetwork (239 SPIs)',
        badgeClass: 'badge-rose',
        paragraphs: [
          'WebKit’s Networking process relies on 239 private SPIs (11.9%) across CFNetwork and Network.framework—including nw_settings_get_unified_http_enabled_webkit, _CFNetworkHTTPConnectionCacheSetLimit, private CFHTTPCookieStorage partitioning hooks, and ne_filter_crypto_* content filter evaluators.',
          'While BrowserEngineKit provides BENetworkingProcess, low-level CFNetwork session tuning and system cookie/credential sharing hooks remain private.'
        ],
        riskText: 'Predicted 3P Engine Impact: Obstacles matching Safari’s HTTP/3 connection coalescing, system VPN/Enterprise proxy authentication handoffs, and parental/enterprise content-filter integration.',
        links: [
          { label: 'View 239 Networking & HTTP/3 SPIs \u2192', tone: 'tone-rose', opts: { subview: 'spi', feature: 'Networking, HTTP/3, WebTransport & Cookies' } },
          { label: 'View 236 Networking Process Configs \u2192', tone: '', opts: { subview: 'spi', granularity: 'config', process: 'Networking' } }
        ]
      },
      {
        title: 'Problem 3: Zero-Copy Cross-Process Compositing, Wide-Gamut HDR & IOSurface',
        badge: 'Graphics, HDR & IOSurface (205 SPIs)',
        badgeClass: 'badge-amber',
        paragraphs: [
          'WebKit’s rendering pipeline uses 205 private SPIs (10.2%) across QuartzCore/CoreAnimation, CoreGraphics, and IOSurface—including CAContext, CALayerHost, CGIOSurfaceContextGetBitmapInfo, CGShadingCreateConic, and HDR display headroom SPIs (HAVE_SUPPORT_HDR_DISPLAY_APIS).',
          'When WebKit tried removing CGIOSurfaceContextGetBitmapInfo, rendering regressions forced commit 8ad60ae162b2 to restore it.'
        ],
        riskText: 'Predicted 3P Engine Impact: Extra texture copies or higher GPU memory usage when compositing out-of-process frames via BELayerHierarchy, and difficulty matching EDR/HDR canvas and video tone-mapping.',
        links: [
          { label: 'View 205 Graphics, HDR & IOSurface SPIs \u2192', tone: 'tone-amber', opts: { subview: 'spi', feature: 'Graphics, CoreAnimation, Color, HDR & IOSurface' } },
          { label: 'Search IOSurface SPIs \u2192', tone: '', opts: { subview: 'spi', search: 'IOSurface' } }
        ]
      },
      {
        title: 'Problem 4: Protected Media Playback, AirPlay, Spatial Audio & AVKit Fullscreen',
        badge: 'Media, AirPlay & Codecs (180 SPIs)',
        badgeClass: 'badge-amber',
        paragraphs: [
          'WebKit invokes 180 private media SPIs (8.9%) across AVFoundation, MediaToolbox, CoreMedia, AudioToolbox, MediaRemote, and AVKit—such as FigVideoTarget, AVOutputContext, WebAVPlayerLayerView.webPlayerLayer, and private Picture-in-Picture/fullscreen controllers.',
          'Many media routing and remote-control hooks require com.apple.mediaremote.* or audio session privileges unavailable to third-party processes.'
        ],
        riskText: 'Predicted 3P Engine Impact: Limitations in custom AirPlay route selection, Spatial Audio head-tracking metadata, FairPlay DRM power efficiency, and seamless fullscreen video transitions.',
        links: [
          { label: 'View 180 Media, AirPlay & Codec SPIs \u2192', tone: 'tone-amber', opts: { subview: 'spi', feature: 'Media Playback, AirPlay, AVFoundation & Codecs' } },
          { label: 'Filter AVFoundation Framework \u2192', tone: '', opts: { subview: 'spi', framework: 'AVFoundation' } }
        ]
      },
      {
        title: 'Problem 5: Passkeys, Enterprise SSO, Apple Pay & Wallet Installments',
        badge: 'Auth/Passkeys (152) + Apple Pay (61)',
        badgeClass: 'badge-rose',
        paragraphs: [
          'Combined, Authentication/Passkeys/SSO (152 SPIs) and Apple Pay/PassKit (61 SPIs) account for 213 private APIs (10.6%). These include AuthenticationServicesCore, AuthKit (AKAuthorizationController), ExtensibleSSO, and PKPaymentAuthorizationController private delegates gated by com.apple.payment.all-access.',
          'Because third-party apps cannot obtain com.apple.payment.all-access or link against AuthenticationServicesCore, they cannot invoke these underlying hooks directly.'
        ],
        riskText: 'Predicted 3P Engine Impact: Inability to offer full parity with Safari’s native Apple Pay / Wallet installment sheets, enterprise Single Sign-On (SSO) extensions, and autofill passkey conditional mediation.',
        links: [
          { label: 'View 152 Auth, Passkeys & SSO SPIs \u2192', tone: 'tone-rose', opts: { subview: 'spi', feature: 'Authentication, Passkeys, Enterprise SSO & Security' } },
          { label: 'View 61 Apple Pay & PassKit SPIs \u2192', tone: 'tone-rose', opts: { subview: 'spi', feature: 'Apple Pay, PassKit & Wallet Installments' } }
        ]
      },
      {
        title: 'Problem 6: RunningBoard Process Assertions, Jetsam Limits & XPC Lifecycle',
        badge: 'Process, RunningBoard & XPC (102 SPIs)',
        badgeClass: 'badge-cyan',
        paragraphs: [
          'WebKit manages its multi-process hierarchy using 102 private SPIs (5.1%) gated by entitlements like com.apple.runningboard.assertions.webkit and Darwin kernel memorystatus/Jetsam hooks.',
          '3P browser engines must rely exclusively on BrowserEngineKit’s public process grant objects (BEProcessCapability) without direct visibility into RunningBoard priority bands or Jetsam watermark thresholds.'
        ],
        riskText: 'Predicted 3P Engine Impact: Higher risk of background tab eviction or GPU/WebContent process termination under memory pressure when switching between apps or running heavy WebAssembly/WebGPU workloads.',
        links: [
          { label: 'View 102 Process, RunningBoard & XPC SPIs \u2192', tone: '', opts: { subview: 'spi', feature: 'Process Management, RunningBoard, XPC & System Lifecycle' } },
          { label: 'Filter Entitlement-Gated SPIs \u2192', tone: 'tone-rose', opts: { subview: 'spi', legacyStatus: 'has_entitlement' } }
        ]
      },
      {
        title: 'Problem 7: Live Text (VisionKit), Writing Tools, Siri Intelligence & Translation',
        badge: 'Visual Intelligence (103) + Translation (79)',
        badgeClass: 'badge-teal',
        paragraphs: [
          'WebKit integrates deeply with iOS system intelligence via 103 Visual Intelligence / Live Text / Writing Tools SPIs and 79 Data Detectors / Look Up / Translation SPIs—including VKImageAnalyzer, UIIntelligenceSupport Swift declarations (added in 1b83ed066bae), and _LTTranslator.',
          'Most of these integrations rely on private UIKit/VisionKit/TranslationSPI headers or internal SDK frameworks.'
        ],
        riskText: 'Predicted 3P Engine Impact: Missing or degraded inline image Live Text selection/QR detection, native page translation bars, and Siri AI / Writing Tools context menu integration on web content.',
        links: [
          { label: 'View 103 Visual Intelligence & Writing Tools SPIs \u2192', tone: '', opts: { subview: 'spi', feature: 'Visual Intelligence, Live Text (VisionKit) & Writing Tools' } },
          { label: 'View 79 Data Detectors & Translation SPIs \u2192', tone: '', opts: { subview: 'spi', feature: 'Data Detectors, Look Up, Translation & Link Preview' } }
        ]
      },
      {
        title: 'Problem 8: Web Push (webpushd), Safe Browsing, Content Filtering & Typography',
        badge: 'Typography (127) + Privacy (112) + Push (50)',
        badgeClass: 'badge-amber',
        paragraphs: [
          'WebKit uses 127 Typography/CoreText SPIs (for system-ui font descriptors and math/emoji shaping), 112 Privacy/Content-Filtering SPIs (WebPrivacy, SafariSafeBrowsing, ScreenTime), and 50 Web Push / Home Screen WebClip SPIs in webpushd.',
          'For the 501 unentitled in-process private symbols (such as CoreText and CoreGraphics internals), 3P engines face a strict Catch-22: avoiding them sacrifices rendering/font fidelity, while calling them via dlsym risks App Store rejection or silent OS breakage.'
        ],
        riskText: 'Predicted 3P Engine Impact: Typography metric discrepancies on system fonts, lack of system-level WebClip/PWA push parity, and fragility if attempting to use undocumented in-process symbols.',
        links: [
          { label: 'View 127 Typography & CoreText SPIs \u2192', tone: '', opts: { subview: 'spi', feature: 'Typography, Fonts, Emoji & Rich Text' } },
          { label: 'View 112 Privacy & Content Filtering SPIs \u2192', tone: '', opts: { subview: 'spi', feature: 'Privacy, Tracking Prevention, Content Filtering & Safe Browsing' } },
          { label: 'View 50 Web Push (webpushd) SPIs \u2192', tone: 'tone-amber', opts: { subview: 'spi', feature: 'Web Push Notifications & Home Screen WebClips (webpushd)' } }
        ]
      }
    ];

    for (const item of predictions) {
      predGrid.appendChild(buildInsightCardNode(item));
    }
  }

  function buildInsightCardNode(item) {
    const card = el('div', 'insight-card');

    const topWrap = el('div');
    const header = el('div', 'insight-card-header');
    header.appendChild(el('h4', 'insight-card-title', item.title));
    header.appendChild(el('span', 'badge-pill ' + (item.badgeClass || 'badge-cyan'), item.badge));
    topWrap.appendChild(header);

    const body = el('div', 'insight-card-body');
    body.style.marginTop = '10px';
    for (const pText of item.paragraphs || []) {
      body.appendChild(el('p', '', pText));
    }
    if (item.riskText) {
      const riskBox = el('div', 'risk-prediction-banner');
      riskBox.textContent = item.riskText;
      body.appendChild(riskBox);
    }
    topWrap.appendChild(body);
    card.appendChild(topWrap);

    const footer = el('div', 'insight-card-footer');
    const linksWrap = el('div');
    linksWrap.style.display = 'flex';
    linksWrap.style.gap = '8px';
    linksWrap.style.flexWrap = 'wrap';

    for (const lnk of item.links || []) {
      const btn = el('button', 'insight-data-link ' + (lnk.tone || ''), lnk.label);
      btn.type = 'button';
      btn.addEventListener('click', () => jumpToDataTab(lnk.opts));
      linksWrap.appendChild(btn);
    }

    footer.appendChild(linksWrap);
    card.appendChild(footer);
    return card;
  }

  // =========================================================================
  // TAB 2, SUB-VIEW 1: Raw SPI Configuration Inventory Table
  // =========================================================================

  function populateFilterDropdowns() {
    const meta = state.inventory.metadata;

    const procCounts = new Map();
    for (const row of state.configRows) {
      procCounts.set(row.processType, (procCounts.get(row.processType) || 0) + 1);
    }
    const procSelect = document.getElementById('spiProcessFilter');
    Array.from(procCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([proc, cnt]) => {
        const opt = el('option', '', proc + ' (' + fmtNum(cnt) + ' configs)');
        opt.value = proc;
        procSelect.appendChild(opt);
      });

    const featSelect = document.getElementById('spiFeatureFilter');
    for (const f of meta.by_feature_category || []) {
      const opt = el('option', '', f.feature_category + ' (' + fmtNum(f.count) + ' SPIs)');
      opt.value = f.feature_category;
      featSelect.appendChild(opt);
    }

    const fwSelect = document.getElementById('spiFrameworkFilter');
    for (const fw of meta.by_framework || []) {
      const opt = el('option', '', fw.framework + ' (' + fmtNum(fw.count) + ')');
      opt.value = fw.framework;
      fwSelect.appendChild(opt);
    }

    const commitCatSelect = document.getElementById('commitCategoryFilter');
    for (const c of state.history.metadata.by_category || []) {
      const opt = el('option', '', c.label + ' (' + c.commit_count + ' commits)');
      opt.value = c.id;
      commitCatSelect.appendChild(opt);
    }

    const commitAreaSelect = document.getElementById('commitFeatureAreaFilter');
    for (const a of state.history.metadata.by_feature_area || []) {
      const opt = el('option', '', a.feature_area + ' (' + a.commit_count + ' commits)');
      opt.value = a.feature_area;
      commitAreaSelect.appendChild(opt);
    }

    const legAddCatSelect = document.getElementById('commitLegacyAddCatFilter');
    const lpa = state.history.legacy_policy_analysis;
    if (lpa && Array.isArray(lpa.by_addition_category)) {
      for (const c of lpa.by_addition_category) {
        const opt = el(
          'option',
          '',
          c.label + ' (' + c.commit_count + ' commits, +' + c.gross_legacy_added + ')'
        );
        opt.value = c.id;
        legAddCatSelect.appendChild(opt);
      }
    }
  }

  function syncGranularityButtons() {
    document.querySelectorAll('#spiGranularityControl [data-granularity]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-granularity') === state.spiGranularity);
    });
  }

  function getActiveGranularitySourceRows() {
    if (state.spiGranularity === 'toml') return state.tomlRows;
    if (state.spiGranularity === 'unique') return state.uniqueSpiRows;
    return state.configRows;
  }

  function applySpiFiltersAndRender(opts) {
    const sourceRows = getActiveGranularitySourceRows();
    const f = state.spiFilters;
    const q = f.search.trim().toLowerCase();

    const filtered = sourceRows.filter((row) => {
      const spi = row.spi;
      const occ = row.occ || {};

      if (f.process !== 'all') {
        if (state.spiGranularity === 'config') {
          if (row.processType !== f.process) return false;
        } else if (!row.processesList.includes(f.process)) {
          return false;
        }
      }

      if (f.feature !== 'all' && row.featureCategory !== f.feature) return false;

      if (f.availability !== 'all') {
        if (f.availability === 'apple-only-all') {
          if (!row.isAppleOnly) return false;
        } else if (row.availability3p !== f.availability) {
          return false;
        }
      }

      if (f.framework !== 'all' && row.framework !== f.framework) return false;

      if (f.module !== 'all') {
        if (state.spiGranularity === 'unique') {
          if (!row.modulesList.includes(f.module)) return false;
        } else if (row.module !== f.module) {
          return false;
        }
      }

      if (f.kind !== 'all' && row.kind !== f.kind) return false;

      if (f.legacyStatus !== 'all') {
        if (f.legacyStatus === 'legacy_file' && !row.hasLegacyFile) return false;
        if (f.legacyStatus === 'reviewed_file' && !row.hasReviewedFile) return false;
        if (f.legacyStatus === 'added_after_baseline' && !row.addedAfterBaseline) return false;
        if (f.legacyStatus === 're_added_after_baseline' && !row.reAddedAfterBaseline) return false;
        if (f.legacyStatus === 'multi_config' && row.totalConfigsForSpi <= 1) return false;
        if (
          f.legacyStatus === 'has_entitlement' &&
          (!spi.blocking_entitlements || spi.blocking_entitlements.length === 0) &&
          (!spi.sandbox_mach_services || spi.sandbox_mach_services.length === 0)
        ) {
          return false;
        }
      }

      if (q) {
        const hayParts = [
          row.name,
          row.kind,
          row.processType,
          row.module,
          row.file,
          row.framework,
          row.featureCategory,
          spi.functionality || '',
          occ.reason || '',
          occ.introduced_in_commit || '',
          (spi.blocking_entitlements || []).join(' '),
          (spi.spi_headers || []).join(' '),
          occ.request || '',
          occ.cleanup || ''
        ];
        const hay = hayParts.join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    const dir = state.spiSortDir === 'asc' ? 1 : -1;
    const field = state.spiSortField;
    filtered.sort((a, b) => {
      let va = '';
      let vb = '';
      if (field === 'name') {
        va = a.name;
        vb = b.name;
      } else if (field === 'processType') {
        va = a.processType;
        vb = b.processType;
      } else if (field === 'module') {
        va = a.module + ' ' + a.file;
        vb = b.module + ' ' + b.file;
      } else if (field === 'framework') {
        va = a.framework;
        vb = b.framework;
      } else if (field === 'featureCategory') {
        va = a.featureCategory;
        vb = b.featureCategory;
      } else if (field === 'availability3p') {
        va = a.availability3p;
        vb = b.availability3p;
      } else if (field === 'configs') {
        return (a.totalConfigsForSpi - b.totalConfigsForSpi) * dir;
      }
      return String(va).localeCompare(String(vb)) * dir;
    });

    state.filteredSpiRows = filtered;
    if (!opts || !opts.preservePage) {
      state.spiPage = 1;
    }
    renderSpiTable();
    if (!opts || !opts.skipHistory) {
      syncStateToHistory(Boolean(opts && opts.pushHistory));
    }
  }

  function renderSpiTable() {
    const thead = document.getElementById('spiTableHead');
    const tbody = document.getElementById('spiTableBody');
    const countLabel = document.getElementById('spiTableCountLabel');
    const footerInfo = document.getElementById('spiTableFooterInfo');

    thead.replaceChildren();
    tbody.replaceChildren();

    const rows = state.filteredSpiRows;
    const total = rows.length;
    const pageSize = state.spiPageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (state.spiPage > totalPages) state.spiPage = totalPages;

    const startIdx = (state.spiPage - 1) * pageSize;
    const endIdx = Math.min(total, startIdx + pageSize);
    const pageRows = rows.slice(startIdx, endIdx);

    const distinctNames = new Set(rows.map((r) => r.spi.id)).size;
    const granLabel =
      state.spiGranularity === 'config'
        ? 'expanded process/module configuration rows'
        : state.spiGranularity === 'toml'
          ? 'TOML allowlist block entries'
          : 'unique SPIs';

    countLabel.textContent =
      'Showing ' +
      fmtNum(total) +
      ' ' +
      granLabel +
      ' (' +
      fmtNum(distinctNames) +
      ' unique SPI names matched)';

    footerInfo.textContent =
      total > 0
        ? 'Showing rows ' + fmtNum(startIdx + 1) + '\u2013' + fmtNum(endIdx) + ' of ' + fmtNum(total)
        : 'No matching SPI configurations found';

    const pageText = 'Page ' + fmtNum(state.spiPage) + ' of ' + fmtNum(totalPages);
    document.getElementById('spiPageInfo').textContent = pageText;
    document.getElementById('spiPageInfoBottom').textContent = pageText;
    document.getElementById('spiPrevPageBtn').disabled = state.spiPage <= 1;
    document.getElementById('spiPrevPageBtnBottom').disabled = state.spiPage <= 1;
    document.getElementById('spiNextPageBtn').disabled = state.spiPage >= totalPages;
    document.getElementById('spiNextPageBtnBottom').disabled = state.spiPage >= totalPages;

    const trHead = el('tr');
    const columns = [
      { key: 'name', label: 'SPI Name & Kind', width: '16%' },
      {
        key: 'processType',
        label: state.spiGranularity === 'config' ? 'Enabled Process Configuration' : 'Enabled Process(es)',
        width: '11%'
      },
      { key: 'module', label: 'Allowlist Tier, Module & Guards', width: '13%' },
      { key: 'framework', label: 'Framework', width: '9%' },
      { key: 'featureCategory', label: 'Feature Category Enabled', width: '12%' },
      { key: 'availability3p', label: '3P Availability Tier', width: '14%' },
      { key: 'configs', label: 'Functionality, Source Headers & Commits', width: '25%' }
    ];

    for (const col of columns) {
      const arrow =
        state.spiSortField === col.key ? (state.spiSortDir === 'asc' ? ' \u2191' : ' \u2193') : '';
      const th = el('th', '', col.label + arrow);
      th.setAttribute('data-sort', col.key);
      if (col.width) th.style.width = col.width;
      th.addEventListener('click', () => {
        if (state.spiSortField === col.key) {
          state.spiSortDir = state.spiSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.spiSortField = col.key;
          state.spiSortDir = 'asc';
        }
        applySpiFiltersAndRender({ pushHistory: true });
      });
      trHead.appendChild(th);
    }
    thead.appendChild(trHead);

    if (pageRows.length === 0) {
      const trEmpty = el('tr');
      const tdEmpty = el('td', '', 'No SPI rows match the active filters. Click "Reset Filters" to restore all 2,933 configurations.');
      tdEmpty.colSpan = columns.length;
      tdEmpty.style.textAlign = 'center';
      tdEmpty.style.padding = '28px';
      tdEmpty.style.color = 'var(--text-muted)';
      trEmpty.appendChild(tdEmpty);
      tbody.appendChild(trEmpty);
      return;
    }

    for (const row of pageRows) {
      const spi = row.spi;
      const occ = row.occ || {};
      const isExpanded = state.expandedSpiRowIds.has(row.rowId);

      const tr = el('tr', 'item-row' + (isExpanded ? ' expanded' : ''));

      const tdName = el('td');
      tdName.appendChild(el('div', 'spi-name-primary', row.name));
      const metaWrap = el('div', 'spi-sub-meta');
      metaWrap.style.display = 'flex';
      metaWrap.style.gap = '5px';
      metaWrap.style.flexWrap = 'wrap';
      metaWrap.style.marginTop = '4px';
      metaWrap.appendChild(el('span', 'badge-pill badge-slate', row.kind));
      if (row.totalConfigsForSpi > 1) {
        metaWrap.appendChild(
          el('span', 'badge-pill badge-cyan', row.totalConfigsForSpi + ' process/TOML configs')
        );
      }
      if (occ.selector_class) {
        metaWrap.appendChild(el('span', 'mono-chip', 'class: ' + occ.selector_class));
      }
      tdName.appendChild(metaWrap);
      tr.appendChild(tdName);

      const tdProc = el('td');
      if (state.spiGranularity === 'config') {
        const procBadgeClass =
          row.processType === 'UIProcess'
            ? 'badge-cyan'
            : row.processType.includes('WebCore')
              ? 'badge-teal'
              : row.processType === 'WebKitLegacy (In-Process)'
                ? 'badge-orange'
                : 'badge-emerald';
        tdProc.appendChild(el('span', 'badge-pill ' + procBadgeClass, row.processType));
      } else {
        for (const p of row.processesList) {
          tdProc.appendChild(el('span', 'mono-chip', p));
        }
      }
      tr.appendChild(tdProc);

      const tdAllow = el('td');
      const allowTop = el('div');
      allowTop.style.display = 'flex';
      allowTop.style.gap = '5px';
      allowTop.style.flexWrap = 'wrap';
      allowTop.appendChild(el('span', 'mono-chip', row.module));
      if (row.hasLegacyFile && !row.hasReviewedFile) {
        allowTop.appendChild(el('span', 'badge-pill badge-orange', 'Legacy Allowlist'));
      } else if (row.hasReviewedFile && !row.hasLegacyFile) {
        allowTop.appendChild(el('span', 'badge-pill badge-emerald', 'Reviewed (' + (occ.reason || 'approved') + ')'));
      } else {
        allowTop.appendChild(el('span', 'badge-pill badge-amber', 'Legacy + Reviewed'));
      }

      if (row.addedAfterBaseline) {
        allowTop.appendChild(el('span', 'badge-pill badge-rose', '+Added to Legacy Post-Baseline'));
      } else if (row.reAddedAfterBaseline) {
        allowTop.appendChild(el('span', 'badge-pill badge-amber', 'Re-Added to Legacy'));
      }
      tdAllow.appendChild(allowTop);

      if (row.requiresStr) {
        const reqDiv = el('div', 'spi-sub-meta', 'Guard: ' + row.requiresStr);
        reqDiv.style.fontFamily = 'var(--font-mono)';
        tdAllow.appendChild(reqDiv);
      }
      tr.appendChild(tdAllow);

      const tdFw = el('td');
      tdFw.appendChild(el('span', 'mono-chip', row.framework));
      tr.appendChild(tdFw);

      const tdFeat = el('td');
      tdFeat.appendChild(el('div', '', row.featureCategory));
      tr.appendChild(tdFeat);

      const tdAvail = el('td');
      const avMeta = AVAILABILITY_META[row.availability3p] || {
        shortLabel: row.availability3p,
        badgeClass: 'badge-slate'
      };
      tdAvail.appendChild(el('span', 'badge-pill ' + avMeta.badgeClass, avMeta.shortLabel));
      if (Array.isArray(spi.blocking_entitlements) && spi.blocking_entitlements.length > 0) {
        const entDiv = el('div', 'spi-sub-meta');
        entDiv.style.marginTop = '4px';
        for (const ent of spi.blocking_entitlements.slice(0, 2)) {
          entDiv.appendChild(el('span', 'mono-chip', ent));
        }
        tdAvail.appendChild(entDiv);
      }
      tr.appendChild(tdAvail);

      const tdFunc = el('td');
      const funcTxt = el('div', 'spi-func-text', spi.functionality || '');
      tdFunc.appendChild(funcTxt);

      const subLinks = el('div', 'spi-sub-meta');
      subLinks.style.display = 'flex';
      subLinks.style.gap = '6px 8px';
      subLinks.style.flexWrap = 'wrap';
      subLinks.style.alignItems = 'center';
      subLinks.style.marginTop = '6px';

      if (Array.isArray(spi.spi_headers) && spi.spi_headers.length > 0) {
        subLinks.appendChild(el('span', 'mono-chip', spi.spi_headers.length + ' SPI header(s)'));
      }
      if (spi.call_site_count > 0) {
        subLinks.appendChild(el('span', 'mono-chip', spi.call_site_count + ' call site(s)'));
      }
      if (occ.introduced_in_commit && occ.introduced_in_commit !== 'cbb5741c87c7') {
        const ghLink = createExternalLink(
          WEBKIT_GH_COMMIT_BASE + occ.introduced_in_commit,
          'Added in ' + occ.introduced_in_commit.slice(0, 10),
          'github-commit-link',
          'View commit that added this entry on GitHub'
        );
        ghLink.addEventListener('click', (ev) => ev.stopPropagation());
        subLinks.appendChild(ghLink);
      }
      const expHint = el('span', '', isExpanded ? '\u25B2 Hide details' : '\u25BC Expand configs & source');
      expHint.style.color = 'var(--tone-cyan)';
      expHint.style.fontWeight = '600';
      subLinks.appendChild(expHint);

      tdFunc.appendChild(subLinks);
      tr.appendChild(tdFunc);

      tr.addEventListener('click', () => {
        if (state.expandedSpiRowIds.has(row.rowId)) {
          state.expandedSpiRowIds.delete(row.rowId);
        } else {
          state.expandedSpiRowIds.add(row.rowId);
        }
        renderSpiTable();
        syncStateToHistory(false);
      });

      tbody.appendChild(tr);

      if (isExpanded) {
        tbody.appendChild(buildSpiDetailDrawerRow(row, columns.length));
      }
    }
  }

  function buildSpiDetailDrawerRow(row, colSpan) {
    const spi = row.spi;
    const trDetail = el('tr', 'detail-row');
    const td = el('td');
    td.colSpan = colSpan;

    const drawer = el('div', 'detail-drawer');
    const leftCol = el('div');

    leftCol.appendChild(el('h4', 'detail-section-title', 'SPI Functionality & 3P BrowserEngineKit Interoperability Analysis'));
    const funcBox = el('div', 'detail-box');
    const p1 = el('div', '', spi.functionality || '');
    p1.style.fontWeight = '600';
    p1.style.color = 'var(--text-primary)';
    p1.style.marginBottom = '6px';
    funcBox.appendChild(p1);

    const p2 = el('div', '', spi.availability_3p_summary || '');
    p2.style.fontSize = '12.5px';
    p2.style.color = 'var(--text-secondary)';
    funcBox.appendChild(p2);

    if (
      (Array.isArray(spi.blocking_entitlements) && spi.blocking_entitlements.length > 0) ||
      (Array.isArray(spi.sandbox_mach_services) && spi.sandbox_mach_services.length > 0)
    ) {
      const entWrap = el('div');
      entWrap.style.marginTop = '8px';
      entWrap.appendChild(el('span', 'detail-section-title', 'Blocking Private Entitlements / Mach Services: '));
      for (const e of spi.blocking_entitlements || []) {
        entWrap.appendChild(el('span', 'badge-pill badge-rose', e));
      }
      for (const m of spi.sandbox_mach_services || []) {
        entWrap.appendChild(el('span', 'mono-chip', 'mach: ' + m));
      }
      funcBox.appendChild(entWrap);
    }
    leftCol.appendChild(funcBox);

    leftCol.appendChild(
      el(
        'h4',
        'detail-section-title',
        'All Enabled Process & TOML Configurations for "' + spi.name + '" (' + row.allConfigsForSpi.length + ' total)'
      )
    );
    const cfgBox = el('div', 'detail-box');
    const cfgTable = el('table', 'module-legacy-table');
    const cfgThead = el('thead');
    const cfgTrH = el('tr');
    ['Process Type', 'Module & TOML File', 'Form & Guards', 'Audit Status & Links'].forEach((h) => {
      const th = el('th', '', h);
      th.style.textAlign = 'left';
      cfgTrH.appendChild(th);
    });
    cfgThead.appendChild(cfgTrH);
    cfgTable.appendChild(cfgThead);

    const cfgTbody = el('tbody');
    for (const cfg of row.allConfigsForSpi) {
      const trC = el('tr');
      trC.style.textAlign = 'left';

      const tdP = el('td');
      tdP.style.textAlign = 'left';
      tdP.appendChild(el('span', 'badge-pill badge-cyan', cfg.processType));
      trC.appendChild(tdP);

      const tdF = el('td');
      tdF.style.textAlign = 'left';
      tdF.appendChild(
        createExternalLink(
          WEBKIT_GH_BLOB_BASE + cfg.file,
          cfg.file,
          'github-commit-link',
          'Open TOML allowlist file on GitHub'
        )
      );
      trC.appendChild(tdF);

      const tdG = el('td');
      tdG.style.textAlign = 'left';
      tdG.appendChild(el('span', 'mono-chip', cfg.form));
      if (cfg.requiresStr) {
        tdG.appendChild(el('div', 'spi-sub-meta', cfg.requiresStr));
      }
      if (cfg.reason) {
        tdG.appendChild(el('div', 'spi-sub-meta', 'Reason: ' + cfg.reason));
      }
      trC.appendChild(tdG);

      const tdS = el('td');
      tdS.style.textAlign = 'left';
      if (cfg.addedAfterBaseline) {
        tdS.appendChild(el('span', 'badge-pill badge-rose', 'Added Post-Baseline (' + (cfg.introducedInDate || '') + ')'));
      } else if (cfg.reAddedAfterBaseline) {
        tdS.appendChild(el('span', 'badge-pill badge-amber', 'Re-Added Post-Baseline'));
      } else if (cfg.inInitialBaseline) {
        tdS.appendChild(el('span', 'badge-pill badge-slate', 'Initial Baseline (2025-07-09)'));
      } else {
        tdS.appendChild(el('span', 'badge-pill badge-emerald', 'Reviewed Allowlist'));
      }

      if (cfg.introducedInCommit) {
        const cLink = createExternalLink(
          WEBKIT_GH_COMMIT_BASE + cfg.introducedInCommit,
          cfg.introducedInCommit.slice(0, 12),
          'github-commit-link',
          'View introducing commit on GitHub'
        );
        cLink.style.marginLeft = '6px';
        tdS.appendChild(cLink);
      }

      for (const reqStr of cfg.reqLinks || []) {
        if (reqStr.startsWith('http://') || reqStr.startsWith('https://')) {
          const bLink = createExternalLink(reqStr, reqStr, 'mono-chip', reqStr);
          bLink.style.marginLeft = '4px';
          tdS.appendChild(bLink);
        } else {
          const rChip = el('span', 'mono-chip', reqStr);
          rChip.style.marginLeft = '4px';
          tdS.appendChild(rChip);
        }
      }

      trC.appendChild(tdS);
      cfgTbody.appendChild(trC);
    }
    cfgTable.appendChild(cfgTbody);
    cfgBox.appendChild(cfgTable);
    leftCol.appendChild(cfgBox);

    const rightCol = el('div');

    rightCol.appendChild(
      el(
        'h4',
        'detail-section-title',
        'WebKit *SPI.h & *SoftLink* Declarations (' + ((spi.spi_headers || []).length) + ')'
      )
    );
    const hdrBox = el('div', 'detail-box');
    if (Array.isArray(spi.spi_headers) && spi.spi_headers.length > 0) {
      for (const hPath of spi.spi_headers) {
        const link = createExternalLink(
          WEBKIT_GH_BLOB_BASE + hPath,
          hPath,
          'github-commit-link',
          'View header in WebKit repository on GitHub'
        );
        link.style.margin = '2px 6px 2px 0';
        hdrBox.appendChild(link);
      }
    } else {
      hdrBox.appendChild(el('span', 'spi-sub-meta', 'Declared directly via SDKDB / Internal SDK header or inline extern.'));
    }
    rightCol.appendChild(hdrBox);

    rightCol.appendChild(
      el('h4', 'detail-section-title', 'WebKit Source Call Sites (' + (spi.call_site_count || 0) + ' total)')
    );
    const csBox = el('div', 'detail-box');
    if (Array.isArray(spi.call_sites) && spi.call_sites.length > 0) {
      for (const cs of spi.call_sites) {
        const csPath = typeof cs === 'string' ? cs : cs.file || '';
        if (!csPath) continue;
        const link = createExternalLink(
          WEBKIT_GH_BLOB_BASE + csPath,
          csPath,
          'github-commit-link',
          'Open source file in WebKit repository on GitHub'
        );
        link.style.margin = '2px 6px 2px 0';
        csBox.appendChild(link);
      }
    } else {
      csBox.appendChild(el('span', 'spi-sub-meta', 'Invoked via macro expansion, dynamic selector messaging, or generated IPC stubs.'));
    }
    rightCol.appendChild(csBox);

    const relatedCommits = state.commitsBySpiName.get(spi.name) || [];
    rightCol.appendChild(
      el('h4', 'detail-section-title', 'Historical Allowlist Commits Touching "' + spi.name + '" (' + relatedCommits.length + ')')
    );
    const comBox = el('div', 'detail-box');
    if (relatedCommits.length > 0) {
      for (const c of relatedCommits) {
        const cRow = el('div');
        cRow.style.display = 'flex';
        cRow.style.alignItems = 'center';
        cRow.style.justifyContent = 'space-between';
        cRow.style.flexWrap = 'wrap';
        cRow.style.gap = '8px';
        cRow.style.marginBottom = '5px';

        const leftPart = el('div');
        leftPart.appendChild(
          createExternalLink(
            c.github_url || WEBKIT_GH_COMMIT_BASE + c.hash,
            c.dateShort + ' \u2022 ' + c.short_hash,
            'github-commit-link',
            'View commit on GitHub'
          )
        );
        leftPart.appendChild(el('span', 'spi-sub-meta', ' ' + c.subject));
        cRow.appendChild(leftPart);

        const jumpCommitBtn = el('button', 'insight-data-link', 'Open Commit \u2192');
        jumpCommitBtn.type = 'button';
        jumpCommitBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          jumpToDataTab({
            subview: 'commits',
            commitSearch: c.short_hash,
            expandCommitHash: c.hash
          });
        });
        cRow.appendChild(jumpCommitBtn);
        comBox.appendChild(cRow);
      }
    } else {
      comBox.appendChild(el('span', 'spi-sub-meta', 'Present since initial allowlist baseline (2025-07-09).'));
    }
    rightCol.appendChild(comBox);

    drawer.appendChild(leftCol);
    drawer.appendChild(rightCol);
    td.appendChild(drawer);
    trDetail.appendChild(td);
    return trDetail;
  }

  // =========================================================================
  // TAB 2, SUB-VIEW 2: Raw Allowlist Commit History & Legacy Audit (159 Commits)
  // =========================================================================

  function applyCommitFiltersAndRender(opts) {
    const f = state.commitFilters;
    const q = f.search.trim().toLowerCase();

    const filtered = state.commits.filter((c) => {
      if (f.legacyMode === 'legacy_additions_only') {
        if (c.index === 0 || (c.legacy_added_count || 0) <= 0) return false;
      } else if (f.legacyMode === 'legacy_removals_only') {
        if ((c.legacy_removed_count || 0) <= 0) return false;
      } else if (f.legacyMode === 'reviewed_additions_only') {
        if ((c.reviewed_added_count || 0) <= 0) return false;
      }

      if (f.category !== 'all' && c.primary_category !== f.category) return false;
      if (f.featureArea !== 'all' && c.feature_area !== f.featureArea) return false;

      if (f.module !== 'all') {
        if (!(c.touchedModules || []).includes(f.module)) return false;
      }

      if (f.legacyAddCat !== 'all' && c.legacy_addition_category !== f.legacyAddCat) {
        return false;
      }

      if (q) {
        const addedNames = (c.added || []).map((e) => e.name).join(' ');
        const removedNames = (c.removed || []).map((e) => e.name).join(' ');
        const modNames = (c.modified || []).map((e) => e.name).join(' ');
        const hay = [
          c.hash,
          c.short_hash,
          c.dateShort,
          c.subject,
          c.description || '',
          c.primary_category || '',
          c.feature_area || '',
          c.why_changed || '',
          c.legacy_addition_category || '',
          c.legacy_addition_reason || '',
          (c.bugs || []).join(' '),
          addedNames,
          removedNames,
          modNames
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });

    const dir = state.commitSortDir === 'asc' ? 1 : -1;
    const field = state.commitSortField;

    filtered.sort((a, b) => {
      if (field === 'index' || field === 'date') {
        return (a.index - b.index) * dir;
      }
      if (
        field === 'added_count' ||
        field === 'removed_count' ||
        field === 'legacy_added_count' ||
        field === 'unique_spis'
      ) {
        return ((a[field] || 0) - (b[field] || 0)) * dir;
      }
      return String(a[field] || '').localeCompare(String(b[field] || '')) * dir;
    });

    state.filteredCommits = filtered;
    if (!opts || !opts.preservePage) {
      state.commitPage = 1;
    }
    renderCommitTable();
    if (!opts || !opts.skipHistory) {
      syncStateToHistory(Boolean(opts && opts.pushHistory));
    }
  }

  function renderCommitTable() {
    const tbody = document.getElementById('commitTableBody');
    const countLabel = document.getElementById('commitTableCountLabel');
    const footerInfo = document.getElementById('commitTableFooterInfo');
    tbody.replaceChildren();

    const commits = state.filteredCommits;
    const total = commits.length;
    const pageSize = state.commitPageSize;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (state.commitPage > totalPages) state.commitPage = totalPages;

    const startIdx = (state.commitPage - 1) * pageSize;
    const endIdx = Math.min(total, startIdx + pageSize);
    const pageCommits = commits.slice(startIdx, endIdx);

    const sumAdded = commits
      .filter((c) => c.index > 0)
      .reduce((acc, c) => acc + (c.added_count || 0), 0);
    const sumRemoved = commits
      .filter((c) => c.index > 0)
      .reduce((acc, c) => acc + (c.removed_count || 0), 0);

    countLabel.textContent =
      'Showing ' +
      fmtNum(total) +
      ' commits (Post-baseline gross in selection: +' +
      fmtNum(sumAdded) +
      ' added / -' +
      fmtNum(sumRemoved) +
      ' removed)';

    footerInfo.textContent =
      total > 0
        ? 'Showing commits ' + fmtNum(startIdx + 1) + '\u2013' + fmtNum(endIdx) + ' of ' + fmtNum(total)
        : 'No commits match the active filters';

    const pageText = 'Page ' + fmtNum(state.commitPage) + ' of ' + fmtNum(totalPages);
    document.getElementById('commitPageInfo').textContent = pageText;
    document.getElementById('commitPageInfoBottom').textContent = pageText;
    document.getElementById('commitPrevPageBtn').disabled = state.commitPage <= 1;
    document.getElementById('commitPrevPageBtnBottom').disabled = state.commitPage <= 1;
    document.getElementById('commitNextPageBtn').disabled = state.commitPage >= totalPages;
    document.getElementById('commitNextPageBtnBottom').disabled = state.commitPage >= totalPages;

    if (pageCommits.length === 0) {
      const trEmpty = el('tr');
      const tdEmpty = el('td', '', 'No commits match the active filters.');
      tdEmpty.colSpan = 10;
      tdEmpty.style.textAlign = 'center';
      tdEmpty.style.padding = '28px';
      tdEmpty.style.color = 'var(--text-muted)';
      trEmpty.appendChild(tdEmpty);
      tbody.appendChild(trEmpty);
      return;
    }

    for (const c of pageCommits) {
      const isExpanded = state.expandedCommitHashes.has(c.hash);
      const tr = el('tr', 'item-row' + (isExpanded ? ' expanded' : ''));

      tr.appendChild(el('td', 'delta-neutral', '#' + c.index));
      tr.appendChild(el('td', '', c.dateShort));

      const tdGh = el('td');
      const ghLink = createExternalLink(
        c.github_url || WEBKIT_GH_COMMIT_BASE + c.hash,
        c.short_hash,
        'github-commit-link',
        'View commit on github.com/WebKit/WebKit'
      );
      ghLink.addEventListener('click', (ev) => ev.stopPropagation());
      tdGh.appendChild(ghLink);
      tr.appendChild(tdGh);

      const tdCat = el('td');
      const catLabel = state.categoryLabelsById.get(c.primary_category) || c.primary_category;
      const catBadgeClass =
        c.primary_category === 'cleanup-remove-spi' || c.primary_category === 'feature-removal'
          ? 'badge-emerald'
          : c.primary_category === 'bugfix-or-security-spi'
            ? 'badge-rose'
            : 'badge-cyan';
      tdCat.appendChild(el('span', 'badge-pill ' + catBadgeClass, catLabel));
      tr.appendChild(tdCat);

      const tdArea = el('td');
      tdArea.appendChild(el('span', 'mono-chip', c.feature_area));
      tr.appendChild(tdArea);

      tr.appendChild(
        el(
          'td',
          c.added_count > 0 ? 'delta-pos-rose' : 'delta-neutral',
          c.added_count > 0 ? '+' + fmtNum(c.added_count) : '0'
        )
      );

      tr.appendChild(
        el(
          'td',
          c.removed_count > 0 ? 'delta-neg-emerald' : 'delta-neutral',
          c.removed_count > 0 ? '-' + fmtNum(c.removed_count) : '0'
        )
      );

      const tdLeg = el('td');
      if (c.legacy_added_count > 0) {
        tdLeg.appendChild(el('span', 'badge-pill badge-rose', '+' + c.legacy_added_count + ' Legacy'));
      }
      if (c.legacy_removed_count > 0) {
        const bRem = el('span', 'badge-pill badge-emerald', '-' + c.legacy_removed_count + ' Legacy');
        if (c.legacy_added_count > 0) bRem.style.marginLeft = '4px';
        tdLeg.appendChild(bRem);
      }
      if (!c.legacy_added_count && !c.legacy_removed_count) {
        tdLeg.appendChild(el('span', 'delta-neutral', '0'));
      }
      tr.appendChild(tdLeg);

      tr.appendChild(el('td', 'delta-neutral', fmtNum(c.unique_spis)));

      const tdSubj = el('td');
      const sLine = el('div', '', c.subject);
      sLine.style.fontWeight = '600';
      sLine.style.color = '#f8fafc';
      tdSubj.appendChild(sLine);

      const whyLine = el('div', 'spi-sub-meta', c.why_changed || '');
      tdSubj.appendChild(whyLine);

      if (c.legacy_addition_category) {
        const legReasonWrap = el('div', 'spi-sub-meta');
        legReasonWrap.style.marginTop = '4px';
        const lLabel = state.legacyCatLabelsById.get(c.legacy_addition_category) || c.legacy_addition_category;
        legReasonWrap.appendChild(el('span', 'badge-pill badge-amber', 'Legacy Addition: ' + lLabel));
        tdSubj.appendChild(legReasonWrap);
      }

      const filesWrap = el('div', 'spi-sub-meta');
      filesWrap.style.marginTop = '4px';
      for (const tf of c.touched_toml_files || []) {
        const pathStr = typeof tf === 'string' ? tf : tf.file || '';
        const shortFile = pathStr.replace(/^Source\//, '').replace(/Configurations\//, '');
        filesWrap.appendChild(el('span', 'mono-chip', shortFile));
      }
      tdSubj.appendChild(filesWrap);

      tr.appendChild(tdSubj);

      tr.addEventListener('click', () => {
        if (state.expandedCommitHashes.has(c.hash)) {
          state.expandedCommitHashes.delete(c.hash);
        } else {
          state.expandedCommitHashes.add(c.hash);
        }
        renderCommitTable();
        syncStateToHistory(false);
      });

      tbody.appendChild(tr);

      if (isExpanded) {
        tbody.appendChild(buildCommitDetailDrawerRow(c));
      }
    }
  }

  function buildCommitDetailDrawerRow(c) {
    const trDetail = el('tr', 'detail-row');
    const td = el('td');
    td.colSpan = 10;

    const drawer = el('div', 'detail-drawer');

    const leftCol = el('div');
    leftCol.appendChild(el('h4', 'detail-section-title', 'Curated Commit Analysis & Links'));
    const whyBox = el('div', 'detail-box');
    const pWhy = el('div', '', c.why_changed || '');
    pWhy.style.fontWeight = '600';
    pWhy.style.marginBottom = '6px';
    whyBox.appendChild(pWhy);

    if (c.legacy_addition_reason) {
      const lLabel = state.legacyCatLabelsById.get(c.legacy_addition_category) || c.legacy_addition_category || '';
      const legWarn = el(
        'div',
        'risk-prediction-banner',
        'Why Added to AllowedSPI-legacy.toml (' + lLabel + '): ' + c.legacy_addition_reason
      );
      whyBox.appendChild(legWarn);
    }

    const linkBar = el('div');
    linkBar.style.display = 'flex';
    linkBar.style.gap = '8px';
    linkBar.style.flexWrap = 'wrap';
    linkBar.style.marginTop = '8px';
    linkBar.appendChild(
      createExternalLink(
        c.github_url || WEBKIT_GH_COMMIT_BASE + c.hash,
        'View Full Diff on GitHub (' + c.short_hash + ') \u2197',
        'github-commit-link'
      )
    );
    for (const bugUrlOrId of c.bugs || []) {
      const bStr = String(bugUrlOrId);
      const href = bStr.startsWith('http') ? bStr : 'https://bugs.webkit.org/show_bug.cgi?id=' + bStr;
      linkBar.appendChild(createExternalLink(href, bStr + ' \u2197', 'mono-chip'));
    }
    whyBox.appendChild(linkBar);
    leftCol.appendChild(whyBox);

    leftCol.appendChild(el('h4', 'detail-section-title', 'Full Git Commit Message'));
    leftCol.appendChild(el('pre', 'detail-pre', c.description || c.subject));

    const rightCol = el('div');

    function appendSpiDiffList(title, entries) {
      rightCol.appendChild(el('h4', 'detail-section-title', title + ' (' + entries.length + ')'));
      const box = el('div', 'detail-box');
      box.style.maxHeight = '160px';
      box.style.overflowY = 'auto';

      if (entries.length === 0) {
        box.appendChild(el('span', 'spi-sub-meta', 'None in this commit.'));
      } else {
        for (const entry of entries.slice(0, 120)) {
          const tierTag = entry.form === 'legacy' || String(entry.file || '').includes('legacy') ? ':legacy' : ':reviewed';
          const chip = el(
            'button',
            'spi-chip-clickable',
            entry.name + ' (' + (entry.module || '') + tierTag + ')'
          );
          chip.type = 'button';
          chip.title = 'Click to inspect "' + entry.name + '" in the SPI Configuration Inventory';
          chip.addEventListener('click', (ev) => {
            ev.stopPropagation();
            jumpToDataTab({
              subview: 'spi',
              granularity: 'config',
              search: entry.name
            });
          });
          box.appendChild(chip);
        }
        if (entries.length > 120) {
          box.appendChild(
            el('div', 'spi-sub-meta', '+ ' + fmtNum(entries.length - 120) + ' more entries (see GitHub commit diff)')
          );
        }
      }
      rightCol.appendChild(box);
    }

    appendSpiDiffList('Added SPI Entries', c.added || []);
    appendSpiDiffList('Removed SPI Entries', c.removed || []);
    if (Array.isArray(c.modified) && c.modified.length > 0) {
      appendSpiDiffList('Modified SPI Entries', c.modified);
    }

    drawer.appendChild(leftCol);
    drawer.appendChild(rightCol);
    td.appendChild(drawer);
    trDetail.appendChild(td);
    return trDetail;
  }

  function resetSpiFilterStateOnly() {
    state.spiFilters = {
      search: '',
      process: 'all',
      feature: 'all',
      availability: 'all',
      framework: 'all',
      module: 'all',
      kind: 'all',
      legacyStatus: 'all'
    };
    document.getElementById('spiSearchInput').value = '';
    document.getElementById('spiProcessFilter').value = 'all';
    document.getElementById('spiFeatureFilter').value = 'all';
    document.getElementById('spiAvailabilityFilter').value = 'all';
    document.getElementById('spiFrameworkFilter').value = 'all';
    document.getElementById('spiModuleFilter').value = 'all';
    document.getElementById('spiKindFilter').value = 'all';
    document.getElementById('spiLegacyStatusFilter').value = 'all';
  }

  function resetCommitFilterStateOnly() {
    state.commitFilters = {
      search: '',
      legacyMode: 'all',
      category: 'all',
      featureArea: 'all',
      module: 'all',
      legacyAddCat: 'all'
    };
    document.getElementById('commitSearchInput').value = '';
    document.getElementById('commitLegacyModeFilter').value = 'all';
    document.getElementById('commitCategoryFilter').value = 'all';
    document.getElementById('commitFeatureAreaFilter').value = 'all';
    document.getElementById('commitModuleFilter').value = 'all';
    document.getElementById('commitLegacyAddCatFilter').value = 'all';
  }

  function csvEscape(val) {
    const s = val === undefined || val === null ? '' : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function triggerCsvDownload(filename, lines) {
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportFilteredSpisCsv() {
    const headers = [
      'spi_name', 'kind', 'process_type', 'module', 'toml_file', 'form',
      'requires_guards', 'framework', 'feature_category', 'availability_3p',
      'is_apple_only', 'added_to_legacy_after_baseline', 'introduced_in_commit', 'functionality'
    ];
    const lines = [headers.join(',')];
    for (const r of state.filteredSpiRows) {
      const spi = r.spi;
      const occ = r.occ || {};
      lines.push(
        [
          r.name, r.kind, r.processType, r.module, r.file, r.form,
          r.requiresStr || '', r.framework, r.featureCategory, r.availability3p,
          r.isAppleOnly, r.addedAfterBaseline, occ.introduced_in_commit || '', spi.functionality || ''
        ].map(csvEscape).join(',')
      );
    }
    triggerCsvDownload('webkit_ios_spi_configurations.csv', lines);
  }

  function exportFilteredCommitsCsv() {
    const headers = [
      'index', 'date', 'hash', 'github_url', 'primary_category', 'feature_area',
      'added_count', 'removed_count', 'legacy_added_count', 'legacy_removed_count',
      'unique_spis_after_commit', 'legacy_addition_category', 'subject', 'why_changed'
    ];
    const lines = [headers.join(',')];
    for (const c of state.filteredCommits) {
      lines.push(
        [
          c.index, c.dateShort, c.hash, c.github_url || WEBKIT_GH_COMMIT_BASE + c.hash,
          c.primary_category, c.feature_area, c.added_count, c.removed_count,
          c.legacy_added_count, c.legacy_removed_count, c.unique_spis,
          c.legacy_addition_category || '', c.subject, c.why_changed || ''
        ].map(csvEscape).join(',')
      );
    }
    triggerCsvDownload('webkit_ios_spi_commits.csv', lines);
  }

  function bindEvents() {
    document.getElementById('tabBtnInsights').addEventListener('click', () => switchMainTab('insights', false));
    document.getElementById('tabBtnData').addEventListener('click', () => switchMainTab('data', false));

    document.querySelectorAll('#insightsQuickJumps a.quick-jump-chip').forEach((link) => {
      link.addEventListener('click', (ev) => {
        const href = link.getAttribute('href') || '';
        if (href.startsWith('#')) {
          const target = document.getElementById(href.slice(1));
          if (target) {
            ev.preventDefault();
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      });
    });

    const methBtn = document.getElementById('toggleMethodologyBtn');
    const methPanel = document.getElementById('methodologyPanel');
    methBtn.addEventListener('click', () => {
      const isHidden = methPanel.classList.toggle('hidden');
      methBtn.setAttribute('aria-expanded', String(!isHidden));
    });

    document.querySelectorAll('[data-jump-subview]').forEach((node) => {
      node.addEventListener('click', () => {
        jumpToDataTab({
          subview: node.getAttribute('data-jump-subview') || 'spi',
          granularity: node.getAttribute('data-jump-granularity') || undefined,
          availability: node.getAttribute('data-jump-availability') || undefined,
          legacyStatus: node.getAttribute('data-jump-legacy-status') || undefined,
          legacyOnly: node.getAttribute('data-jump-legacy-only') === 'true'
        });
      });
    });

    document.getElementById('pieGroupBySelect').addEventListener('change', (ev) => {
      state.pieGroupBy = ev.target.value;
      renderPieSection();
      syncStateToHistory(true);
    });

    document.getElementById('historyChartModeSelect').addEventListener('change', (ev) => {
      state.historyChartMode = ev.target.value;
      renderHistoryEvolutionSection();
      syncStateToHistory(true);
    });
    document.getElementById('trajectoryMetricSelect').addEventListener('change', (ev) => {
      state.trajectoryMetric = ev.target.value;
      renderHistoryEvolutionSection();
      syncStateToHistory(true);
    });

    document.querySelectorAll('[data-subview-btn]').forEach((btn) => {
      btn.addEventListener('click', () => {
        setDataSubView(btn.getAttribute('data-subview-btn'));
      });
    });

    document.getElementById('clearAllDataFiltersBtn').addEventListener('click', () => {
      resetSpiFilterStateOnly();
      resetCommitFilterStateOnly();
      state.filterBannerText = '';
      document.getElementById('activeFilterBanner').classList.add('hidden');
      applySpiFiltersAndRender({ skipHistory: true });
      applyCommitFiltersAndRender({ skipHistory: true });
      syncStateToHistory(true);
    });
    document.getElementById('backToInsightsBtn').addEventListener('click', () => {
      switchMainTab('insights', false);
    });

    document.querySelectorAll('#spiGranularityControl [data-granularity]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.spiGranularity = btn.getAttribute('data-granularity');
        syncGranularityButtons();
        applySpiFiltersAndRender({ pushHistory: true });
      });
    });

    document.getElementById('spiSearchInput').addEventListener('input', (ev) => {
      state.spiFilters.search = ev.target.value;
      applySpiFiltersAndRender();
    });
    document.getElementById('spiProcessFilter').addEventListener('change', (ev) => {
      state.spiFilters.process = ev.target.value;
      applySpiFiltersAndRender({ pushHistory: true });
    });
    document.getElementById('spiFeatureFilter').addEventListener('change', (ev) => {
      state.spiFilters.feature = ev.target.value;
      applySpiFiltersAndRender({ pushHistory: true });
    });
    document.getElementById('spiAvailabilityFilter').addEventListener('change', (ev) => {
      state.spiFilters.availability = ev.target.value;
      applySpiFiltersAndRender({ pushHistory: true });
    });
    document.getElementById('spiFrameworkFilter').addEventListener('change', (ev) => {
      state.spiFilters.framework = ev.target.value;
      applySpiFiltersAndRender({ pushHistory: true });
    });
    document.getElementById('spiModuleFilter').addEventListener('change', (ev) => {
      state.spiFilters.module = ev.target.value;
      applySpiFiltersAndRender({ pushHistory: true });
    });
    document.getElementById('spiKindFilter').addEventListener('change', (ev) => {
      state.spiFilters.kind = ev.target.value;
      applySpiFiltersAndRender({ pushHistory: true });
    });
    document.getElementById('spiLegacyStatusFilter').addEventListener('change', (ev) => {
      state.spiFilters.legacyStatus = ev.target.value;
      applySpiFiltersAndRender({ pushHistory: true });
    });
    document.getElementById('resetSpiFiltersBtn').addEventListener('click', () => {
      resetSpiFilterStateOnly();
      state.filterBannerText = buildFilterBannerTextFromState();
      const banner = document.getElementById('activeFilterBanner');
      if (state.filterBannerText) {
        banner.classList.remove('hidden');
        document.getElementById('activeFilterBannerText').textContent = state.filterBannerText;
      } else {
        banner.classList.add('hidden');
      }
      applySpiFiltersAndRender({ pushHistory: true });
    });

    document.getElementById('spiPageSizeSelect').addEventListener('change', (ev) => {
      state.spiPageSize = Number(ev.target.value) || 50;
      state.spiPage = 1;
      renderSpiTable();
      syncStateToHistory(false);
    });
    const prevSpiPage = () => {
      if (state.spiPage > 1) {
        state.spiPage--;
        renderSpiTable();
        syncStateToHistory(false);
      }
    };
    const nextSpiPage = () => {
      const totalPages = Math.max(1, Math.ceil(state.filteredSpiRows.length / state.spiPageSize));
      if (state.spiPage < totalPages) {
        state.spiPage++;
        renderSpiTable();
        syncStateToHistory(false);
      }
    };
    document.getElementById('spiPrevPageBtn').addEventListener('click', prevSpiPage);
    document.getElementById('spiPrevPageBtnBottom').addEventListener('click', prevSpiPage);
    document.getElementById('spiNextPageBtn').addEventListener('click', nextSpiPage);
    document.getElementById('spiNextPageBtnBottom').addEventListener('click', nextSpiPage);

    document.getElementById('commitSearchInput').addEventListener('input', (ev) => {
      state.commitFilters.search = ev.target.value;
      applyCommitFiltersAndRender();
    });
    document.getElementById('commitLegacyModeFilter').addEventListener('change', (ev) => {
      state.commitFilters.legacyMode = ev.target.value;
      applyCommitFiltersAndRender({ pushHistory: true });
    });
    document.getElementById('commitCategoryFilter').addEventListener('change', (ev) => {
      state.commitFilters.category = ev.target.value;
      applyCommitFiltersAndRender({ pushHistory: true });
    });
    document.getElementById('commitFeatureAreaFilter').addEventListener('change', (ev) => {
      state.commitFilters.featureArea = ev.target.value;
      applyCommitFiltersAndRender({ pushHistory: true });
    });
    document.getElementById('commitModuleFilter').addEventListener('change', (ev) => {
      state.commitFilters.module = ev.target.value;
      applyCommitFiltersAndRender({ pushHistory: true });
    });
    document.getElementById('commitLegacyAddCatFilter').addEventListener('change', (ev) => {
      state.commitFilters.legacyAddCat = ev.target.value;
      applyCommitFiltersAndRender({ pushHistory: true });
    });
    document.getElementById('resetCommitFiltersBtn').addEventListener('click', () => {
      resetCommitFilterStateOnly();
      state.filterBannerText = buildFilterBannerTextFromState();
      const banner = document.getElementById('activeFilterBanner');
      if (state.filterBannerText) {
        banner.classList.remove('hidden');
        document.getElementById('activeFilterBannerText').textContent = state.filterBannerText;
      } else {
        banner.classList.add('hidden');
      }
      applyCommitFiltersAndRender({ pushHistory: true });
    });

    document.querySelectorAll('#commitDataTable thead th[data-commit-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-commit-sort');
        if (state.commitSortField === key) {
          state.commitSortDir = state.commitSortDir === 'asc' ? 'desc' : 'asc';
        } else {
          state.commitSortField = key;
          state.commitSortDir = 'desc';
        }
        applyCommitFiltersAndRender({ pushHistory: true });
      });
    });

    document.getElementById('commitPageSizeSelect').addEventListener('change', (ev) => {
      state.commitPageSize = Number(ev.target.value) || 50;
      state.commitPage = 1;
      renderCommitTable();
      syncStateToHistory(false);
    });
    const prevCommitPage = () => {
      if (state.commitPage > 1) {
        state.commitPage--;
        renderCommitTable();
        syncStateToHistory(false);
      }
    };
    const nextCommitPage = () => {
      const totalPages = Math.max(1, Math.ceil(state.filteredCommits.length / state.commitPageSize));
      if (state.commitPage < totalPages) {
        state.commitPage++;
        renderCommitTable();
        syncStateToHistory(false);
      }
    };
    document.getElementById('commitPrevPageBtn').addEventListener('click', prevCommitPage);
    document.getElementById('commitPrevPageBtnBottom').addEventListener('click', prevCommitPage);
    document.getElementById('commitNextPageBtn').addEventListener('click', nextCommitPage);
    document.getElementById('commitNextPageBtnBottom').addEventListener('click', nextCommitPage);

    document.getElementById('exportSpiCsvBtn').addEventListener('click', exportFilteredSpisCsv);
    document.getElementById('exportCommitsCsvBtn').addEventListener('click', exportFilteredCommitsCsv);

    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (state.activeTab === 'insights') {
          renderHistoryEvolutionSection();
        }
      }, 100);
    });

    window.addEventListener('popstate', (ev) => {
      if (ev.state && typeof ev.state === 'object') {
        applyStateSnapshot(ev.state);
      } else {
        loadStateFromHash();
      }
      restoreUiFromState();
    });
  }

  function init() {
    const inventory = window.__WKANALYZE_SPI_INVENTORY__;
    const history = window.__WKANALYZE_SPI_HISTORY__;

    const metaBadge = document.getElementById('datasetMetaBadge');
    if (!inventory || !history) {
      if (metaBadge) {
        metaBadge.textContent = 'Error: SPI dataset scripts failed to load';
      }
      return;
    }

    buildDatasets(inventory, history);

    if (metaBadge) {
      const totals = inventory.metadata.totals;
      const dr = history.metadata.date_range || {};
      metaBadge.textContent =
        fmtNum(totals.unique_spis) +
        ' Unique SPIs \u2022 ' +
        fmtNum(state.configRows.length) +
        ' Configs \u2022 ' +
        fmtNum(history.metadata.total_commits) +
        ' Commits (' +
        fmtDateShort(dr.first_allowlist_commit_date) +
        ' \u2192 ' +
        fmtDateShort(dr.latest_allowlist_commit_date) +
        ')';
    }

    populateFilterDropdowns();
    loadStateFromHash();
    bindEvents();

    renderLegacySpotlightSection();
    renderInsightsAndPredictions();
    restoreUiFromState();
    syncStateToHistory(false);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
