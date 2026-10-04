/**
 * WebKit iOS Sandbox Evolution — Interactive Visualization & Explorer
 *
 * Loads static dataset from `window.__WKANALYZE_SANDBOX_DATA__` (via <script src="data/sandbox_changes.js">)
 * so the app works identically on file://, localhost, and sandboxed opaque origins with zero XHR/network requests.
 * All DOM updates use safe node construction (createElement / createElementNS / textContent / replaceChildren).
 */
(function () {
  'use strict';

  const SVG_NS = 'http://www.w3.org/2000/svg';

  const CATEGORY_META = {
    'security-hardening': {
      label: 'Security Hardening',
      shortLabel: 'Security Hardening',
      color: '#2563eb',
      badgeClass: 'cat-security-hardening',
      description: 'Tightens sandbox surface by blocking syscalls, Mach services, IOKit properties, or file paths.'
    },
    'feature-expansion': {
      label: 'Feature & Process Enablement',
      shortLabel: 'Feature Enablement',
      color: '#059669',
      badgeClass: 'cat-feature-expansion',
      description: 'Grants sandbox permissions for new WebKit features, OS frameworks, or new helper processes.'
    },
    'bugfix-compatibility': {
      label: 'Bug Fix & OS Compatibility',
      shortLabel: 'Bug Fix & Compat',
      color: '#d97706',
      badgeClass: 'cat-bugfix-compatibility',
      description: 'Resolves runtime sandbox violations, crashes, hangs, or iOS/visionOS SDK regressions.'
    },
    'telemetry-logging': {
      label: 'Telemetry & Violation Logging',
      shortLabel: 'Telemetry & Logging',
      color: '#7c3aed',
      badgeClass: 'cat-telemetry-logging',
      description: 'Adds/removes `with telemetry` or `with no-report` modifiers without changing enforcement.'
    },
    'refactor-cleanup': {
      label: 'Refactoring, Cleanup & Formatting',
      shortLabel: 'Refactor & Cleanup',
      color: '#64748b',
      badgeClass: 'cat-refactor-cleanup',
      description: 'Extracts shared macros, removes redundant rules or obsolete comments, or formats `.sb` files.'
    },
    'revert': {
      label: 'Revert',
      shortLabel: 'Revert',
      color: '#dc2626',
      badgeClass: 'cat-revert',
      description: 'Reverts a prior sandbox commit due to functional regressions, crashes, or build failures.'
    }
  };

  const CATEGORY_ORDER = [
    'security-hardening',
    'feature-expansion',
    'bugfix-compatibility',
    'telemetry-logging',
    'refactor-cleanup',
    'revert'
  ];

  const EFFECT_META = {
    'block-more': {
      label: 'Block More (Tighten)',
      shortLabel: 'Block More',
      symbol: '\u25BC',
      color: '#2563eb',
      badgeClass: 'eff-block-more',
      description: 'Net reduction in allowed sandbox surface (adds deny rules, removes allow rules, or restricts to pre-launch/Lockdown).'
    },
    'allow-more': {
      label: 'Allow More (Expand)',
      shortLabel: 'Allow More',
      symbol: '\u25B2',
      color: '#059669',
      badgeClass: 'eff-allow-more',
      description: 'Net expansion of allowed sandbox surface (adds allow rules, unblocks syscalls/Mach endpoints, or adds process profile).'
    },
    'combination': {
      label: 'Combination (Allow & Block)',
      shortLabel: 'Combination',
      symbol: '\u25C6',
      color: '#d97706',
      badgeClass: 'eff-combination',
      description: 'Simultaneously restricts some primitives while allowing replacement or narrower primitives.'
    },
    'no-impact': {
      label: 'No Sandbox Impact',
      shortLabel: 'No Impact',
      symbol: '\u25CB',
      color: '#64748b',
      badgeClass: 'eff-no-impact',
      description: 'No runtime policy change (comments, formatting, macro extraction, compile guards, or telemetry/logging flags).'
    }
  };

  const EFFECT_ORDER = ['block-more', 'allow-more', 'combination', 'no-impact'];

  const TRIGGER_META = {
    'os-framework-3p': {
      label: 'Confirmed OS / Framework / 3P Engine Change',
      shortLabel: 'OS / Framework / 3P',
      color: '#0284c7',
      badgeClass: 'trig-os-framework',
      description: 'Explicitly driven by underlying iOS frameworks, daemons, kernel/libc/dyld primitives, GPU/IOKit drivers, or 3P BrowserEngineKit rules with zero WebKit runtime C++ changes.'
    },
    'opaque-runtime-fix': {
      label: 'Opaque / Telemetry Runtime Fix (Sandbox-Only)',
      shortLabel: 'Opaque Runtime Fix',
      color: '#d97706',
      badgeClass: 'trig-opaque-fix',
      description: 'Sandbox-only permission expansions/adjustments fixing runtime violations or telemetry hits where terse commit messages (rdar:// only) leave OS vs. WebKit origin ambiguous.'
    },
    'webkit-code-coupled': {
      label: 'WebKit Code-Coupled Change',
      shortLabel: 'WebKit Code-Coupled',
      color: '#2563eb',
      badgeClass: 'trig-webkit-code',
      description: 'Modifies WebKit C++/ObjC/Swift runtime source files alongside sandbox profiles (features, IPC proxying, process splits, state flags).'
    },
    'proactive-hardening': {
      label: 'Proactive Sandbox Hardening (Sandbox-Only)',
      shortLabel: 'Proactive Hardening',
      color: '#dc2626',
      badgeClass: 'trig-hardening',
      description: 'Sandbox-only commits tightening attack surface (block-more) or reverting experimental blocks without C++/ObjC runtime code changes.'
    },
    'telemetry-refactor': {
      label: 'Telemetry, Refactoring & Build Maintenance',
      shortLabel: 'Telemetry / Refactor',
      color: '#64748b',
      badgeClass: 'trig-telemetry',
      description: 'Sandbox-only commits adding/removing telemetry modifiers, extracting shared *-defines.sb macros, or fixing .sb build guards.'
    }
  };

  const TRIGGER_ORDER = [
    'os-framework-3p',
    'opaque-runtime-fix',
    'webkit-code-coupled',
    'proactive-hardening',
    'telemetry-refactor'
  ];

  const PROFILE_COLORS = {
    'WebContent': '#2563eb',
    'GPU': '#059669',
    'Networking': '#d97706',
    'WebAuthn': '#7c3aed',
    'adattributiond': '#db2777',
    'webpushd': '#0891b2',
    'Databases/Storage': '#4f46e5',
    'Model': '#ea580c',
    'Shared': '#64748b'
  };

  const PROFILE_ORDER = [
    'WebContent',
    'GPU',
    'Networking',
    'WebAuthn',
    'adattributiond',
    'webpushd',
    'Databases/Storage',
    'Model',
    'Shared'
  ];

  const RESOURCE_DESCRIPTIONS = {
    'syscall-unix': 'BSD/Unix system calls (SYS_*)',
    'mach-lookup': 'Mach bootstrap / XPC service endpoints',
    'iokit': 'IOKit user-client classes & properties',
    'file': 'Filesystem read/write/map/extension rules',
    'preferences': 'CFPreferences / NSUserDefaults domains',
    'sysctl': 'Kernel sysctl-read / sysctl-write variables',
    'syscall-mach': 'Mach trap calls (MSC_*)',
    'kernel-mig': 'Kernel MIG routine IDs',
    'network': 'Network socket & outbound/inbound rules',
    'notification': 'Darwin notification center postings',
    'process-info': 'Process info & codesigning inspection',
    'fcntl': 'File descriptor control commands (F_*)'
  };

  const TAG_META = {
    'apple-specific': {
      id: 'apple-specific',
      label: 'Apple-Specific Rules',
      shortLabel: 'apple-specific',
      color: '#7c3aed',
      badgeClass: 'tag-apple-specific',
      description: 'Rules gated on Apple code signing (apple-signed-executable?, process-attribute is-apple-signed-executable, signing-identifier "com.apple.WebKit...") or Apple-private entitlements (com.apple.private.*).'
    },
    '3p-specific': {
      id: '3p-specific',
      label: '3P-Specific Rules',
      shortLabel: '3p-specific',
      color: '#0d9488',
      badgeClass: 'tag-3p-specific',
      description: 'Rules gated on (require-not (process-attribute is-apple-signed-executable)), (log-streaming), or (require-not (logd-blocking)) for third-party browser engine binaries.'
    }
  };

  const TAG_ORDER = ['apple-specific', '3p-specific'];

  // Application State (Insights tab is the default landing view)
  const state = {
    view: 'insights',
    category: 'all',
    effect: 'all',
    trigger: 'all',
    profile: 'all',
    resource: 'all',
    tag: 'all',
    startDate: '',
    endDate: '',
    search: '',
    bucket: 'year',
    stackBy: 'category',
    scale: 'absolute',
    breakdownTab: 'profiles',
    sort: 'date-desc',
    pageSize: 100,
    page: 1,
    expandedHashes: new Set()
  };

  let allCommits = [];
  let filteredCommits = [];
  let commitsByPrefix = {};

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined && text !== null) {
      node.textContent = String(text);
    }
    return node;
  }

  function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        node.setAttribute(k, String(attrs[k]));
      });
    }
    return node;
  }

  function formatNumber(n) {
    return Number(n || 0).toLocaleString('en-US');
  }

  function formatPct(part, total) {
    if (!total) return '0.0%';
    return ((part / total) * 100).toFixed(1) + '%';
  }

  function safeGithubCommitUrl(hash, explicitUrl) {
    if (typeof explicitUrl === 'string' && /^https:\/\/github\.com\/WebKit\/WebKit\/commit\/[0-9a-f]{7,40}$/i.test(explicitUrl)) {
      return explicitUrl;
    }
    const cleanHash = String(hash || '').replace(/[^0-9a-f]/gi, '');
    return 'https://github.com/WebKit/WebKit/commit/' + cleanHash;
  }

  function safeGithubSourceUrl(repoPath) {
    const cleanPath = String(repoPath || '').replace(/[^a-zA-Z0-9_./+-]/g, '');
    return 'https://github.com/WebKit/WebKit/blob/main/' + cleanPath;
  }

  function findCommitByPrefix(prefix) {
    if (!prefix) return null;
    const clean = String(prefix).toLowerCase();
    if (commitsByPrefix[clean]) return commitsByPrefix[clean];
    for (let i = 0; i < allCommits.length; i++) {
      if (allCommits[i].hash.toLowerCase().indexOf(clean) === 0) {
        commitsByPrefix[clean] = allCommits[i];
        return allCommits[i];
      }
    }
    return null;
  }

  function resetStateToDefaults() {
    state.view = 'insights';
    state.category = 'all';
    state.effect = 'all';
    state.trigger = 'all';
    state.profile = 'all';
    state.resource = 'all';
    state.tag = 'all';
    state.startDate = '';
    state.endDate = '';
    state.search = '';
    state.bucket = 'year';
    state.stackBy = 'category';
    state.scale = 'absolute';
    state.breakdownTab = 'profiles';
    state.sort = 'date-desc';
    state.page = 1;
    state.expandedHashes = new Set();
  }

  function getStateSnapshot() {
    return {
      view: state.view,
      category: state.category,
      effect: state.effect,
      trigger: state.trigger,
      profile: state.profile,
      resource: state.resource,
      tag: state.tag,
      startDate: state.startDate,
      endDate: state.endDate,
      search: state.search,
      bucket: state.bucket,
      stackBy: state.stackBy,
      scale: state.scale,
      breakdownTab: state.breakdownTab,
      sort: state.sort,
      pageSize: state.pageSize,
      page: state.page,
      expandedHashes: Array.from(state.expandedHashes)
    };
  }

  function applyStateSnapshot(snap) {
    resetStateToDefaults();
    if (!snap || typeof snap !== 'object') return;
    state.view = snap.view === 'explorer' ? 'explorer' : 'insights';
    if (snap.category) state.category = snap.category;
    if (snap.effect) state.effect = snap.effect;
    if (snap.trigger) state.trigger = snap.trigger;
    if (snap.profile) state.profile = snap.profile;
    if (snap.resource) state.resource = snap.resource;
    if (snap.tag) state.tag = snap.tag;
    if (snap.startDate) state.startDate = snap.startDate;
    if (snap.endDate) state.endDate = snap.endDate;
    if (snap.search) state.search = snap.search;
    if (snap.bucket) state.bucket = snap.bucket;
    if (snap.stackBy) state.stackBy = snap.stackBy;
    if (snap.scale) state.scale = snap.scale;
    if (snap.breakdownTab) state.breakdownTab = snap.breakdownTab;
    if (snap.sort) state.sort = snap.sort;
    if (snap.pageSize) state.pageSize = Number(snap.pageSize) || 100;
    if (snap.page) state.page = Number(snap.page) || 1;
    if (Array.isArray(snap.expandedHashes)) {
      state.expandedHashes = new Set(snap.expandedHashes);
    }
  }

  function loadStateFromHash() {
    resetStateToDefaults();
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw || raw.indexOf('=') === -1) return;
    const params = new URLSearchParams(raw);
    const hasFilterParam =
      params.has('cat') ||
      params.has('effect') ||
      params.has('trigger') ||
      params.has('profile') ||
      params.has('res') ||
      params.has('tag') ||
      params.has('start') ||
      params.has('end') ||
      params.has('q') ||
      params.has('bucket') ||
      params.has('stack') ||
      params.has('bktab');
    if (params.get('view') === 'insights' || params.get('view') === 'explorer') {
      state.view = params.get('view');
    } else if (hasFilterParam) {
      state.view = 'explorer';
    }
    if (params.get('cat')) state.category = params.get('cat');
    if (params.get('effect')) state.effect = params.get('effect');
    if (params.get('trigger')) state.trigger = params.get('trigger');
    if (params.get('profile')) state.profile = params.get('profile');
    if (params.get('res')) state.resource = params.get('res');
    if (params.get('tag')) state.tag = params.get('tag');
    if (params.get('start')) state.startDate = params.get('start');
    if (params.get('end')) state.endDate = params.get('end');
    if (params.get('q')) state.search = params.get('q');
    if (params.get('bucket')) state.bucket = params.get('bucket');
    if (params.get('stack')) state.stackBy = params.get('stack');
    if (params.get('scale')) state.scale = params.get('scale');
    if (params.get('bktab')) state.breakdownTab = params.get('bktab');
    if (params.get('sort')) state.sort = params.get('sort');
  }

  function buildTargetHash() {
    if (state.view === 'insights') {
      return '';
    }
    const params = new URLSearchParams();
    params.set('view', state.view);
    if (state.category !== 'all') params.set('cat', state.category);
    if (state.effect !== 'all') params.set('effect', state.effect);
    if (state.trigger !== 'all') params.set('trigger', state.trigger);
    if (state.profile !== 'all') params.set('profile', state.profile);
    if (state.resource !== 'all') params.set('res', state.resource);
    if (state.tag !== 'all') params.set('tag', state.tag);
    if (state.startDate) params.set('start', state.startDate);
    if (state.endDate) params.set('end', state.endDate);
    if (state.search) params.set('q', state.search);
    if (state.bucket !== 'year') params.set('bucket', state.bucket);
    if (state.stackBy !== 'category') params.set('stack', state.stackBy);
    if (state.scale !== 'absolute') params.set('scale', state.scale);
    if (state.breakdownTab !== 'profiles') params.set('bktab', state.breakdownTab);
    if (state.sort !== 'date-desc') params.set('sort', state.sort);

    const str = params.toString();
    return str ? '#' + str : '';
  }

  function syncStateToHistory(push) {
    const targetHash = buildTargetHash();
    const targetUrl = window.location.pathname + window.location.search + targetHash;
    const snapshot = getStateSnapshot();
    try {
      if (push && window.location.hash !== targetHash) {
        window.history.pushState(snapshot, '', targetUrl);
      } else {
        window.history.replaceState(snapshot, '', targetUrl);
      }
    } catch (_e) {
      // Ignore if History API is restricted by host environment
    }
  }

  function populateFilterControls() {
    const catSelect = document.getElementById('filterCategory');
    const effSelect = document.getElementById('filterEffect');
    const trigSelect = document.getElementById('filterTrigger');
    const profSelect = document.getElementById('filterProfile');
    const resSelect = document.getElementById('filterResource');
    const tagSelect = document.getElementById('filterTag');

    catSelect.replaceChildren(new Option('All Categories (' + allCommits.length + ')', 'all'));
    CATEGORY_ORDER.forEach((cid) => {
      const count = allCommits.filter((c) => c.category === cid).length;
      const meta = CATEGORY_META[cid] || { label: cid };
      catSelect.appendChild(new Option(meta.label + ' (' + count + ')', cid));
    });

    effSelect.replaceChildren(new Option('All Sandbox Effects (' + allCommits.length + ')', 'all'));
    EFFECT_ORDER.forEach((eid) => {
      const count = allCommits.filter((c) => c.effect === eid).length;
      const meta = EFFECT_META[eid] || { label: eid };
      effSelect.appendChild(new Option(meta.label + ' (' + count + ')', eid));
    });

    if (trigSelect) {
      trigSelect.replaceChildren(new Option('All Triggers (' + allCommits.length + ')', 'all'));
      TRIGGER_ORDER.forEach((tid) => {
        const count = allCommits.filter((c) => c.trigger === tid).length;
        const meta = TRIGGER_META[tid] || { label: tid };
        trigSelect.appendChild(new Option(meta.shortLabel + ' (' + count + ')', tid));
      });
      const osOrOpaqueCount = allCommits.filter((c) => c.trigger === 'os-framework-3p' || c.trigger === 'opaque-runtime-fix').length;
      const sbOnlyCount = allCommits.filter((c) => c.sb_only !== false).length;
      trigSelect.appendChild(new Option('── Combined Scopes ──', 'all', false, false));
      trigSelect.options[trigSelect.options.length - 1].disabled = true;
      trigSelect.appendChild(new Option('Candidate OS / Runtime Expansions (' + osOrOpaqueCount + ')', 'os-or-opaque'));
      trigSelect.appendChild(new Option('All Sandbox-Only Commits (' + sbOnlyCount + ')', 'sb-only-all'));
    }

    profSelect.replaceChildren(new Option('All iOS Profiles', 'all'));
    PROFILE_ORDER.forEach((p) => {
      const count = allCommits.filter((c) => Array.isArray(c.profiles) && c.profiles.indexOf(p) !== -1).length;
      if (count > 0) {
        profSelect.appendChild(new Option(p + ' (' + count + ')', p));
      }
    });

    const resourceCounts = {};
    allCommits.forEach((c) => {
      (c.resources || []).forEach((r) => {
        resourceCounts[r] = (resourceCounts[r] || 0) + 1;
      });
    });
    const sortedResources = Object.keys(resourceCounts).sort((a, b) => resourceCounts[b] - resourceCounts[a]);
    resSelect.replaceChildren(new Option('All Resource Domains', 'all'));
    sortedResources.forEach((r) => {
      resSelect.appendChild(new Option(r + ' (' + resourceCounts[r] + ')', r));
    });

    if (tagSelect) {
      tagSelect.replaceChildren(new Option('All Commits (' + allCommits.length + ')', 'all'));
      TAG_ORDER.forEach((tid) => {
        const count = allCommits.filter((c) => Array.isArray(c.tags) && c.tags.indexOf(tid) !== -1).length;
        const meta = TAG_META[tid] || { label: tid };
        tagSelect.appendChild(new Option(tid + ' — ' + meta.label + ' (' + count + ')', tid));
      });
      const anyTaggedCount = allCommits.filter((c) => Array.isArray(c.tags) && c.tags.length > 0).length;
      const untaggedCount = allCommits.length - anyTaggedCount;
      tagSelect.appendChild(new Option('Any Binary Tag (' + anyTaggedCount + ')', 'any-tag'));
      tagSelect.appendChild(new Option('Uniform / Untagged (' + untaggedCount + ')', 'untagged'));
    }

    syncControlsFromState();
  }

  function syncControlsFromState() {
    document.getElementById('filterCategory').value = state.category;
    document.getElementById('filterEffect').value = state.effect;
    const trigEl = document.getElementById('filterTrigger');
    if (trigEl) trigEl.value = state.trigger;
    document.getElementById('filterProfile').value = state.profile;
    document.getElementById('filterResource').value = state.resource;
    const tagEl = document.getElementById('filterTag');
    if (tagEl) tagEl.value = state.tag;
    document.getElementById('filterStartDate').value = state.startDate;
    document.getElementById('filterEndDate').value = state.endDate;
    document.getElementById('filterSearch').value = state.search;
    document.getElementById('chartBucketSelect').value = state.bucket;
    document.getElementById('chartStackSelect').value = state.stackBy;
    document.getElementById('tableSortSelect').value = state.sort;
    document.getElementById('tablePageSizeSelect').value = String(state.pageSize);

    document.getElementById('scaleAbsoluteBtn').classList.toggle('active', state.scale === 'absolute');
    document.getElementById('scaleRelativeBtn').classList.toggle('active', state.scale === 'relative');

    const expPanel = document.getElementById('explorerViewPanel');
    const insPanel = document.getElementById('insightsViewPanel');
    const expBtn = document.getElementById('viewTabExplorer');
    const insBtn = document.getElementById('viewTabInsights');
    if (expPanel && insPanel && expBtn && insBtn) {
      const isInsights = state.view === 'insights';
      expPanel.classList.toggle('hidden', isInsights);
      insPanel.classList.toggle('hidden', !isInsights);
      expBtn.classList.toggle('active', !isInsights);
      expBtn.setAttribute('aria-selected', String(!isInsights));
      insBtn.classList.toggle('active', isInsights);
      insBtn.setAttribute('aria-selected', String(isInsights));
    }

    const breakdownTabs = [
      { id: 'tabProfilesBtn', key: 'profiles' },
      { id: 'tabResourcesBtn', key: 'resources' },
      { id: 'tabTriggersBtn', key: 'triggers' },
      { id: 'tabTagsBtn', key: 'tags' }
    ];
    breakdownTabs.forEach((t) => {
      const btn = document.getElementById(t.id);
      if (!btn) return;
      const isActive = t.key === state.breakdownTab;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });
  }

  function applyFilters() {
    const q = state.search.trim().toLowerCase();

    filteredCommits = allCommits.filter((c) => {
      if (state.category !== 'all' && c.category !== state.category) return false;
      if (state.effect !== 'all' && c.effect !== state.effect) return false;
      if (state.trigger !== 'all') {
        if (state.trigger === 'os-or-opaque') {
          if (c.trigger !== 'os-framework-3p' && c.trigger !== 'opaque-runtime-fix') return false;
        } else if (state.trigger === 'sb-only-all') {
          if (c.sb_only === false) return false;
        } else if (c.trigger !== state.trigger) {
          return false;
        }
      }
      if (state.profile !== 'all' && (!c.profiles || c.profiles.indexOf(state.profile) === -1)) return false;
      if (state.resource !== 'all' && (!c.resources || c.resources.indexOf(state.resource) === -1)) return false;
      if (state.tag !== 'all') {
        const cTags = c.tags || [];
        if (state.tag === 'any-tag') {
          if (cTags.length === 0) return false;
        } else if (state.tag === 'untagged') {
          if (cTags.length > 0) return false;
        } else if (cTags.indexOf(state.tag) === -1) {
          return false;
        }
      }
      if (state.startDate && c.date < state.startDate) return false;
      if (state.endDate && c.date > state.endDate) return false;

      if (q) {
        const hay = [
          c.hash,
          c.summary,
          c.subject,
          c.description,
          c.author,
          c.trigger || '',
          (c.profiles || []).join(' '),
          (c.resources || []).join(' '),
          (c.tags || []).join(' '),
          (c.rules || []).join(' '),
          (c.files || []).join(' '),
          (c.bugs || []).join(' ')
        ].join(' ').toLowerCase();
        const qNorm = q.charAt(0) === '!' ? q.slice(1) : q;
        if (hay.indexOf(q) === -1 && (!qNorm || hay.indexOf(qNorm) === -1)) return false;
      }
      return true;
    });

    sortCommits(filteredCommits);
    const badge = document.getElementById('explorerTabCountBadge');
    if (badge) {
      badge.textContent = formatNumber(filteredCommits.length);
    }
  }

  function sortCommits(list) {
    const mode = state.sort;
    list.sort((a, b) => {
      if (mode === 'date-asc') {
        return a.date.localeCompare(b.date) || a.timestamp.localeCompare(b.timestamp);
      }
      if (mode === 'category-asc') {
        const ca = CATEGORY_ORDER.indexOf(a.category);
        const cb = CATEGORY_ORDER.indexOf(b.category);
        if (ca !== cb) return ca - cb;
        return b.date.localeCompare(a.date);
      }
      if (mode === 'effect-asc') {
        const ea = EFFECT_ORDER.indexOf(a.effect);
        const eb = EFFECT_ORDER.indexOf(b.effect);
        if (ea !== eb) return ea - eb;
        return b.date.localeCompare(a.date);
      }
      if (mode === 'rules-desc') {
        const ra = (a.allow_added || 0) + (a.allow_removed || 0) + (a.deny_added || 0) + (a.deny_removed || 0);
        const rb = (b.allow_added || 0) + (b.allow_removed || 0) + (b.deny_added || 0) + (b.deny_removed || 0);
        if (rb !== ra) return rb - ra;
        return b.date.localeCompare(a.date);
      }
      // Default: date-desc
      return b.date.localeCompare(a.date) || b.timestamp.localeCompare(a.timestamp);
    });
  }

  function renderKpiCards() {
    const container = document.getElementById('kpiGrid');
    container.replaceChildren();

    const total = filteredCommits.length;
    const grandTotal = allCommits.length;

    const secCount = filteredCommits.filter((c) => c.category === 'security-hardening').length;
    const featCount = filteredCommits.filter((c) => c.category === 'feature-expansion').length;
    const bugCount = filteredCommits.filter((c) => c.category === 'bugfix-compatibility').length;
    const blockCount = filteredCommits.filter((c) => c.effect === 'block-more').length;
    const allowCount = filteredCommits.filter((c) => c.effect === 'allow-more').length;
    const webContentCount = filteredCommits.filter((c) => (c.profiles || []).indexOf('WebContent') !== -1).length;

    const minDate = total ? filteredCommits.reduce((m, c) => (c.date < m ? c.date : m), filteredCommits[0].date) : '—';
    const maxDate = total ? filteredCommits.reduce((m, c) => (c.date > m ? c.date : m), filteredCommits[0].date) : '—';

    const cards = [
      {
        title: 'Matching Commits',
        value: formatNumber(total),
        share: total === grandTotal ? '100% of dataset' : formatPct(total, grandTotal) + ' of ' + grandTotal,
        sub: minDate + ' \u2192 ' + maxDate,
        color: '#0f172a',
        active: false,
        onClick: null
      },
      {
        title: 'Security Hardening',
        value: formatNumber(secCount),
        share: formatPct(secCount, total),
        sub: 'Tightening rules & Lockdown Mode',
        color: CATEGORY_META['security-hardening'].color,
        active: state.category === 'security-hardening',
        onClick: () => toggleFilter('category', 'security-hardening')
      },
      {
        title: 'Feature Enablement',
        value: formatNumber(featCount),
        share: formatPct(featCount, total),
        sub: 'New features & helper processes',
        color: CATEGORY_META['feature-expansion'].color,
        active: state.category === 'feature-expansion',
        onClick: () => toggleFilter('category', 'feature-expansion')
      },
      {
        title: 'Bug Fix & Compat',
        value: formatNumber(bugCount),
        share: formatPct(bugCount, total),
        sub: 'Fixing sandbox violations & crashes',
        color: CATEGORY_META['bugfix-compatibility'].color,
        active: state.category === 'bugfix-compatibility',
        onClick: () => toggleFilter('category', 'bugfix-compatibility')
      },
      {
        title: 'Block More (Tighten)',
        value: formatNumber(blockCount),
        share: formatPct(blockCount, total),
        sub: 'vs. ' + formatNumber(allowCount) + ' Allow More (' + formatPct(allowCount, total) + ')',
        color: EFFECT_META['block-more'].color,
        active: state.effect === 'block-more',
        onClick: () => toggleFilter('effect', 'block-more')
      },
      {
        title: 'WebContent Profile',
        value: formatNumber(webContentCount),
        share: formatPct(webContentCount, total),
        sub: 'Renderer process Seatbelt changes',
        color: '#4f46e5',
        active: state.profile === 'WebContent',
        onClick: () => toggleFilter('profile', 'WebContent')
      }
    ];

    cards.forEach((item) => {
      const card = el('div', 'kpi-card' + (item.onClick ? ' clickable' : '') + (item.active ? ' active-filter' : ''));
      const labelRow = el('div', 'kpi-label');
      labelRow.appendChild(el('span', null, item.title));
      const dot = el('span', 'kpi-dot');
      dot.style.backgroundColor = item.color;
      labelRow.appendChild(dot);

      const valRow = el('div', 'kpi-value-row');
      valRow.appendChild(el('span', 'kpi-value', item.value));
      valRow.appendChild(el('span', 'kpi-share', item.share));

      const subRow = el('div', 'kpi-sub', item.sub);

      card.appendChild(labelRow);
      card.appendChild(valRow);
      card.appendChild(subRow);

      if (item.onClick) {
        card.addEventListener('click', item.onClick);
      }
      container.appendChild(card);
    });
  }

  function renderQuickCategoryPills() {
    const bar = document.getElementById('categoryPillBar');
    bar.replaceChildren();

    const allBtn = el('button', 'filter-pill' + (state.category === 'all' ? ' active' : ''));
    allBtn.type = 'button';
    allBtn.appendChild(el('span', null, 'All Categories'));
    allBtn.appendChild(el('span', 'pill-count', '(' + allCommits.length + ')'));
    allBtn.addEventListener('click', () => {
      state.category = 'all';
      state.page = 1;
      refreshAll({ pushHistory: true });
    });
    bar.appendChild(allBtn);

    CATEGORY_ORDER.forEach((cid) => {
      const meta = CATEGORY_META[cid];
      const count = allCommits.filter((c) => c.category === cid).length;
      const pill = el('button', 'filter-pill' + (state.category === cid ? ' active' : ''));
      pill.type = 'button';

      const swatch = el('span', 'pill-swatch');
      swatch.style.backgroundColor = meta.color;
      pill.appendChild(swatch);
      pill.appendChild(el('span', null, meta.shortLabel));
      pill.appendChild(el('span', 'pill-count', '(' + count + ')'));

      pill.addEventListener('click', () => toggleFilter('category', cid));
      bar.appendChild(pill);
    });
  }

  function getStackConfig() {
    if (state.stackBy === 'effect') {
      return {
        keys: EFFECT_ORDER,
        getLabel: (k) => (EFFECT_META[k] ? EFFECT_META[k].label : k),
        getColor: (k) => (EFFECT_META[k] ? EFFECT_META[k].color : '#64748b'),
        getKey: (c) => c.effect || 'no-impact',
        filterField: 'effect'
      };
    }
    if (state.stackBy === 'trigger') {
      return {
        keys: TRIGGER_ORDER,
        getLabel: (k) => (TRIGGER_META[k] ? TRIGGER_META[k].shortLabel : k),
        getColor: (k) => (TRIGGER_META[k] ? TRIGGER_META[k].color : '#64748b'),
        getKey: (c) => c.trigger || 'opaque-runtime-fix',
        filterField: 'trigger'
      };
    }
    if (state.stackBy === 'profile') {
      return {
        keys: PROFILE_ORDER,
        getLabel: (k) => k,
        getColor: (k) => PROFILE_COLORS[k] || '#64748b',
        getKey: (c) => (c.profiles && c.profiles.length ? c.profiles[0] : 'Shared'),
        filterField: 'profile'
      };
    }
    return {
      keys: CATEGORY_ORDER,
      getLabel: (k) => (CATEGORY_META[k] ? CATEGORY_META[k].label : k),
      getColor: (k) => (CATEGORY_META[k] ? CATEGORY_META[k].color : '#64748b'),
      getKey: (c) => c.category || 'refactor-cleanup',
      filterField: 'category'
    };
  }

  function getBucketKeyAndOrder(commits) {
    const mode = state.bucket;
    if (mode === 'category') {
      return {
        buckets: CATEGORY_ORDER.map((k) => ({
          id: k,
          label: CATEGORY_META[k] ? CATEGORY_META[k].shortLabel : k,
          filterField: 'category'
        })),
        getCommitBuckets: (c) => [c.category]
      };
    }
    if (mode === 'effect') {
      return {
        buckets: EFFECT_ORDER.map((k) => ({
          id: k,
          label: EFFECT_META[k] ? EFFECT_META[k].shortLabel : k,
          filterField: 'effect'
        })),
        getCommitBuckets: (c) => [c.effect]
      };
    }
    if (mode === 'trigger') {
      return {
        buckets: TRIGGER_ORDER.map((k) => ({
          id: k,
          label: TRIGGER_META[k] ? TRIGGER_META[k].shortLabel : k,
          filterField: 'trigger'
        })),
        getCommitBuckets: (c) => [c.trigger || 'opaque-runtime-fix']
      };
    }
    if (mode === 'profile') {
      return {
        buckets: PROFILE_ORDER.map((k) => ({
          id: k,
          label: k,
          filterField: 'profile'
        })),
        getCommitBuckets: (c) => (c.profiles && c.profiles.length ? c.profiles : ['Shared'])
      };
    }
    if (mode === 'resource') {
      const rCounts = {};
      commits.forEach((c) => {
        (c.resources || []).forEach((r) => {
          rCounts[r] = (rCounts[r] || 0) + 1;
        });
      });
      const rKeys = Object.keys(rCounts).sort((a, b) => rCounts[b] - rCounts[a]);
      return {
        buckets: rKeys.map((k) => ({
          id: k,
          label: k,
          filterField: 'resource'
        })),
        getCommitBuckets: (c) => c.resources || []
      };
    }

    // Time-series bucketing (year / quarter / month)
    const bucketSet = new Set();
    commits.forEach((c) => {
      if (!c.date) return;
      const y = c.date.slice(0, 4);
      const m = parseInt(c.date.slice(5, 7), 10);
      if (mode === 'quarter') {
        const q = Math.floor((m - 1) / 3) + 1;
        bucketSet.add(y + '-Q' + q);
      } else if (mode === 'month') {
        bucketSet.add(c.date.slice(0, 7));
      } else {
        bucketSet.add(y);
      }
    });

    // Ensure continuous years when mode === 'year' and no narrow date filter
    if (mode === 'year' && commits.length > 0 && !state.startDate && !state.endDate) {
      for (let yr = 2014; yr <= 2026; yr++) {
        bucketSet.add(String(yr));
      }
    }

    const sortedIds = Array.from(bucketSet).sort();
    return {
      buckets: sortedIds.map((id) => ({
        id: id,
        label: id,
        filterField: 'time'
      })),
      getCommitBuckets: (c) => {
        if (!c.date) return [];
        const y = c.date.slice(0, 4);
        const m = parseInt(c.date.slice(5, 7), 10);
        if (mode === 'quarter') {
          const q = Math.floor((m - 1) / 3) + 1;
          return [y + '-Q' + q];
        }
        if (mode === 'month') {
          return [c.date.slice(0, 7)];
        }
        return [y];
      }
    };
  }

  function renderMainChart() {
    const svg = document.getElementById('mainChartSvg');
    const legend = document.getElementById('chartLegend');
    const tooltip = document.getElementById('chartTooltip');
    svg.replaceChildren();
    legend.replaceChildren();

    const stackCfg = getStackConfig();
    const bucketCfg = getBucketKeyAndOrder(filteredCommits);
    const buckets = bucketCfg.buckets;

    const bucketTitleMap = {
      year: 'Yearly',
      quarter: 'Quarterly',
      month: 'Monthly',
      category: 'Purpose Category',
      effect: 'Sandbox Effect',
      trigger: 'Trigger Attribution',
      profile: 'Process Profile',
      resource: 'Seatbelt Resource'
    };
    const stackTitleMap = {
      category: 'Purpose Category',
      effect: 'Sandbox Effect',
      trigger: 'Trigger Attribution',
      profile: 'Primary Process Profile'
    };
    document.getElementById('mainChartTitle').textContent =
      'Sandbox Changes (' + (bucketTitleMap[state.bucket] || state.bucket) + ') Stacked by ' + (stackTitleMap[state.stackBy] || state.stackBy);

    // Render Legend
    const stackTotals = {};
    stackCfg.keys.forEach((k) => {
      stackTotals[k] = 0;
    });

    const dataByBucket = {};
    buckets.forEach((b) => {
      const counts = {};
      stackCfg.keys.forEach((k) => {
        counts[k] = 0;
      });
      dataByBucket[b.id] = { bucket: b, counts: counts, total: 0 };
    });

    filteredCommits.forEach((c) => {
      const sk = stackCfg.getKey(c);
      const bIds = bucketCfg.getCommitBuckets(c);
      bIds.forEach((bid) => {
        if (dataByBucket[bid]) {
          dataByBucket[bid].counts[sk] = (dataByBucket[bid].counts[sk] || 0) + 1;
          dataByBucket[bid].total += 1;
          stackTotals[sk] = (stackTotals[sk] || 0) + 1;
        }
      });
    });

    stackCfg.keys.forEach((sk) => {
      const count = stackTotals[sk] || 0;
      const item = el('div', 'legend-item' + (count === 0 ? ' dimmed' : ''));
      const swatch = el('span', 'legend-swatch');
      swatch.style.backgroundColor = stackCfg.getColor(sk);
      item.appendChild(swatch);
      item.appendChild(el('span', null, stackCfg.getLabel(sk)));
      item.appendChild(el('span', 'legend-count', '(' + count + ')'));
      item.addEventListener('click', () => {
        toggleFilter(stackCfg.filterField, sk);
      });
      legend.appendChild(item);
    });

    if (buckets.length === 0 || filteredCommits.length === 0) {
      svg.setAttribute('viewBox', '0 0 900 260');
      const emptyText = svgEl('text', {
        x: 450,
        y: 130,
        'text-anchor': 'middle',
        fill: '#64748b',
        'font-size': 14
      });
      emptyText.textContent = 'No commits match the active filters.';
      svg.appendChild(emptyText);
      return;
    }

    const rawWidth =
      document.getElementById('mainChartContainer').clientWidth ||
      Math.max(300, (document.documentElement.clientWidth || 1100) - 48);
    const containerWidth = Math.max(300, rawWidth);
    const isMobile = containerWidth < 600;
    const height = isMobile ? 270 : 320;
    const margin = isMobile
      ? { top: 20, right: 12, bottom: 52, left: 38 }
      : { top: 24, right: 24, bottom: 54, left: 52 };
    const plotW = containerWidth - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;

    svg.setAttribute('viewBox', '0 0 ' + containerWidth + ' ' + height);

    const isRelative = state.scale === 'relative';
    const maxBucketTotal = Math.max(1, ...buckets.map((b) => dataByBucket[b.id].total));
    const yMax = isRelative ? 100 : niceAxisMax(maxBucketTotal);

    // Y-axis gridlines & labels
    const yTicks = isRelative ? [0, 25, 50, 75, 100] : buildNiceTicks(yMax, 5);
    yTicks.forEach((tickVal) => {
      const y = margin.top + plotH - (tickVal / yMax) * plotH;
      svg.appendChild(
        svgEl('line', {
          x1: margin.left,
          y1: y,
          x2: margin.left + plotW,
          y2: y,
          stroke: tickVal === 0 ? '#94a3b8' : '#e2e8f0',
          'stroke-dasharray': tickVal === 0 ? 'none' : '3,3'
        })
      );
      const lbl = svgEl('text', {
        x: margin.left - 6,
        y: y + 4,
        'text-anchor': 'end',
        fill: '#64748b',
        'font-size': isMobile ? 10 : 11,
        'font-family': 'JetBrains Mono, monospace'
      });
      lbl.textContent = isRelative ? tickVal + '%' : String(tickVal);
      svg.appendChild(lbl);
    });

    const stepW = plotW / buckets.length;
    const barW = Math.max(3, Math.min(54, stepW * 0.68));
    const maxLabels = isMobile ? 8 : 18;
    const labelStride =
      buckets.length > maxLabels * 2
        ? Math.ceil(buckets.length / maxLabels)
        : buckets.length > (isMobile ? 10 : 20)
        ? 2
        : 1;

    buckets.forEach((b, idx) => {
      const entry = dataByBucket[b.id];
      const xCenter = margin.left + idx * stepW + stepW / 2;
      const xLeft = xCenter - barW / 2;

      let yCursor = margin.top + plotH;

      stackCfg.keys.forEach((sk) => {
        const val = entry.counts[sk] || 0;
        if (val <= 0) return;
        const scaledVal = isRelative ? (entry.total ? (val / entry.total) * 100 : 0) : val;
        const barH = Math.max(1.5, (scaledVal / yMax) * plotH);
        const yTop = yCursor - barH;

        const rect = svgEl('rect', {
          x: xLeft,
          y: yTop,
          width: barW,
          height: barH,
          fill: stackCfg.getColor(sk),
          rx: 1.5,
          class: 'chart-bar-rect'
        });

        rect.addEventListener('mouseenter', (ev) => {
          showChartTooltip(ev, entry, stackCfg, sk);
        });
        rect.addEventListener('mousemove', (ev) => {
          moveChartTooltip(ev, tooltip);
        });
        rect.addEventListener('mouseleave', () => {
          tooltip.classList.add('hidden');
        });
        rect.addEventListener('click', () => {
          handleBarClick(b, stackCfg.filterField, sk);
        });

        svg.appendChild(rect);
        yCursor = yTop;
      });

      // Total label above bar (when bars aren't too dense)
      if (!isRelative && entry.total > 0 && buckets.length <= (isMobile ? 14 : 28)) {
        const topLabel = svgEl('text', {
          x: xCenter,
          y: Math.max(12, yCursor - 5),
          'text-anchor': 'middle',
          fill: '#475569',
          'font-size': isMobile ? 9.5 : 10.5,
          'font-weight': '600',
          'font-family': 'JetBrains Mono, monospace'
        });
        topLabel.textContent = String(entry.total);
        svg.appendChild(topLabel);
      }

      // X-axis label
      if (idx % labelStride === 0) {
        const rotate = buckets.length > (isMobile ? 6 : 14);
        const xLbl = svgEl('text', {
          x: xCenter,
          y: margin.top + plotH + (rotate ? 14 : 18),
          'text-anchor': rotate ? 'end' : 'middle',
          fill: '#475569',
          'font-size': isMobile ? 10 : 11,
          'font-family': state.bucket === 'year' || state.bucket === 'quarter' || state.bucket === 'month'
            ? 'JetBrains Mono, monospace'
            : 'Inter, sans-serif',
          transform: rotate ? 'rotate(-35 ' + xCenter + ' ' + (margin.top + plotH + 14) + ')' : ''
        });
        const rawLbl = String(b.label || '');
        xLbl.textContent = isMobile && rawLbl.length > 18 ? rawLbl.slice(0, 16) + '\u2026' : rawLbl;
        svg.appendChild(xLbl);
      }
    });
  }

  function niceAxisMax(val) {
    if (val <= 10) return 10;
    const mag = Math.pow(10, Math.floor(Math.log10(val)));
    const norm = val / mag;
    if (norm <= 1.2) return 1.2 * mag;
    if (norm <= 1.5) return 1.5 * mag;
    if (norm <= 2) return 2 * mag;
    if (norm <= 2.5) return 2.5 * mag;
    if (norm <= 5) return 5 * mag;
    return 10 * mag;
  }

  function buildNiceTicks(maxVal, count) {
    const step = Math.ceil(maxVal / count);
    const ticks = [];
    for (let v = 0; v <= maxVal; v += step) {
      ticks.push(v);
    }
    return ticks;
  }

  function showChartTooltip(ev, entry, stackCfg, hoveredKey) {
    const tooltip = document.getElementById('chartTooltip');
    tooltip.replaceChildren();

    const title = el('div', 'tooltip-title');
    title.appendChild(el('span', null, entry.bucket.label));
    title.appendChild(el('span', null, formatNumber(entry.total) + ' commits'));
    tooltip.appendChild(title);

    stackCfg.keys.forEach((sk) => {
      const val = entry.counts[sk] || 0;
      if (val <= 0) return;
      const row = el('div', 'tooltip-row');
      if (sk === hoveredKey) {
        row.style.fontWeight = '700';
      }
      const lbl = el('div', 'tooltip-label');
      const sw = el('span', 'legend-swatch');
      sw.style.backgroundColor = stackCfg.getColor(sk);
      lbl.appendChild(sw);
      lbl.appendChild(el('span', null, stackCfg.getLabel(sk)));

      const valText = el('span', 'tooltip-val', val + ' (' + formatPct(val, entry.total) + ')');
      row.appendChild(lbl);
      row.appendChild(valText);
      tooltip.appendChild(row);
    });

    tooltip.classList.remove('hidden');
    moveChartTooltip(ev, tooltip);
  }

  function moveChartTooltip(ev, tooltip) {
    const wrapper = document.getElementById('mainChartContainer');
    const rect = wrapper.getBoundingClientRect();
    const ttWidth = tooltip.offsetWidth || 230;
    let left = ev.clientX - rect.left + 14;
    let top = ev.clientY - rect.top - 16;
    if (left + ttWidth > rect.width - 8) {
      left = ev.clientX - rect.left - ttWidth - 10;
    }
    left = Math.max(8, Math.min(left, Math.max(8, rect.width - ttWidth - 8)));
    if (top < 6) top = 6;
    tooltip.style.left = left + 'px';
    tooltip.style.top = top + 'px';
  }

  function handleBarClick(bucket, stackField, stackKey) {
    if (bucket.filterField === 'time') {
      if (state.bucket === 'year') {
        const y = bucket.id;
        const start = y + '-01-01';
        const end = y + '-12-31';
        if (state.startDate === start && state.endDate === end) {
          state.startDate = '';
          state.endDate = '';
        } else {
          state.startDate = start;
          state.endDate = end;
        }
      } else {
        toggleFilter(stackField, stackKey);
        return;
      }
    } else if (bucket.filterField) {
      toggleFilter(bucket.filterField, bucket.id);
      return;
    }
    state.page = 1;
    refreshAll({ pushHistory: true });
  }

  function renderBreakdowns() {
    const total = filteredCommits.length;

    // 1. Category Breakdown
    const catList = document.getElementById('categoryBreakdownList');
    catList.replaceChildren();
    CATEGORY_ORDER.forEach((cid) => {
      const meta = CATEGORY_META[cid];
      const count = filteredCommits.filter((c) => c.category === cid).length;
      const pct = total ? (count / total) * 100 : 0;
      const row = el('div', 'breakdown-row' + (state.category === cid ? ' active' : ''));

      const top = el('div', 'breakdown-row-top');
      const name = el('div', 'breakdown-name');
      const sw = el('span', 'legend-swatch');
      sw.style.backgroundColor = meta.color;
      name.appendChild(sw);
      name.appendChild(el('span', null, meta.label));

      const stats = el('div', 'breakdown-stats', formatNumber(count) + ' (' + pct.toFixed(1) + '%)');
      top.appendChild(name);
      top.appendChild(stats);

      const track = el('div', 'breakdown-bar-track');
      const fill = el('div', 'breakdown-bar-fill');
      fill.style.width = Math.max(pct, count > 0 ? 1.5 : 0) + '%';
      fill.style.backgroundColor = meta.color;
      track.appendChild(fill);

      const desc = el('div', 'breakdown-desc', meta.description);

      row.appendChild(top);
      row.appendChild(track);
      row.appendChild(desc);
      row.addEventListener('click', () => toggleFilter('category', cid));
      catList.appendChild(row);
    });

    // 2. Sandbox Effect Breakdown
    const effList = document.getElementById('effectBreakdownList');
    effList.replaceChildren();
    EFFECT_ORDER.forEach((eid) => {
      const meta = EFFECT_META[eid];
      const count = filteredCommits.filter((c) => c.effect === eid).length;
      const pct = total ? (count / total) * 100 : 0;
      const row = el('div', 'breakdown-row' + (state.effect === eid ? ' active' : ''));

      const top = el('div', 'breakdown-row-top');
      const name = el('div', 'breakdown-name');
      const sw = el('span', 'legend-swatch');
      sw.style.backgroundColor = meta.color;
      name.appendChild(sw);
      name.appendChild(el('span', null, meta.symbol + ' ' + meta.label));

      const stats = el('div', 'breakdown-stats', formatNumber(count) + ' (' + pct.toFixed(1) + '%)');
      top.appendChild(name);
      top.appendChild(stats);

      const track = el('div', 'breakdown-bar-track');
      const fill = el('div', 'breakdown-bar-fill');
      fill.style.width = Math.max(pct, count > 0 ? 1.5 : 0) + '%';
      fill.style.backgroundColor = meta.color;
      track.appendChild(fill);

      const desc = el('div', 'breakdown-desc', meta.description);

      row.appendChild(top);
      row.appendChild(track);
      row.appendChild(desc);
      row.addEventListener('click', () => toggleFilter('effect', eid));
      effList.appendChild(row);
    });

    // 3. Process Profiles, Seatbelt Resources, OR Trigger Attribution Breakdown
    const prList = document.getElementById('profileResourceBreakdownList');
    prList.replaceChildren();

    if (state.breakdownTab === 'profiles') {
      PROFILE_ORDER.forEach((prof) => {
        const count = filteredCommits.filter((c) => (c.profiles || []).indexOf(prof) !== -1).length;
        if (count === 0 && state.profile !== prof) return;
        const pct = total ? (count / total) * 100 : 0;
        const color = PROFILE_COLORS[prof] || '#2563eb';
        const row = el('div', 'breakdown-row' + (state.profile === prof ? ' active' : ''));

        const top = el('div', 'breakdown-row-top');
        const name = el('div', 'breakdown-name');
        const sw = el('span', 'legend-swatch');
        sw.style.backgroundColor = color;
        name.appendChild(sw);
        name.appendChild(el('span', null, prof));

        const stats = el('div', 'breakdown-stats', formatNumber(count) + ' (' + pct.toFixed(1) + '%)');
        top.appendChild(name);
        top.appendChild(stats);

        const track = el('div', 'breakdown-bar-track');
        const fill = el('div', 'breakdown-bar-fill');
        fill.style.width = Math.max(pct, count > 0 ? 1.5 : 0) + '%';
        fill.style.backgroundColor = color;
        track.appendChild(fill);

        row.appendChild(top);
        row.appendChild(track);
        row.addEventListener('click', () => toggleFilter('profile', prof));
        prList.appendChild(row);
      });
    } else if (state.breakdownTab === 'triggers') {
      TRIGGER_ORDER.forEach((tid) => {
        const meta = TRIGGER_META[tid];
        const count = filteredCommits.filter((c) => c.trigger === tid).length;
        const pct = total ? (count / total) * 100 : 0;
        const row = el('div', 'breakdown-row' + (state.trigger === tid ? ' active' : ''));

        const top = el('div', 'breakdown-row-top');
        const name = el('div', 'breakdown-name');
        const sw = el('span', 'legend-swatch');
        sw.style.backgroundColor = meta.color;
        name.appendChild(sw);
        name.appendChild(el('span', null, meta.label));

        const stats = el('div', 'breakdown-stats', formatNumber(count) + ' (' + pct.toFixed(1) + '%)');
        top.appendChild(name);
        top.appendChild(stats);

        const track = el('div', 'breakdown-bar-track');
        const fill = el('div', 'breakdown-bar-fill');
        fill.style.width = Math.max(pct, count > 0 ? 1.5 : 0) + '%';
        fill.style.backgroundColor = meta.color;
        track.appendChild(fill);

        const desc = el('div', 'breakdown-desc', meta.description);

        row.appendChild(top);
        row.appendChild(track);
        row.appendChild(desc);
        row.addEventListener('click', () => toggleFilter('trigger', tid));
        prList.appendChild(row);
      });
    } else if (state.breakdownTab === 'tags') {
      TAG_ORDER.forEach((tid) => {
        const meta = TAG_META[tid];
        const count = filteredCommits.filter((c) => (c.tags || []).indexOf(tid) !== -1).length;
        const pct = total ? (count / total) * 100 : 0;
        const row = el('div', 'breakdown-row' + (state.tag === tid ? ' active' : ''));

        const top = el('div', 'breakdown-row-top');
        const name = el('div', 'breakdown-name');
        const sw = el('span', 'legend-swatch');
        sw.style.backgroundColor = meta.color;
        name.appendChild(sw);
        name.appendChild(el('span', null, tid + ' (' + meta.label + ')'));

        const stats = el('div', 'breakdown-stats', formatNumber(count) + ' (' + pct.toFixed(1) + '%)');
        top.appendChild(name);
        top.appendChild(stats);

        const track = el('div', 'breakdown-bar-track');
        const fill = el('div', 'breakdown-bar-fill');
        fill.style.width = Math.max(pct, count > 0 ? 1.5 : 0) + '%';
        fill.style.backgroundColor = meta.color;
        track.appendChild(fill);

        row.appendChild(top);
        row.appendChild(track);
        row.appendChild(el('div', 'breakdown-desc', meta.description));
        row.addEventListener('click', () => toggleFilter('tag', tid));
        prList.appendChild(row);
      });

      const untaggedCount = filteredCommits.filter((c) => !c.tags || c.tags.length === 0).length;
      const untaggedPct = total ? (untaggedCount / total) * 100 : 0;
      const uRow = el('div', 'breakdown-row' + (state.tag === 'untagged' ? ' active' : ''));
      const uTop = el('div', 'breakdown-row-top');
      const uName = el('div', 'breakdown-name');
      const uSw = el('span', 'legend-swatch');
      uSw.style.backgroundColor = '#64748b';
      uName.appendChild(uSw);
      uName.appendChild(el('span', null, 'Uniform (Neither Tag)'));
      const uStats = el('div', 'breakdown-stats', formatNumber(untaggedCount) + ' (' + untaggedPct.toFixed(1) + '%)');
      uTop.appendChild(uName);
      uTop.appendChild(uStats);
      const uTrack = el('div', 'breakdown-bar-track');
      const uFill = el('div', 'breakdown-bar-fill');
      uFill.style.width = Math.max(untaggedPct, untaggedCount > 0 ? 1.5 : 0) + '%';
      uFill.style.backgroundColor = '#64748b';
      uTrack.appendChild(uFill);
      uRow.appendChild(uTop);
      uRow.appendChild(uTrack);
      uRow.appendChild(el('div', 'breakdown-desc', 'Rules apply uniformly to both Apple-signed and 3rd-party browser engine binaries.'));
      uRow.addEventListener('click', () => toggleFilter('tag', 'untagged'));
      prList.appendChild(uRow);
    } else {
      const resCounts = {};
      filteredCommits.forEach((c) => {
        (c.resources || []).forEach((r) => {
          resCounts[r] = (resCounts[r] || 0) + 1;
        });
      });
      const resKeys = Object.keys(resCounts).sort((a, b) => resCounts[b] - resCounts[a]);
      resKeys.forEach((res) => {
        const count = resCounts[res] || 0;
        const pct = total ? (count / total) * 100 : 0;
        const row = el('div', 'breakdown-row' + (state.resource === res ? ' active' : ''));

        const top = el('div', 'breakdown-row-top');
        const name = el('div', 'breakdown-name');
        const sw = el('span', 'legend-swatch');
        sw.style.backgroundColor = '#0891b2';
        name.appendChild(sw);
        name.appendChild(el('span', null, res));

        const stats = el('div', 'breakdown-stats', formatNumber(count) + ' (' + pct.toFixed(1) + '%)');
        top.appendChild(name);
        top.appendChild(stats);

        const track = el('div', 'breakdown-bar-track');
        const fill = el('div', 'breakdown-bar-fill');
        fill.style.width = Math.max(pct, count > 0 ? 1.5 : 0) + '%';
        fill.style.backgroundColor = '#0891b2';
        track.appendChild(fill);

        if (RESOURCE_DESCRIPTIONS[res]) {
          row.appendChild(top);
          row.appendChild(track);
          row.appendChild(el('div', 'breakdown-desc', RESOURCE_DESCRIPTIONS[res]));
        } else {
          row.appendChild(top);
          row.appendChild(track);
        }
        row.addEventListener('click', () => toggleFilter('resource', res));
        prList.appendChild(row);
      });
    }
  }

  function renderTable() {
    const tbody = document.getElementById('changesTableBody');
    tbody.replaceChildren();

    const total = filteredCommits.length;
    const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    const startIdx = (state.page - 1) * state.pageSize;
    const endIdx = Math.min(total, startIdx + state.pageSize);
    const pageItems = filteredCommits.slice(startIdx, endIdx);

    const summaryText = total === 0
      ? 'No matching commits found'
      : 'Showing ' + (startIdx + 1) + '\u2013' + endIdx + ' of ' + formatNumber(total) + ' matching commits (click any row to inspect commit description & files, or click the hash to open GitHub diff)';
    document.getElementById('tableSummaryText').textContent = summaryText;
    document.getElementById('tableFooterInfo').textContent = summaryText;

    const pageStr = 'Page ' + state.page + ' of ' + totalPages;
    document.getElementById('pageIndicator').textContent = pageStr;
    document.getElementById('pageIndicatorBottom').textContent = pageStr;

    const disablePrev = state.page <= 1;
    const disableNext = state.page >= totalPages;
    document.getElementById('prevPageBtn').disabled = disablePrev;
    document.getElementById('prevPageBottomBtn').disabled = disablePrev;
    document.getElementById('nextPageBtn').disabled = disableNext;
    document.getElementById('nextPageBottomBtn').disabled = disableNext;

    if (pageItems.length === 0) {
      const tr = el('tr');
      const td = el('td', null, 'No sandbox commits match the current filter criteria.');
      td.colSpan = 7;
      td.style.textAlign = 'center';
      td.style.padding = '28px';
      td.style.color = '#64748b';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    pageItems.forEach((c) => {
      const isExpanded = state.expandedHashes.has(c.hash);
      const tr = el('tr', 'commit-row' + (isExpanded ? ' expanded' : ''));
      tr.setAttribute('data-commit-hash', c.hash);

      // 1. Date
      tr.appendChild(el('td', 'col-date', c.date));

      // 2. GitHub Commit Link
      const tdCommit = el('td', 'col-commit');
      const ghLink = el('a', 'github-commit-link');
      ghLink.href = safeGithubCommitUrl(c.hash, c.github_url);
      ghLink.target = '_blank';
      ghLink.rel = 'noopener noreferrer';
      ghLink.title = 'Open commit ' + c.hash + ' and diff on GitHub';
      ghLink.appendChild(el('span', null, c.short_hash || c.hash.slice(0, 10)));
      ghLink.appendChild(el('span', null, '\u2197'));
      ghLink.addEventListener('click', (ev) => {
        ev.stopPropagation();
      });
      tdCommit.appendChild(ghLink);
      tr.appendChild(tdCommit);

      // 3. Purpose Category + Trigger Badge
      const tdCat = el('td', 'col-category');
      const catMeta = CATEGORY_META[c.category] || { shortLabel: c.category, badgeClass: 'cat-refactor-cleanup' };
      tdCat.appendChild(el('span', 'badge-pill ' + catMeta.badgeClass, catMeta.shortLabel));
      if (c.trigger && TRIGGER_META[c.trigger]) {
        const trigMeta = TRIGGER_META[c.trigger];
        const trigBadge = el('div', 'trigger-sub-pill ' + trigMeta.badgeClass, trigMeta.shortLabel);
        trigBadge.title = 'Trigger Attribution: ' + trigMeta.label;
        tdCat.appendChild(trigBadge);
      }
      tr.appendChild(tdCat);

      // 4. Sandbox Effect
      const tdEff = el('td', 'col-effect');
      const effMeta = EFFECT_META[c.effect] || { shortLabel: c.effect, symbol: '\u25CB', badgeClass: 'eff-no-impact' };
      tdEff.appendChild(el('span', 'badge-pill ' + effMeta.badgeClass, effMeta.symbol + ' ' + effMeta.shortLabel));
      tr.appendChild(tdEff);

      // 5. Profiles
      const tdProf = el('td', 'col-profiles');
      const profWrap = el('div', 'profile-tags');
      (c.profiles || []).forEach((p) => {
        profWrap.appendChild(el('span', 'profile-tag', p));
      });
      tdProf.appendChild(profWrap);
      tr.appendChild(tdProf);

      // 6. One-Line Purpose Summary & Metadata
      const tdSum = el('td', 'col-summary');
      tdSum.appendChild(el('div', 'summary-primary', c.summary));

      const metaRow = el('div', 'summary-meta-row');
      (c.tags || []).forEach((t) => {
        const tMeta = TAG_META[t] || { shortLabel: t, badgeClass: 'tag-apple-specific', description: t };
        const chip = el('span', 'tag-chip ' + tMeta.badgeClass, tMeta.shortLabel);
        chip.title = tMeta.description + ' (click to filter)';
        chip.addEventListener('click', (ev) => {
          ev.stopPropagation();
          toggleFilter('tag', t);
        });
        metaRow.appendChild(chip);
      });
      if (c.subject && c.subject.trim() !== c.summary.trim()) {
        const cleanSubj = c.subject.length > 115 ? c.subject.slice(0, 112) + '\u2026' : c.subject;
        metaRow.appendChild(el('span', null, 'Commit: ' + cleanSubj));
      }
      if (c.author) {
        metaRow.appendChild(el('span', null, '\u00B7 ' + c.author));
      }
      if (c.sb_only) {
        const sbChip = el('span', 'resource-chip sb-only-chip', '.sb-only');
        sbChip.title = 'Touches only sandbox profiles / entitlements / PlatformHave.h (no WebKit C++/ObjC/Swift engine code)';
        metaRow.appendChild(sbChip);
      }
      (c.resources || []).slice(0, 4).forEach((r) => {
        metaRow.appendChild(el('span', 'resource-chip', r));
      });
      tdSum.appendChild(metaRow);
      tr.appendChild(tdSum);

      // 7. Rule Delta
      const tdDelta = el('td', 'col-delta');
      const tightenRules = (c.deny_added || 0) + (c.allow_removed || 0);
      const loosenRules = (c.allow_added || 0) + (c.deny_removed || 0);
      if (tightenRules === 0 && loosenRules === 0) {
        tdDelta.appendChild(
          el('span', 'delta-muted', '+' + (c.lines_added || 0) + ' / -' + (c.lines_deleted || 0) + ' ln')
        );
      } else {
        if (tightenRules > 0) {
          tdDelta.appendChild(el('div', 'delta-block', '-' + tightenRules + ' tightened'));
        }
        if (loosenRules > 0) {
          tdDelta.appendChild(el('div', 'delta-allow', '+' + loosenRules + ' allowed'));
        }
      }
      tr.appendChild(tdDelta);

      tr.addEventListener('click', () => {
        if (state.expandedHashes.has(c.hash)) {
          state.expandedHashes.delete(c.hash);
        } else {
          state.expandedHashes.add(c.hash);
        }
        syncStateToHistory(false);
        renderTable();
      });

      tbody.appendChild(tr);

      if (isExpanded) {
        tbody.appendChild(buildDetailRow(c));
      }
    });
  }

  function buildDetailRow(c) {
    const tr = el('tr', 'commit-detail-row');
    const td = el('td');
    td.colSpan = 7;

    const drawer = el('div', 'detail-drawer');

    // Left column: Full Commit Description
    const leftCol = el('div');
    leftCol.appendChild(el('h4', 'detail-section-title', 'Full Commit Description'));
    const descBox = el('pre', 'detail-description', c.description || c.subject || '');
    leftCol.appendChild(descBox);

    // Right column: Metadata, GitHub Diff Button, Files, Rule Metrics
    const rightCol = el('div', 'detail-meta-list');

    const actionBox = el('div', 'detail-meta-item');
    actionBox.appendChild(el('h4', 'detail-section-title', 'Inspect Commit & Seatbelt Diff'));
    const ghBtn = el('a', 'github-commit-link');
    ghBtn.href = safeGithubCommitUrl(c.hash, c.github_url);
    ghBtn.target = '_blank';
    ghBtn.rel = 'noopener noreferrer';
    ghBtn.appendChild(el('span', null, 'View Commit ' + c.hash.slice(0, 12) + ' on GitHub \u2197'));
    actionBox.appendChild(ghBtn);

    if (c.tags && c.tags.length > 0) {
      const tagWrap = el('div');
      tagWrap.style.marginTop = '8px';
      c.tags.forEach((t) => {
        const tMeta = TAG_META[t] || { shortLabel: t, badgeClass: 'tag-apple-specific', description: t };
        const chip = el('span', 'tag-chip ' + tMeta.badgeClass, tMeta.shortLabel);
        chip.title = tMeta.description;
        chip.style.marginRight = '6px';
        tagWrap.appendChild(chip);
      });
      actionBox.appendChild(tagWrap);
    }

    if (c.bugs && c.bugs.length > 0) {
      const bugWrap = el('div');
      bugWrap.style.marginTop = '8px';
      c.bugs.forEach((b) => {
        if (b.indexOf('webkit:') === 0) {
          const id = b.slice(7).replace(/\D/g, '');
          const a = el('a', 'bug-link', 'webkit.org/b/' + id + ' \u2197');
          a.href = 'https://bugs.webkit.org/show_bug.cgi?id=' + id;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          bugWrap.appendChild(a);
        } else {
          bugWrap.appendChild(el('span', 'resource-chip', b));
        }
      });
      actionBox.appendChild(bugWrap);
    }
    rightCol.appendChild(actionBox);

    const trigBox = el('div', 'detail-meta-item');
    trigBox.appendChild(el('h4', 'detail-section-title', 'Trigger Attribution & Repository Scope'));
    const trigMeta = TRIGGER_META[c.trigger] || { label: c.trigger || 'Unknown', description: '' };
    const scopeParts = [
      'Trigger: ' + trigMeta.label,
      'File scope: ' + (c.sb_only ? 'Sandbox-only (.sb / PlatformHave.h / entitlements)' : 'Coupled with WebKit C++/ObjC/Swift source files'),
      'macOS profile overlap: ' + (c.touches_mac_sb ? 'Also modifies macOS .sb profile' : 'iOS-only sandbox modification')
    ];
    trigBox.appendChild(el('div', null, scopeParts.join('  \u00B7  ')));
    rightCol.appendChild(trigBox);

    const metricsBox = el('div', 'detail-meta-item');
    metricsBox.appendChild(el('h4', 'detail-section-title', 'Seatbelt Diff Polarity Metrics'));
    const mText = [
      'Lines: +' + (c.lines_added || 0) + ' / -' + (c.lines_deleted || 0),
      'Allow rules: +' + (c.allow_added || 0) + ' added, -' + (c.allow_removed || 0) + ' removed',
      'Deny rules: +' + (c.deny_added || 0) + ' added, -' + (c.deny_removed || 0) + ' removed',
      'Preprocessor conditionals: +' + (c.preproc_added_count || 0) + ' / -' + (c.preproc_removed_count || 0)
    ].join('  |  ');
    metricsBox.appendChild(el('div', null, mText));
    rightCol.appendChild(metricsBox);

    if (c.rules && c.rules.length > 0) {
      const rulesBox = el('div', 'detail-meta-item');
      rulesBox.appendChild(el('h4', 'detail-section-title', 'Touched Seatbelt Rules, Services & Predicates (' + c.rules.length + ')'));
      const ruleWrap = el('div', 'resource-chips');
      c.rules.forEach((r) => {
        const chip = el('span', 'resource-chip', r);
        chip.title = 'Search commits touching ' + r;
        chip.style.cursor = 'pointer';
        chip.addEventListener('click', (ev) => {
          ev.stopPropagation();
          state.search = r;
          state.page = 1;
          refreshAll();
        });
        ruleWrap.appendChild(chip);
      });
      rulesBox.appendChild(ruleWrap);
      rightCol.appendChild(rulesBox);
    }

    const filesBox = el('div', 'detail-meta-item');
    filesBox.appendChild(el('h4', 'detail-section-title', 'Modified iOS Sandbox Files (' + (c.files || []).length + ')'));
    const ul = el('ul', 'detail-file-list');
    (c.files || []).forEach((f) => {
      ul.appendChild(el('li', null, f));
    });
    filesBox.appendChild(ul);
    rightCol.appendChild(filesBox);

    drawer.appendChild(leftCol);
    drawer.appendChild(rightCol);
    td.appendChild(drawer);
    tr.appendChild(td);
    return tr;
  }

  function switchView(viewName) {
    const nextView = viewName === 'insights' ? 'insights' : 'explorer';
    const changed = state.view !== nextView;
    state.view = nextView;
    syncControlsFromState();
    syncStateToHistory(changed);
    if (state.view === 'explorer') {
      renderMainChart();
    }
  }

  function jumpToExplorerWithFilter(opts) {
    resetAllFiltersQuiet();
    if (opts.category) state.category = opts.category;
    if (opts.effect) state.effect = opts.effect;
    if (opts.trigger) state.trigger = opts.trigger;
    if (opts.profile) state.profile = opts.profile;
    if (opts.resource) state.resource = opts.resource;
    if (opts.tag) state.tag = opts.tag;
    if (opts.startDate) state.startDate = opts.startDate;
    if (opts.endDate) state.endDate = opts.endDate;
    if (opts.search) state.search = opts.search;
    if (opts.bucket) state.bucket = opts.bucket;
    if (opts.stackBy) state.stackBy = opts.stackBy;
    state.view = 'explorer';
    state.page = 1;
    refreshAll({ pushHistory: true });
    const explorerEl = document.getElementById('explorerViewPanel');
    if (explorerEl) {
      explorerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function inspectCommitInExplorer(hashPrefix) {
    const commit = findCommitByPrefix(hashPrefix);
    resetAllFiltersQuiet();
    state.search = commit ? commit.hash.slice(0, 10) : hashPrefix;
    if (commit) {
      state.expandedHashes.add(commit.hash);
    }
    state.view = 'explorer';
    state.page = 1;
    refreshAll({ pushHistory: true });
    const tableCard = document.querySelector('.table-card');
    if (tableCard) {
      tableCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function resetAllFiltersQuiet() {
    state.category = 'all';
    state.effect = 'all';
    state.trigger = 'all';
    state.profile = 'all';
    state.resource = 'all';
    state.tag = 'all';
    state.startDate = '';
    state.endDate = '';
    state.search = '';
    state.page = 1;
  }

  function createCommitChip(hashPrefix, customNote) {
    const commit = findCommitByPrefix(hashPrefix);
    const shortHash = commit ? (commit.short_hash || commit.hash.slice(0, 10)) : hashPrefix;
    const dateStr = commit ? commit.date : '';
    const summaryStr = customNote || (commit ? commit.summary : '');
    const fullUrl = commit
      ? safeGithubCommitUrl(commit.hash, commit.github_url)
      : 'https://github.com/WebKit/WebKit/commit/' + encodeURIComponent(hashPrefix);

    const chip = el('span', 'insight-commit-chip');

    const inspectBtn = el('button', 'insight-commit-inspect');
    inspectBtn.type = 'button';
    inspectBtn.title = (commit ? '[' + commit.date + '] ' + commit.summary + '\nClick to inspect in Data View' : 'Inspect ' + shortHash + ' in Data View');
    inspectBtn.appendChild(el('code', 'insight-commit-hash', shortHash));
    if (dateStr) {
      inspectBtn.appendChild(el('span', 'insight-commit-date', dateStr.slice(0, 7)));
    }
    if (summaryStr) {
      const cleanNote = summaryStr.length > 72 ? summaryStr.slice(0, 69) + '\u2026' : summaryStr;
      inspectBtn.appendChild(el('span', 'insight-commit-note', cleanNote));
    }
    inspectBtn.addEventListener('click', () => {
      inspectCommitInExplorer(hashPrefix);
    });

    const ghLink = el('a', 'insight-commit-gh', '\u2197');
    ghLink.href = fullUrl;
    ghLink.target = '_blank';
    ghLink.rel = 'noopener noreferrer';
    ghLink.title = 'Open commit ' + shortHash + ' diff on GitHub in new tab';

    chip.appendChild(inspectBtn);
    chip.appendChild(ghLink);
    return chip;
  }

  function createFilterActionButton(label, filterOpts, secondary) {
    const btn = el('button', secondary ? 'insight-filter-btn secondary' : 'insight-filter-btn', label + ' \u2192');
    btn.type = 'button';
    btn.addEventListener('click', () => {
      jumpToExplorerWithFilter(filterOpts);
    });
    return btn;
  }

  function createBulletList(items, extraClass) {
    const ul = el('ul', 'insight-bullet-list' + (extraClass ? ' ' + extraClass : ''));
    items.forEach((item) => {
      const li = el('li', 'insight-bullet-item');
      if (item.lead) {
        li.appendChild(el('strong', 'insight-bullet-lead', item.lead + ': '));
      }
      li.appendChild(el('span', null, item.text));
      if (Array.isArray(item.links) && item.links.length > 0) {
        const linksWrap = el('span', 'insight-inline-links');
        item.links.forEach((lnk) => {
          if (lnk.commit) {
            const cObj = findCommitByPrefix(lnk.commit);
            const a = el('a', 'insight-inline-link commit-link', (lnk.label || lnk.commit.slice(0, 10)) + ' \u2197');
            a.href = cObj ? safeGithubCommitUrl(cObj.hash, cObj.github_url) : safeGithubCommitUrl(lnk.commit);
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.title = lnk.title || (cObj ? '[' + cObj.date + '] ' + cObj.summary : 'View commit on GitHub');
            linksWrap.appendChild(a);
          } else if (lnk.path) {
            const a = el('a', 'insight-inline-link source-link', (lnk.label || lnk.path) + ' \u2197');
            a.href = safeGithubSourceUrl(lnk.path);
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.title = lnk.title || ('View ' + lnk.path + ' on GitHub');
            linksWrap.appendChild(a);
          }
        });
        li.appendChild(linksWrap);
      }
      ul.appendChild(li);
    });
    return ul;
  }

  function buildInsightAnnualSvgChart() {
    const wrap = el('div', 'insight-figure-box');
    const titleRow = el('div', 'insight-figure-header');
    titleRow.appendChild(el('span', 'insight-figure-title', 'Figure 1A: Annual iOS Sandbox Commits (2014\u20132026) \u2014 Sandbox-Only (.sb) vs. WebKit Code-Coupled'));
    titleRow.appendChild(el('span', 'insight-figure-hint', 'Click any year bar to open in Data View'));
    wrap.appendChild(titleRow);

    const years = [];
    for (let y = 2014; y <= 2026; y++) {
      years.push(String(y));
    }
    const yearStats = years.map((yr) => {
      const yrCommits = allCommits.filter((c) => c.date && c.date.slice(0, 4) === yr);
      const sbOnly = yrCommits.filter((c) => c.sb_only).length;
      const coupled = yrCommits.length - sbOnly;
      return { year: yr, total: yrCommits.length, sbOnly: sbOnly, coupled: coupled };
    });

    const maxTotal = Math.max(140, ...yearStats.map((d) => d.total));
    const width = 560;
    const height = 195;
    const padLeft = 34;
    const padRight = 12;
    const padTop = 20;
    const padBottom = 28;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    const svg = svgEl('svg', {
      viewBox: '0 0 ' + width + ' ' + height,
      class: 'insight-mini-svg',
      role: 'img',
      'aria-label': 'Annual iOS sandbox commits stacked by sandbox-only vs WebKit code-coupled'
    });

    [0, 50, 100, 140].forEach((tick) => {
      const y = padTop + plotH - (tick / maxTotal) * plotH;
      svg.appendChild(
        svgEl('line', {
          x1: padLeft,
          y1: y,
          x2: width - padRight,
          y2: y,
          stroke: '#e2e8f0',
          'stroke-dasharray': tick === 0 ? 'none' : '3,3'
        })
      );
      const lbl = svgEl('text', {
        x: padLeft - 6,
        y: y + 4,
        'text-anchor': 'end',
        fill: '#64748b',
        'font-size': '10',
        'font-family': 'JetBrains Mono, monospace'
      });
      lbl.textContent = String(tick);
      svg.appendChild(lbl);
    });

    const slotW = plotW / yearStats.length;
    const barW = Math.min(28, slotW * 0.68);

    yearStats.forEach((d, idx) => {
      const x = padLeft + idx * slotW + (slotW - barW) / 2;
      const sbH = (d.sbOnly / maxTotal) * plotH;
      const cpH = (d.coupled / maxTotal) * plotH;
      const ySb = padTop + plotH - sbH;
      const yCp = ySb - cpH;

      const g = svgEl('g', { class: 'insight-bar-group' });
      const titleEl = svgEl('title');
      titleEl.textContent =
        d.year +
        ': ' +
        d.total +
        ' commits (' +
        d.sbOnly +
        ' .sb-only, ' +
        d.coupled +
        ' WebKit code-coupled) \u2014 Click to inspect ' +
        d.year +
        ' in Data View';
      g.appendChild(titleEl);

      if (d.sbOnly > 0) {
        g.appendChild(
          svgEl('rect', {
            x: x,
            y: ySb,
            width: barW,
            height: sbH,
            fill: '#4f46e5',
            rx: 2
          })
        );
      }
      if (d.coupled > 0) {
        g.appendChild(
          svgEl('rect', {
            x: x,
            y: yCp,
            width: barW,
            height: cpH,
            fill: '#a855f7',
            rx: 2
          })
        );
      }

      if (d.total > 0) {
        const valTxt = svgEl('text', {
          x: x + barW / 2,
          y: yCp - 4,
          'text-anchor': 'middle',
          fill: '#1e293b',
          'font-size': '9.5',
          'font-weight': '600',
          'font-family': 'JetBrains Mono, monospace'
        });
        valTxt.textContent = String(d.total);
        g.appendChild(valTxt);
      }

      const yrTxt = svgEl('text', {
        x: x + barW / 2,
        y: height - 9,
        'text-anchor': 'middle',
        fill: '#475569',
        'font-size': '10',
        'font-family': 'JetBrains Mono, monospace'
      });
      yrTxt.textContent = "'" + d.year.slice(2);
      g.appendChild(yrTxt);

      g.addEventListener('click', () => {
        jumpToExplorerWithFilter({
          startDate: d.year + '-01-01',
          endDate: d.year + '-12-31',
          bucket: 'quarter',
          stackBy: 'trigger'
        });
      });

      svg.appendChild(g);
    });

    wrap.appendChild(svg);

    const leg = el('div', 'insight-mini-legend');
    [
      { color: '#4f46e5', label: 'Sandbox-Only (.sb / PlatformHave.h / entitlements): 644 commits (70.1%)' },
      { color: '#a855f7', label: 'Coupled with WebKit C++/ObjC/Swift Code: 275 commits (29.9%)' }
    ].forEach((item) => {
      const span = el('span', 'insight-mini-legend-item');
      const sw = el('span', 'legend-swatch');
      sw.style.backgroundColor = item.color;
      span.appendChild(sw);
      span.appendChild(el('span', null, item.label));
      leg.appendChild(span);
    });
    wrap.appendChild(leg);
    return wrap;
  }

  function buildHorizontalMeterChart(title, hint, rows, maxDenominator) {
    const wrap = el('div', 'insight-figure-box');
    const hdr = el('div', 'insight-figure-header');
    hdr.appendChild(el('span', 'insight-figure-title', title));
    if (hint) {
      hdr.appendChild(el('span', 'insight-figure-hint', hint));
    }
    wrap.appendChild(hdr);

    const list = el('div', 'insight-meter-list');
    rows.forEach((r) => {
      const rowEl = el('div', 'insight-meter-row' + (r.filter ? ' clickable' : ''));
      if (r.tooltip) rowEl.title = r.tooltip;

      const top = el('div', 'insight-meter-top');
      const lblWrap = el('div', 'insight-meter-label');
      const sw = el('span', 'legend-swatch');
      sw.style.backgroundColor = r.color || '#2563eb';
      lblWrap.appendChild(sw);
      lblWrap.appendChild(el('span', 'insight-meter-name', r.label));
      if (r.sublabel) {
        lblWrap.appendChild(el('span', 'insight-meter-sub', r.sublabel));
      }
      top.appendChild(lblWrap);
      top.appendChild(el('span', 'insight-meter-val', r.rightText));

      const track = el('div', 'insight-meter-track');
      if (r.segments && r.segments.length > 0) {
        r.segments.forEach((seg) => {
          const fill = el('div', 'insight-meter-fill-seg');
          fill.style.width = Math.max(seg.pct, seg.pct > 0 ? 1.5 : 0) + '%';
          fill.style.backgroundColor = seg.color;
          if (seg.title) fill.title = seg.title;
          track.appendChild(fill);
        });
      } else {
        const pct = maxDenominator ? (r.count / maxDenominator) * 100 : r.pct || 0;
        const fill = el('div', 'insight-meter-fill');
        fill.style.width = Math.max(pct, r.count > 0 ? 2 : 0) + '%';
        fill.style.backgroundColor = r.color || '#2563eb';
        track.appendChild(fill);
      }

      rowEl.appendChild(top);
      rowEl.appendChild(track);
      if (r.filter) {
        rowEl.addEventListener('click', () => {
          jumpToExplorerWithFilter(r.filter);
        });
      }
      list.appendChild(rowEl);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function renderInsightsView() {
    const container = document.getElementById('insightsContent') || document.getElementById('insightsViewPanel');
    if (!container) return;
    container.replaceChildren();

    const total = allCommits.length || 919;
    const trigCounts = {};
    TRIGGER_ORDER.forEach((tid) => {
      trigCounts[tid] = allCommits.filter((c) => c.trigger === tid).length;
    });
    const sbOnlyCount = allCommits.filter((c) => c.sb_only).length;
    const iosOnlyCount = allCommits.filter((c) => !c.touches_mac_sb).length;
    const osConfirmed = trigCounts['os-framework-3p'] || 72;
    const opaqueFix = trigCounts['opaque-runtime-fix'] || 223;
    const osPlusOpaque = osConfirmed + opaqueFix;

    // =========================================================================
    // TOP SUMMARY BANNER & SECTION NAVIGATION
    // =========================================================================
    const hero = el('div', 'insights-hero-card');
    const heroTopRow = el('div', 'insights-hero-top');
    const heroTextCol = el('div', 'insights-hero-header');
    heroTextCol.appendChild(el('span', 'insights-kicker', 'EXECUTIVE BRIEFING & EMPIRICAL DATASET (919 COMMITS, 2014\u20132026)'));
    heroTextCol.appendChild(
      el(
        'h2',
        'insights-hero-title',
        'How the iOS Seatbelt Sandbox Works & Why a Custom Chromium Browser Struggles with OS-Bundled Policies'
      )
    );
    heroTextCol.appendChild(
      createBulletList([
        {
          lead: 'Core Question',
          text: 'Can a third-party browser engine (such as Chromium) reliably operate on iOS using BrowserEngineKit\u2019s predefined, OS-bundled Seatbelt sandbox policies?'
        },
        {
          lead: 'Key Finding',
          text: 'WebKit\u2019s iOS sandbox is a continuously evolving, default-deny kernel allowlist (919 commits; 115 in 2025 alone) tightly co-designed around WebKit\u2019s exact syscall, Mach, and IPC footprint \u2014 where 7.8%\u201332.1% of changes respond to OS/library drift and 88.2% are iOS-specific.'
        }
      ], 'hero-bullet-list')
    );
    heroTopRow.appendChild(heroTextCol);

    const heroActionCol = el('div', 'insights-hero-actions');
    const switchDataBtn = el('button', 'btn-primary-data-view', 'Open Interactive Data View (' + formatNumber(total) + ' Commits) \u2192');
    switchDataBtn.type = 'button';
    switchDataBtn.addEventListener('click', () => switchView('explorer'));
    heroActionCol.appendChild(switchDataBtn);
    heroTopRow.appendChild(heroActionCol);
    hero.appendChild(heroTopRow);

    // Quick section jump bar
    const jumpNav = el('div', 'insights-jump-nav');
    [
      { id: 'insight-part-seatbelt', label: '1. What Seatbelt (.sb) Files Are & How the iOS Sandbox Works' },
      { id: 'insight-part-chromium', label: '2. Why a Custom Chromium Browser Struggles on iOS' },
      { id: 'insight-part-cards', label: '3. Six Data-Backed Insight Cards & Figures' }
    ].forEach((navItem) => {
      const a = el('a', 'insights-jump-link', navItem.label);
      a.href = '#' + navItem.id;
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const target = document.getElementById(navItem.id);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      jumpNav.appendChild(a);
    });
    hero.appendChild(jumpNav);

    // 4 Headline Metric Strip Cards
    const execGrid = el('div', 'insights-exec-grid');
    [
      {
        value: formatNumber(total) + ' Commits',
        sub: '115 commits in 2025 (~2.2 / week)',
        title: 'Continuous Policy Evolution',
        bullets: [
          '70.1% (644) modify only .sb/.sb.in profiles without WebKit C++/ObjC code changes',
          'OS-bundled policies mean 3P browsers cannot ship .sb hotfixes in App Store updates'
        ],
        color: '#4f46e5',
        filter: { trigger: 'sb-only-all', bucket: 'year', stackBy: 'trigger' },
        btnLabel: 'View 644 .sb-Only Commits'
      },
      {
        value: '7.8% \u2013 32.1%',
        sub: '72 confirmed \u2192 295 incl. opaque fixes',
        title: 'Triggered by OS / Library Drift',
        bullets: [
          '72 commits explicitly cite iOS frameworks (Metal, CoreAudio, libsystem, ICU, daemon splits)',
          '223 more are .sb-only runtime fixes with opaque rdar:// logs or delayed telemetry'
        ],
        color: '#0284c7',
        filter: { trigger: 'os-or-opaque', bucket: 'trigger', stackBy: 'category' },
        btnLabel: 'View 295 OS & Opaque Fixes'
      },
      {
        value: '58.0% Tighten',
        sub: '276 hardening + 113 telemetry + 76 reverts',
        title: 'WebKit-Driven Hardening Loop',
        bullets: [
          'Apple probes rules with (with telemetry) in Safari/WebKit and blocks unused primitives',
          'Syscalls unused by WebKit get stripped even if Chromium (V8/Blink/Skia///net) needs them'
        ],
        color: '#dc2626',
        filter: { category: 'security-hardening', bucket: 'year', stackBy: 'effect' },
        btnLabel: 'View 276 Hardening Commits'
      },
      {
        value: '88.2% iOS-Only',
        sub: '811 of 919 never touch macOS .sb',
        title: 'macOS Code Breaks on iOS',
        bullets: [
          'iOS default-denies syscall-unix (134 in WebContent), syscall-mach (40), MIG (38), fcntl (8 in GPU)',
          'Routine POSIX/Mach code that passes Chromium\u2019s macOS sandbox traps on iOS'
        ],
        color: '#d97706',
        filter: { resource: 'syscall-unix', bucket: 'year', stackBy: 'effect' },
        btnLabel: 'View 271 Syscall Commits'
      }
    ].forEach((m) => {
      const card = el('div', 'insights-exec-card');
      card.style.borderTop = '4px solid ' + m.color;
      const top = el('div');
      top.appendChild(el('div', 'insights-exec-val', m.value));
      top.appendChild(el('div', 'insights-exec-sub', m.sub));
      top.appendChild(el('div', 'insights-exec-title', m.title));
      const ul = el('ul', 'insights-exec-bullets');
      m.bullets.forEach((b) => ul.appendChild(el('li', null, b)));
      top.appendChild(ul);
      card.appendChild(top);
      card.appendChild(createFilterActionButton(m.btnLabel, m.filter));
      execGrid.appendChild(card);
    });
    hero.appendChild(execGrid);
    container.appendChild(hero);

    // =========================================================================
    // PART 1: What Seatbelt (.sb) Files Are & How the iOS Sandbox Works
    // =========================================================================
    const part1 = el('section', 'insights-section');
    part1.id = 'insight-part-seatbelt';
    const p1Hdr = el('div', 'insights-section-header');
    p1Hdr.appendChild(el('span', 'insights-section-num', 'PART 1 \u00B7 HIGH-LEVEL ARCHITECTURE'));
    p1Hdr.appendChild(el('h3', 'insights-section-title', 'What Seatbelt (.sb) Files Are & How the iOS Browser Sandbox Works'));
    part1.appendChild(p1Hdr);

    // Visual Architecture Diagram (3-stage pipeline)
    const archDiagram = el('div', 'insight-arch-diagram');
    [
      {
        step: '1. Privileged Coordinator',
        title: 'UIProcess (Browser App)',
        code: 'WKWebView / Browser Host',
        items: [
          'Owns user session, navigation, & UI',
          'Opens files & system services on behalf of helpers',
          'Mints dynamic Sandbox Extension tokens over IPC'
        ],
        tone: 'arch-box-ui'
      },
      {
        step: '2. Untrusted Helper Processes (.sb Profiles)',
        title: 'WebContent \u00B7 GPU \u00B7 Networking',
        code: 'com.apple.WebKit.{WebContent,GPU,Networking}.sb.in',
        items: [
          'WebContent (668 commits): HTML, JS/Wasm (JIT), DOM, Layout',
          'GPU (181 commits): Metal, WebGL/WebGPU, CoreAudio, AVFoundation',
          'Networking (175 commits): HTTP/QUIC sockets, cookies, disk cache'
        ],
        tone: 'arch-box-helpers'
      },
      {
        step: '3. XNU Kernel Mandatory Access Control',
        title: 'Seatbelt Filter (Sandbox.kext)',
        code: '(deny default) + Explicit Allowlists',
        items: [
          'Intercepts every syscall-unix, syscall-mach, MIG, fcntl, sysctl, file & Mach IPC',
          'Revokes startup syscalls after WebContentProcessLaunched flag',
          'Kills process (SIGSYS) or returns EPERM on any unwhitelisted call'
        ],
        tone: 'arch-box-kernel'
      }
    ].forEach((stage, i) => {
      const box = el('div', 'insight-arch-box ' + stage.tone);
      box.appendChild(el('div', 'insight-arch-step', stage.step));
      box.appendChild(el('div', 'insight-arch-title', stage.title));
      box.appendChild(el('code', 'insight-arch-code', stage.code));
      const ul = el('ul', 'insight-arch-list');
      stage.items.forEach((it) => ul.appendChild(el('li', null, it)));
      box.appendChild(ul);
      archDiagram.appendChild(box);
      if (i < 2) {
        const arrow = el('div', 'insight-arch-arrow', '\u2194');
        arrow.title = i === 0 ? 'IPC + Sandbox Extension Tokens' : 'Every Kernel Trap Inspected Against Compiled Seatbelt Profile';
        archDiagram.appendChild(arrow);
      }
    });
    part1.appendChild(archDiagram);

    // 3 Bullet-Point Pillar Cards explaining Seatbelt
    const p1Grid = el('div', 'insights-cards-grid cols-3');
    [
      {
        kicker: '1A \u00B7 SEATBELT POLICY FILES (.sb / .sb.in)',
        title: 'Declarative Kernel Policy Rules',
        bullets: [
          { lead: 'S-Expression Policy DSL', text: 'Seatbelt files are written in a TinyScheme dialect using (allow ...) and (deny ...) rules (Source/WebKit/Resources/SandboxProfiles/ios/ and Source/WebKit/Shared/Sandbox/iOS/).' },
          { lead: 'Compile-Time & Runtime Guards', text: 'Preprocessed with C macros (#if HAVE(...)) and filtered at runtime by kernel state flags (state-flag), code signature (is-apple-signed-executable), and Lockdown Mode (EnhancedSecurity).' },
          { lead: 'Telemetry Instrumentation', text: 'Rules annotated with (with telemetry) or (with telemetry-backtrace) log stack traces to Apple when tripped, driving continuous tightening.' }
        ],
        code: '; Source/WebKit/Shared/Sandbox/iOS/com.apple.WebKit.WebContent.sb.in\n(deny syscall-unix (with telemetry))\n(allow syscall-unix (syscall-number syscall-unix-allowed))'
      },
      {
        kicker: '1B \u00B7 MULTI-PROCESS PRIVILEGE SEPARATION',
        title: 'Zero-Trust Helper Processes + IPC Brokering',
        bullets: [
          { lead: 'Strict Process Compartmentalization', text: 'WebContent renders untrusted web code without direct disk or network access; GPU handles Metal/audio/video; Networking handles sockets.' },
          { lead: 'Brokered Access via UIProcess', text: 'Instead of granting static file or Mach permissions to WebContent, WebKit\u2019s UIProcess opens resources and passes file descriptors or sandbox extension tokens over IPC.' },
          { lead: 'Co-Evolution with Engine Code', text: '29.9% (275) of sandbox commits move an operation out of WebContent into UI/GPU/Network processes and simultaneously delete the .sb rule.' }
        ],
        code: '; Require dynamic token issued by UIProcess at runtime\n(allow mach-lookup\n    (require-all\n        (extension "com.apple.webkit.extension.mach")\n        (global-name "com.apple.mobileassetd.v2")))'
      },
      {
        kicker: '1C \u00B7 DEFAULT-DENY KERNEL WHITELISTS',
        title: 'Syscall, Mach, MIG & Two-Phase Lockdown',
        bullets: [
          { lead: 'Fine-Grained Kernel Filtering', text: 'Unlike macOS Seatbelt, iOS default-denies Unix syscalls (134 allowed in WebContent, 118 in GPU), Mach traps (40), kernel MIG routines (~38), fcntl commands (8 in GPU), and sysctls (45).' },
          { lead: 'Two-Phase Launch Barrier', text: 'Once warmup finishes, WebKit sets WebContentProcessLaunched / GPUProcessLaunched, revoking 10 Unix syscalls, 2 Mach traps, 5 MIG routines, and 2 sysctls mid-process.' },
          { lead: 'Lockdown Mode (EnhancedSecurity)', text: 'For high-risk users, EnhancedSecurity revokes JIT compilation plus 33 additional Unix syscalls, 5 Mach traps, and 12 MIG routines.' }
        ],
        code: '; Revoked immediately once WebContentProcessLaunched is set\n(with-filter (require-not (state-flag "WebContentProcessLaunched"))\n    (allow syscall-mach (syscall-number\n        MSC_mach_timebase_info_trap MSC_task_self_trap)))'
      }
    ].forEach((col) => {
      const card = el('div', 'insights-detail-card');
      card.appendChild(el('div', 'insights-card-kicker', col.kicker));
      card.appendChild(el('h4', 'insights-card-title', col.title));
      card.appendChild(createBulletList(col.bullets));
      if (col.code) {
        card.appendChild(el('pre', 'insights-code-box', col.code));
      }
      p1Grid.appendChild(card);
    });
    part1.appendChild(p1Grid);
    container.appendChild(part1);

    // =========================================================================
    // PART 2: How a Custom Chromium Browser Struggles to Use the Sandbox Reliably
    // =========================================================================
    const part2 = el('section', 'insights-section');
    part2.id = 'insight-part-chromium';
    const p2Hdr = el('div', 'insights-section-header');
    p2Hdr.appendChild(el('span', 'insights-section-num', 'PART 2 \u00B7 THE ARCHITECTURAL MISMATCH'));
    p2Hdr.appendChild(
      el(
        'h3',
        'insights-section-title',
        'Why a Custom Chromium Browser Struggles with BrowserEngineKit\u2019s OS-Tied Sandbox'
      )
    );
    part2.appendChild(p2Hdr);

    // Side-by-Side Comparison Matrix (Compact & Scannable)
    const compTable = el('table', 'insights-comparison-table');
    const thead = el('thead');
    const hRow = el('tr');
    [
      'Dimension',
      'Chromium on macOS / Desktop (sandbox/policy/mac/*.sb)',
      'Chromium on iOS via BrowserEngineKit (OS-Bundled .sb)',
      'Operational Risk for a Custom Chromium Browser'
    ].forEach((hText) => hRow.appendChild(el('th', null, hText)));
    thead.appendChild(hRow);
    compTable.appendChild(thead);

    const tbody = el('tbody');
    [
      [
        'Where Sandbox Policy Lives',
        'Bundled inside the Chrome app binary; versioned 1:1 with every Chromium commit.',
        'Compiled into the iOS OS image (BEWebContentProcess, BERenderingProcess, BENetworkingProcess).',
        'Cannot ship a .sb rule change or hotfix in an App Store update; must wait for an iOS OS release.'
      ],
      [
        'Sandbox Telemetry & Policy Tightening',
        'Chromium security team tests policy changes against Chromium CI and owns in-app crash/sandbox telemetry.',
        'Apple tightens profiles via Safari/WebKit (with telemetry) rules (58.0% tighten/probe); Sandbox.kext routes telemetry only to Apple CoreAnalytics.',
        'Primitives unused by WebKit get stripped; beyond errors surfaced to engine code, 3P engines lack kernel telemetry for non-fatal or system-framework denials.'
      ],
      [
        'Kernel Primitive Filtering',
        'Unix syscalls, Mach traps, MIG routines, and fcntl commands are broadly allowed.',
        'Strict default-deny whitelists on syscall-unix, syscall-mach, syscall-mig, system-fcntl, sysctl-read, & socket-option.',
        'Shared Apple C++/POSIX code (//base, //gpu, //net) passes all macOS tests but crashes with SIGSYS/EPERM on iOS.'
      ],
      [
        'OS Framework & Daemon Drift',
        'Broad syscall/Mach rules absorb minor macOS framework implementation changes.',
        '72 confirmed commits (up to 295 incl. opaque fixes) required .sb edits when iOS frameworks/daemons changed.',
        'Apple updates WebKit .sb files in the same OS build train; 3P engines hit asymmetric !is-apple-signed-executable bugs.'
      ]
    ].forEach((r) => {
      const tr = el('tr');
      const tdPrim = el('td', 'comp-col-prim', r[0]);
      tdPrim.setAttribute('data-label', 'Dimension');
      const tdMac = el('td', 'comp-col-mac', r[1]);
      tdMac.setAttribute('data-label', 'Chromium on macOS / Desktop');
      const tdIos = el('td', 'comp-col-ios', r[2]);
      tdIos.setAttribute('data-label', 'Chromium on iOS via BrowserEngineKit');
      const tdImpact = el('td', 'comp-col-impact', r[3]);
      tdImpact.setAttribute('data-label', 'Operational Risk for Custom Chromium');
      tr.appendChild(tdPrim);
      tr.appendChild(tdMac);
      tr.appendChild(tdIos);
      tr.appendChild(tdImpact);
      tbody.appendChild(tr);
    });
    compTable.appendChild(tbody);
    part2.appendChild(compTable);

    // 4 Concise Bullet-Point Challenge Cards
    const p2Grid = el('div', 'insights-cards-grid cols-2');
    [
      {
        kicker: 'CHALLENGE A \u00B7 DECOUPLED RELEASE CYCLES',
        title: '1. Zero Policy Hotfix Agility & Multi-OS Version Skew',
        bullets: [
          { lead: 'No App-Bundled .sb Profiles', text: 'BrowserEngineKit extensions cannot supply custom Seatbelt rules; they inherit whatever profile shipped in the user\u2019s installed iOS version.' },
          { lead: 'Blocked Until Next iOS Point Release', text: 'When a missing permission is discovered (such as GPU mkdtemp / SYS_mkdirat in 33cc299a31 or Networking container caches in c01e8de3c1), the browser must wait for an iOS OS update.' },
          { lead: 'Per-OS-Version Workarounds', text: 'Chromium must maintain complex runtime OS version checks and IPC fallbacks for users on older iOS point releases.' }
        ]
      },
      {
        kicker: 'CHALLENGE B \u00B7 ASYMMETRIC KERNEL TELEMETRY & TRACING',
        title: '2. One-Way Seatbelt Telemetry & Blindness to System-Framework Denials',
        bullets: [
          {
            lead: 'One-Way Kernel Telemetry & Private SPIs',
            text: 'Seatbelt\u2019s (with telemetry) and (with telemetry-backtrace) modifiers trap in Sandbox.kext and report via sandboxd exclusively to Apple\u2019s internal CoreAnalytics pipeline. 3P BrowserEngineKit extensions inherit fixed OS profiles and cannot customize .sb rules, query sandbox_check, or toggle runtime telemetry via sandbox_enable_state_flag (a private libsandbox SPI gated by com.apple.private.security.enable-state-flags).',
            links: [
              { label: 'WebContent.sb.in', path: 'Source/WebKit/Resources/SandboxProfiles/ios/com.apple.WebKit.WebContent.sb.in' },
              { label: 'SandboxSPI.h', path: 'Source/WTF/wtf/spi/darwin/SandboxSPI.h' },
              { label: 'libsystem_sandbox.sdkdb', path: 'WebKitLibraries/SDKDBs/iphoneos/libsystem_sandbox.partial.sdkdb' },
              { label: 'process-entitlements.sh', path: 'Source/WebKit/Scripts/process-entitlements.sh' },
              { label: 'WebContentProcessExtension.entitlements', path: 'Source/WebKit/Shared/AuxiliaryProcessExtensions/WebContentProcessExtension.entitlements' },
              { label: '9167490750', commit: '9167490750e5' }
            ]
          },
          {
            lead: 'No Audit-Before-Block Probes & Opaque System-Framework Denials',
            text: 'Beyond failures surfaced directly to its own engine code, a 3P engine cannot run non-blocking (with telemetry-backtrace) probes before rules are tightened and has no kernel-level visibility when closed-source iOS system frameworks (UIKit, CoreText, Metal, CoreAudio, AVFoundation, libsystem) inside the dyld shared cache hit an EPERM denial, swallow the error, and silently fall back or degrade.',
            links: [
              { label: '4994f537ea', commit: '4994f537ea36' },
              { label: 'd5c48f8a19', commit: 'd5c48f8a195d' },
              { label: '9ad3a6f571', commit: '9ad3a6f5714a' },
              { label: '0e5778bebe', commit: '0e5778bebea5' }
            ]
          },
          {
            lead: 'Local-Only 3P Debug Hooks & Blocked logd in WebContent',
            text: 'Apple\u2019s 3P diagnostic rules \u2014 (log-streaming) allowing com.apple.diagnosticd for (!is-apple-signed-executable) in GPU/Networking (subsequently removed from WebContent) and report-only .Development.sb.in profiles \u2014 only emit local logs on a Mac-tethered Developer Mode device, not production telemetry. Meanwhile, WebContent unconditionally blocks com.apple.logd, and WebKit\u2019s IPC LogStream relies on the private os_log_set_hook SPI.',
            links: [
              { label: 'common.sb', path: 'Source/WebKit/Shared/Sandbox/common.sb' },
              { label: 'iOS/common.sb', path: 'Source/WebKit/Shared/Sandbox/iOS/common.sb' },
              { label: 'OSLogSPI.h', path: 'Source/WTF/wtf/spi/cocoa/OSLogSPI.h' },
              { label: 'AuxiliaryProcessCocoa.mm', path: 'Source/WebKit/Shared/Cocoa/AuxiliaryProcessCocoa.mm' },
              { label: 'ba762580c0', commit: 'ba762580c098' },
              { label: '66e7f7b2c5', commit: '66e7f7b2c531' },
              { label: 'e0c788b57e', commit: 'e0c788b57e1d' },
              { label: '507789a215', commit: '507789a21582' }
            ]
          }
        ]
      },
      {
        kicker: 'CHALLENGE C \u00B7 MACOS VS. IOS SEATBELT GAP',
        title: '3. Routine Cross-Platform Chromium Code Breaks Only on iOS',
        bullets: [
          { lead: 'False Sense of Compatibility on macOS', text: 'Chromium engineers develop and test Apple platform code on macOS, where Seatbelt allows nearly all Unix syscalls, Mach traps, MIG routines, and fcntl commands.' },
          { lead: 'Unwhitelisted POSIX & C++ Stdlib Calls', text: 'Calling mkdtemp() in GPU, std::this_thread::sleep_for (clock_get_time MIG), unlink/rmdir in WebContent (gated on QuickLook), or unwhitelisted fcntls crashes on iOS.' },
          { lead: 'Post-Launch State Flag Traps', text: 'Lazy initialization of base::TimeTicks (mach_timebase_info_trap) or mach_task_self() after WebContentProcessLaunched succeeds on macOS but traps on iOS.' }
        ]
      },
      {
        kicker: 'CHALLENGE D \u00B7 OS LIBRARY DRIFT & 1P/3P ASYMMETRY',
        title: '4. OS Updates & !is-apple-signed-executable Regressions',
        bullets: [
          { lead: 'System Libraries Change Under the Hood', text: 'Updates to libsystem_pthread (SYS_ulock_wait2), Metal (sysctl-reads), CoreAudio (Mach semaphores), or ICU (Lockdown Mode pthreads) regularly require new .sb allowances.' },
          { lead: '1P Hardening Breaks 3P Containers', text: 'When Apple blocked container file access in Networking (b148037850), it broke 3P engines until c01e8de3c1 restored /tmp and /Library/Caches for !is-apple-signed-executable.' },
          { lead: 'Expert Nuance', text: 'Even WebKit itself had to revert 76 sandbox commits (8.3%) due to regressions \u2014 and WebKit ships in lockstep with the OS.' }
        ]
      }
    ].forEach((c) => {
      const card = el('div', 'insights-detail-card');
      card.appendChild(el('div', 'insights-card-kicker', c.kicker));
      card.appendChild(el('h4', 'insights-card-title', c.title));
      card.appendChild(createBulletList(c.bullets));
      p2Grid.appendChild(card);
    });
    part2.appendChild(p2Grid);
    container.appendChild(part2);

    // =========================================================================
    // PART 3: Six Data-Backed Insight Cards (With Figures & Data View Links)
    // =========================================================================
    const part3HdrWrap = el('div', 'insights-part3-banner');
    part3HdrWrap.id = 'insight-part-cards';
    const p3Left = el('div');
    p3Left.appendChild(el('span', 'insights-section-num', 'PART 3 \u00B7 EMPIRICAL EVIDENCE & FIGURES'));
    p3Left.appendChild(
      el(
        'h3',
        'insights-section-title',
        'Six Data-Backed Insight Cards (Click Any Chart Bar, Commit, or Button to Inspect Raw Data)'
      )
    );
    part3HdrWrap.appendChild(p3Left);
    container.appendChild(part3HdrWrap);

    const cardsContainer = el('div', 'insights-cards-grid cols-2');

    // -------------------------------------------------------------------------
    // INSIGHT CARD 1: Continuous Policy Churn & Sandbox-Only Edits
    // -------------------------------------------------------------------------
    const card1 = el('article', 'insight-data-card');
    const c1Hdr = el('div', 'insight-data-card-header');
    c1Hdr.appendChild(el('span', 'insight-card-num', 'INSIGHT 1 \u00B7 POLICY CHURN & FILE SCOPE'));
    c1Hdr.appendChild(el('span', 'insight-card-stat-badge', '919 Commits \u00B7 70.1% .sb-Only'));
    card1.appendChild(c1Hdr);
    card1.appendChild(el('h4', 'insight-data-card-title', 'iOS Sandbox Profiles Require ~75\u2013138 Updates/Year (70.1% Without WebKit Code Changes)'));
    card1.appendChild(buildInsightAnnualSvgChart());
    card1.appendChild(
      createBulletList([
        { lead: 'High-Frequency Policy Churn', text: '919 commits across 2014\u20132026 (~75/year average; 138 in 2021; 115 in 2025, or >2 commits every week).' },
        { lead: '70.1% (644 Commits) Are Sandbox-Only', text: '627 commits touch strictly .sb/.sb.in files and 17 touch only .sb + PlatformHave.h/entitlements, with zero WebKit C++/ObjC/Swift engine changes.' },
        { lead: '29.9% (275 Commits) Are Code-Coupled', text: 'Modify WebKit C++/ObjC source alongside .sb files (e.g., brokering IPC to UIProcess/GPUProcess or adding new process profiles).' }
      ])
    );
    const c1Commits = el('div', 'insights-chip-list');
    [
      ['f3953af233', 'Extract shared *-defines.sb syscall/Mach tables across iOS profiles (Sep 2025)'],
      ['129d7629be', 'Upgrade iOS WebContent, GPU, and Networking profiles to sandbox version 3']
    ].forEach((p) => c1Commits.appendChild(createCommitChip(p[0], p[1])));
    card1.appendChild(c1Commits);
    const c1Actions = el('div', 'insight-card-actions');
    c1Actions.appendChild(createFilterActionButton('Data View: All 644 .sb-Only Commits', { trigger: 'sb-only-all', bucket: 'year', stackBy: 'trigger' }));
    c1Actions.appendChild(createFilterActionButton('Data View: 275 Code-Coupled Commits', { trigger: 'webkit-code-coupled', bucket: 'year', stackBy: 'category' }, true));
    card1.appendChild(c1Actions);
    cardsContainer.appendChild(card1);

    // -------------------------------------------------------------------------
    // INSIGHT CARD 2: OS & System Framework Attribution Bounds (7.8% - 32.1%)
    // -------------------------------------------------------------------------
    const card2 = el('article', 'insight-data-card');
    const c2Hdr = el('div', 'insight-data-card-header');
    c2Hdr.appendChild(el('span', 'insight-card-num', 'INSIGHT 2 \u00B7 OS VS. WEBKIT ATTRIBUTION'));
    c2Hdr.appendChild(el('span', 'insight-card-stat-badge', '7.8% Confirmed \u2013 32.1% Upper Bound'));
    card2.appendChild(c2Hdr);
    card2.appendChild(el('h4', 'insight-data-card-title', '72 Confirmed OS/Framework Commits (7.8%), Rising to 295 (32.1%) Including Opaque .sb-Only Fixes'));

    card2.appendChild(
      buildHorizontalMeterChart(
        'Figure 2A: All 919 Commits by Trigger Attribution & Subsystem Breakdown of the 72 Confirmed OS Commits',
        'Click any row to filter Data View',
        [
          {
            label: 'All 919 Commits (Stacked 5-Category Attribution)',
            rightText: '32.1% OS + Opaque | 67.9% WebKit / Hardening / Telemetry',
            segments: TRIGGER_ORDER.map((tid) => ({
              pct: ((trigCounts[tid] || 0) / total) * 100,
              color: TRIGGER_META[tid].color,
              title: TRIGGER_META[tid].label + ': ' + (trigCounts[tid] || 0) + ' commits'
            })),
            filter: { bucket: 'trigger', stackBy: 'trigger' }
          },
          {
            label: 'Confirmed OS / Framework / 3P Engine (Lower Bound)',
            sublabel: '23 Kernel/libc++/dyld/ICU \u00B7 16 Media \u00B7 14 Metal/Fonts \u00B7 12 SysServices \u00B7 7 3P BEK',
            rightText: osConfirmed + ' (' + ((osConfirmed / total) * 100).toFixed(1) + '%)',
            count: osConfirmed,
            color: '#0284c7',
            filter: { trigger: 'os-framework-3p', bucket: 'year', stackBy: 'effect' }
          },
          {
            label: 'Opaque rdar:// / Telemetry Runtime Fixes (.sb-Only)',
            sublabel: 'Grants syscalls/Mach/IOKit with zero WebKit code; git log does not name caller',
            rightText: opaqueFix + ' (' + ((opaqueFix / total) * 100).toFixed(1) + '%)',
            count: opaqueFix,
            color: '#d97706',
            filter: { trigger: 'opaque-runtime-fix', bucket: 'year', stackBy: 'category' }
          },
          {
            label: 'WebKit Code-Coupled Commits',
            sublabel: 'Modifies WebKit C++/ObjC/Swift engine files in the same commit',
            rightText: (trigCounts['webkit-code-coupled'] || 275) + ' (29.9%)',
            count: trigCounts['webkit-code-coupled'] || 275,
            color: '#7c3aed',
            filter: { trigger: 'webkit-code-coupled', bucket: 'year', stackBy: 'category' }
          },
          {
            label: 'Proactive Hardening (.sb-Only) & Telemetry/Refactor',
            sublabel: '184 proactive tightening (20.0%) + 165 telemetry/refactor/reverts (18.0%)',
            rightText: ((trigCounts['proactive-hardening'] || 184) + (trigCounts['telemetry-refactor'] || 165)) + ' (38.0%)',
            count: (trigCounts['proactive-hardening'] || 184) + (trigCounts['telemetry-refactor'] || 165),
            color: '#dc2626',
            filter: { trigger: 'proactive-hardening', bucket: 'year', stackBy: 'effect' }
          }
        ],
        total
      )
    );

    card2.appendChild(
      createBulletList([
        { lead: 'Confirmed OS Library Drift (72 Commits)', text: 'Explicitly cite libsystem_pthread (SYS_ulock_wait2), libc++/USDLib (clock_get_time for std::this_thread::sleep_for), ICU (detectHostTimeZone), Metal (sysctl-reads), CoreAudio, CoreText, or mediaserverd \u2192 mediaplaybackd splits.' },
        { lead: 'Why Exact Attribution Has a 24.3% Ambiguity Band', text: '223 .sb-only fixes have generic rdar:// summaries ("Allow required syscall") or resolve delayed telemetry where git blame cannot distinguish OS framework changes from older WebKit paths.' }
      ])
    );
    const c2Commits = el('div', 'insights-chip-list');
    [
      ['3e277d994f', 'Allow SYS_renameat, SYS_openat_dprotected_np, SYS_openat "to unblock an underlying framework"'],
      ['dffe77ef58', 'Allow clock_get_time MIG routine for std::this_thread::sleep_for (USDLib)'],
      ['088424c3ef', 'Allow SYS_ulock_wait2 on iOS & macOS (libpthread synchronization change)'],
      ['83fb745b0a', 'Allow CPU and cache sysctl-reads required by Metal in GPU process'],
      ['3bf860bb44', 'Permit XPC access to com.apple.mediaplaybackd.xpc after mediaserverd split']
    ].forEach((p) => c2Commits.appendChild(createCommitChip(p[0], p[1])));
    card2.appendChild(c2Commits);
    const c2Actions = el('div', 'insight-card-actions');
    c2Actions.appendChild(createFilterActionButton('Data View: 72 Confirmed OS/Framework Commits', { trigger: 'os-framework-3p', bucket: 'year', stackBy: 'effect' }));
    c2Actions.appendChild(createFilterActionButton('Data View: 223 Opaque .sb-Only Fixes', { trigger: 'opaque-runtime-fix', bucket: 'year', stackBy: 'category' }, true));
    card2.appendChild(c2Actions);
    cardsContainer.appendChild(card2);

    // -------------------------------------------------------------------------
    // INSIGHT CARD 3: Telemetry-Driven Tightening & Reverts
    // -------------------------------------------------------------------------
    const card3 = el('article', 'insight-data-card');
    const c3Hdr = el('div', 'insight-data-card-header');
    c3Hdr.appendChild(el('span', 'insight-card-num', 'INSIGHT 3 \u00B7 TELEMETRY & HARDENING CHURN'));
    c3Hdr.appendChild(el('span', 'insight-card-stat-badge', '276 Hardening \u00B7 113 Telemetry \u00B7 76 Reverts'));
    card3.appendChild(c3Hdr);
    card3.appendChild(el('h4', 'insight-data-card-title', 'Apple Continuously Strips Unused Rules via Safari/WebKit Telemetry (With an 8.3% Revert Rate)'));

    card3.appendChild(
      buildHorizontalMeterChart(
        'Figure 3A: Breakdown by Purpose Category & Diff Polarity Across 919 Commits',
        'Click any bar to filter Data View',
        [
          {
            label: 'Security Hardening (Proactive + Telemetry Tightening)',
            sublabel: 'Removing unused syscalls, Mach services, IOKit properties, & Lockdown Mode',
            rightText: '276 commits (30.0%)',
            count: 276,
            color: '#dc2626',
            filter: { category: 'security-hardening', bucket: 'year', stackBy: 'effect' }
          },
          {
            label: 'Feature & Process Enablement',
            sublabel: 'Enabling GPU, WebAuthn, Model, webpushd, adattributiond & new web features',
            rightText: '220 commits (23.9%)',
            count: 220,
            color: '#16a34a',
            filter: { category: 'feature-expansion', bucket: 'year', stackBy: 'profile' }
          },
          {
            label: 'Bug Fix & OS Compatibility',
            sublabel: 'Resolving crashes, hangs, and sandbox violations discovered in testing/field',
            rightText: '172 commits (18.7%)',
            count: 172,
            color: '#d97706',
            filter: { category: 'bugfix-compatibility', bucket: 'year', stackBy: 'trigger' }
          },
          {
            label: 'Telemetry & Violation Logging ((with telemetry))',
            sublabel: 'Probing rules before removal or silencing expected violation noise',
            rightText: '113 commits (12.3%)',
            count: 113,
            color: '#0284c7',
            filter: { category: 'telemetry-logging', bucket: 'year', stackBy: 'profile' }
          },
          {
            label: 'Reverts (Rollbacks of Breaking Sandbox Changes)',
            sublabel: '1 in 12 sandbox commits is a revert due to functional or build regressions',
            rightText: '76 commits (8.3%)',
            count: 76,
            color: '#9333ea',
            filter: { category: 'revert', bucket: 'year', stackBy: 'effect' }
          }
        ],
        total
      )
    );

    card3.appendChild(
      createBulletList([
        {
          lead: 'Two-Step Kernel Telemetry Purge',
          text: 'Apple engineers decorate candidate rules with (with telemetry) or (with telemetry-backtrace) (113 commits) or toggle them at runtime via sandbox_enable_state_flag, verify zero Safari/WebKit hits in CoreAnalytics, and delete/block the rule (276 hardening commits).',
          links: [
            { label: 'WebContent.sb.in', path: 'Source/WebKit/Resources/SandboxProfiles/ios/com.apple.WebKit.WebContent.sb.in' },
            { label: 'WebProcessCocoa.mm', path: 'Source/WebKit/WebProcess/cocoa/WebProcessCocoa.mm' }
          ]
        },
        {
          lead: 'High Revert Rate Even for First-Party WebKit (8.3%)',
          text: '76 commits are reverts of prior sandbox changes that broke internal builds, layout tests, Mail, or media playback \u2014 showing how brittle tight whitelists are even with first-party kernel telemetry.'
        },
        {
          lead: 'Why 3P Engines Cannot Replicate This Telemetry Loop',
          text: 'Beyond errors surfaced directly to engine code, 3P BrowserEngineKit engines cannot attach (with telemetry) probes, call private libsandbox/os_log_set_hook SPIs, or receive sandboxd telemetry when closed-source iOS system frameworks silently fail inside the dyld shared cache; Apple\u2019s (!is-apple-signed-executable) (log-streaming) and .Development.sb.in hooks only emit local logs on Mac-tethered development devices.',
          links: [
            { label: 'SandboxSPI.h', path: 'Source/WTF/wtf/spi/darwin/SandboxSPI.h' },
            { label: 'OSLogSPI.h', path: 'Source/WTF/wtf/spi/cocoa/OSLogSPI.h' },
            { label: 'common.sb', path: 'Source/WebKit/Shared/Sandbox/common.sb' },
            { label: 'iOS/common.sb', path: 'Source/WebKit/Shared/Sandbox/iOS/common.sb' }
          ]
        }
      ])
    );
    const c3Commits = el('div', 'insights-chip-list');
    [
      ['4994f537ea', 'Add (with telemetry) to MIG syscall ("gather some telemetry first before blocking")'],
      ['d5c48f8a19', 'Block MIG syscalls after launch once telemetry confirmed zero post-launch usage'],
      ['9167490750', 'Toggle runtime syscall telemetry via private sandbox_enable_state_flag SPI'],
      ['0e5778bebe', 'Allow sysctl-reads after iOS 14 telemetry revealed silent image decoding violations'],
      ['ba762580c0', 'Add (log-streaming) diagnosticd access for !is-apple-signed-executable (local debug)'],
      ['66e7f7b2c5', 'Remove 3P diagnosticd (log-streaming) rule from WebContent sandbox'],
      ['9e4f688854', 'Revert "Address kernel MIG sandbox telemetry" after introducing crashes']
    ].forEach((p) => c3Commits.appendChild(createCommitChip(p[0], p[1])));
    card3.appendChild(c3Commits);
    const c3Actions = el('div', 'insight-card-actions');
    c3Actions.appendChild(createFilterActionButton('Data View: 276 Security Hardening Commits', { category: 'security-hardening', bucket: 'year', stackBy: 'effect' }));
    c3Actions.appendChild(createFilterActionButton('Data View: 113 Telemetry Commits', { category: 'telemetry-logging', bucket: 'year', stackBy: 'profile' }, true));
    c3Actions.appendChild(createFilterActionButton('Data View: 76 Reverts', { category: 'revert', bucket: 'year', stackBy: 'effect' }, true));
    card3.appendChild(c3Actions);
    cardsContainer.appendChild(card3);

    // -------------------------------------------------------------------------
    // INSIGHT CARD 4: Default-Deny Kernel Whitelists (macOS vs. iOS)
    // -------------------------------------------------------------------------
    const card4 = el('article', 'insight-data-card');
    const c4Hdr = el('div', 'insight-data-card-header');
    c4Hdr.appendChild(el('span', 'insight-card-num', 'INSIGHT 4 \u00B7 KERNEL PRIMITIVE WHITELISTS'));
    c4Hdr.appendChild(el('span', 'insight-card-stat-badge', '88.2% iOS-Only \u00B7 134/550 Syscalls'));
    card4.appendChild(c4Hdr);
    card4.appendChild(el('h4', 'insight-data-card-title', 'Why Chromium Code Works on macOS Yet Traps on iOS: Strict Default-Deny Kernel Whitelists'));

    card4.appendChild(
      buildHorizontalMeterChart(
        'Figure 4A: Allowed Kernel Primitives in iOS WebKit Profiles (HEAD *-defines.sb) vs. macOS Seatbelt',
        'Click any domain to filter historical commits',
        [
          {
            label: 'Unix Syscalls (syscall-unix \u00B7 271 commits)',
            sublabel: 'macOS: ~All allowed | iOS WebContent: 134/550 (91 Lockdown, 10 pre-launch, 7 QuickLook)',
            rightText: '134 WebContent \u00B7 118 GPU \u00B7 154 Net',
            pct: 24.4,
            color: '#dc2626',
            filter: { resource: 'syscall-unix', bucket: 'year', stackBy: 'effect' }
          },
          {
            label: 'Mach Traps & MIG Routines (85 commits)',
            sublabel: 'macOS: All allowed | iOS WebContent: 40 MSC_* traps + ~38 MIG routines',
            rightText: '40 WebContent \u00B7 39 GPU \u00B7 36 Net',
            pct: 38.0,
            color: '#d97706',
            filter: { resource: 'syscall-mach', bucket: 'year', stackBy: 'effect' }
          },
          {
            label: 'File Descriptor Control (system-fcntl \u00B7 23 commits)',
            sublabel: 'macOS: All F_* allowed | iOS GPU allows only 8 F_* commands (WebContent/Net: 17)',
            rightText: '8 GPU \u00B7 17 WebContent/Net',
            pct: 16.0,
            color: '#4f46e5',
            filter: { resource: 'fcntl', bucket: 'year', stackBy: 'effect' }
          },
          {
            label: 'Sysctl Reads & Socket Options (120 commits)',
            sublabel: 'iOS WebContent: 45 sysctls; Networking: explicit socket-option-get/set allowlist',
            rightText: '45 sysctls \u00B7 Explicit sockopts',
            pct: 28.0,
            color: '#0891b2',
            filter: { resource: 'sysctl', bucket: 'year', stackBy: 'effect' }
          },
          {
            label: 'Filesystem Paths (file-read* / file-write* \u00B7 347 commits)',
            sublabel: 'Zero direct file creation in WebContent/GPU; brokered via UIProcess extensions',
            rightText: '347 commits (37.8%)',
            pct: 37.8,
            color: '#16a34a',
            filter: { resource: 'file', bucket: 'year', stackBy: 'effect' }
          }
        ],
        0
      )
    );

    card4.appendChild(
      createBulletList([
        { lead: '811 of 919 Commits (88.2%) Never Touch macOS', text: 'macOS Seatbelt does not filter syscall-unix, syscall-mach, syscall-mig, or system-fcntl by default.' },
        { lead: 'POSIX File Calls Gated on QuickLook in WebContent', text: 'In webcontent-defines.sb, SYS_unlink, SYS_rmdir, SYS_mkdirat, and SYS_sendto are only allowed when EnableQuickLookSandboxResources is defined.' },
        { lead: 'Only 8 fcntl Commands in GPU Process', text: 'gpu-defines.sb permits only F_ADDFILESIGS_RETURN, F_DUPFD, F_DUPFD_CLOEXEC, F_GETFD, F_GETFL, F_GETPATH, F_SETFD, and F_SETFL.' }
      ])
    );
    const c4Commits = el('div', 'insights-chip-list');
    [
      ['5dce7a7cf7', 'Adjust WebContent system-fcntl allowlist based on telemetry'],
      ['66efa46ff0', 'Allow F_GETPROTECTIONCLASS fcntl in GPU process after telemetry denials'],
      ['81084d1e70', 'Tighten socket-option allowlist in Networking process'],
      ['b18ed44e40', 'Allow SYS_fstatfs in GPU process ("Allow required syscall")']
    ].forEach((p) => c4Commits.appendChild(createCommitChip(p[0], p[1])));
    card4.appendChild(c4Commits);
    const c4Actions = el('div', 'insight-card-actions');
    c4Actions.appendChild(createFilterActionButton('Data View: 271 syscall-unix Commits', { resource: 'syscall-unix', bucket: 'year', stackBy: 'effect' }));
    c4Actions.appendChild(createFilterActionButton('Data View: 85 Mach / MIG Commits', { resource: 'syscall-mach', bucket: 'year', stackBy: 'effect' }, true));
    c4Actions.appendChild(createFilterActionButton('Data View: 97 sysctl Commits', { resource: 'sysctl', bucket: 'year', stackBy: 'effect' }, true));
    card4.appendChild(c4Actions);
    cardsContainer.appendChild(card4);

    // -------------------------------------------------------------------------
    // INSIGHT CARD 5: Two-Phase Post-Launch Lockdown & Lockdown Mode
    // -------------------------------------------------------------------------
    const card5 = el('article', 'insight-data-card');
    const c5Hdr = el('div', 'insight-data-card-header');
    c5Hdr.appendChild(el('span', 'insight-card-num', 'INSIGHT 5 \u00B7 TWO-PHASE LAUNCH & LOCKDOWN MODE'));
    c5Hdr.appendChild(el('span', 'insight-card-stat-badge', '19 Post-Launch & 50 Lockdown Revocations'));
    card5.appendChild(c5Hdr);
    card5.appendChild(el('h4', 'insight-data-card-title', 'Dynamic State Flags Revoke Syscalls & Mach Traps Mid-Process After Launch and in Lockdown Mode'));

    card5.appendChild(
      buildHorizontalMeterChart(
        'Figure 5A: Progressive Syscall & Mach Trap Revocation Across WebContent Execution States',
        'Click any stage to inspect commits',
        [
          {
            label: 'Stage 1: Process Startup Warmup (Before WebContentProcessLaunched)',
            sublabel: 'Allows dylib linking, thread pool registration, timebase init, & malloc ranges',
            rightText: '134 SYS_* \u00B7 40 MSC_* \u00B7 38 MIG',
            pct: 100,
            color: '#16a34a',
            filter: { search: 'launch', bucket: 'year', stackBy: 'effect' }
          },
          {
            label: 'Stage 2: Post-Launch State Flag (WebContentProcessLaunched Set)',
            sublabel: 'Revokes 10 Unix syscalls (SYS_connect, SYS_proc_info, SYS_getrlimit...), 2 Mach traps, 5 MIG, 2 sysctls',
            rightText: '-19 primitives revoked mid-flight',
            pct: 84,
            color: '#d97706',
            filter: { search: 'launch', bucket: 'year', stackBy: 'effect' }
          },
          {
            label: 'Stage 3: Lockdown Mode (EnhancedSecurity Defined)',
            sublabel: 'Revokes JIT (dynamic-code-generation) + 33 Unix syscalls + 5 Mach traps + 12 MIG (clock_get_time)',
            rightText: '-50 more primitives + No JIT (91 SYS_* left)',
            pct: 61,
            color: '#dc2626',
            filter: { search: 'Lockdown', bucket: 'year', stackBy: 'effect' }
          }
        ],
        0
      )
    );

    card5.appendChild(
      createBulletList([
        { lead: 'Post-Launch Traps Catch Lazy Init', text: 'Once WebContentProcessLaunched is set, MSC_mach_timebase_info_trap, MSC_task_self_trap, host_info, kern.boottime, and SYS_proc_info are blocked \u2014 breaking lazy Chromium timer/allocator init.' },
        { lead: 'Lockdown Mode Strips 50 Additional Primitives', text: 'EnhancedSecurity blocks 33 Unix syscalls, 5 Mach traps, and 12 MIG routines (including clock_get_time).' },
        { lead: 'Even Apple\u2019s ICU Broke in Lockdown Mode', text: 'Commit 7395b2831b had to re-allow pthread syscalls in Lockdown Mode after ICU\u2019s detectHostTimeZone crashed.' }
      ])
    );
    const c5Commits = el('div', 'insights-chip-list');
    [
      ['7ddd37b4ad', 'Block access to syscalls that are only used during process launch'],
      ['568ff7623f', 'Allow 2 syscalls in WebContent only before process launch state flag'],
      ['7395b2831b', 'Fix Lockdown Mode crash: allow pthread syscalls required by ICU detectHostTimeZone'],
      ['46d0ad2574', 'Fix syscall sandbox violations in Lockdown Mode (WebContent)']
    ].forEach((p) => c5Commits.appendChild(createCommitChip(p[0], p[1])));
    card5.appendChild(c5Commits);
    const c5Actions = el('div', 'insight-card-actions');
    c5Actions.appendChild(createFilterActionButton('Data View: Process Launch State Commits', { search: 'launch', bucket: 'year', stackBy: 'effect' }));
    c5Actions.appendChild(createFilterActionButton('Data View: Lockdown Mode Commits', { search: 'Lockdown', bucket: 'year', stackBy: 'effect' }, true));
    card5.appendChild(c5Actions);
    cardsContainer.appendChild(card5);

    // -------------------------------------------------------------------------
    // INSIGHT CARD 6: Direct Evidence from BrowserEngineKit (!is-apple-signed-executable)
    // -------------------------------------------------------------------------
    const card6 = el('article', 'insight-data-card');
    const c6Hdr = el('div', 'insight-data-card-header');
    c6Hdr.appendChild(el('span', 'insight-card-num', 'INSIGHT 6 \u00B7 BROWSERENGINEKIT 3P DIVERGENCE'));
    c6Hdr.appendChild(el('span', 'insight-card-stat-badge', '8 Direct 3P Engine Sandbox Commits'));
    card6.appendChild(c6Hdr);
    card6.appendChild(el('h4', 'insight-data-card-title', 'Real-World BrowserEngineKit Fixes Prove 1P Hardening Breaks 3P Engines (!is-apple-signed-executable)'));

    card6.appendChild(
      buildHorizontalMeterChart(
        'Figure 6A: Third-Party BrowserEngineKit Conditionals in WebKit iOS Sandbox Profiles (HEAD)',
        'Click any row to inspect matching commits',
        [
          {
            label: '!is-apple-signed-executable in Networking (c01e8de3c1)',
            sublabel: 'Restores container /tmp and /Library/Caches after 1P hardening (b148037850) broke 3P engines',
            rightText: 'Networking: /tmp & /Library/Caches',
            pct: 100,
            color: '#0284c7',
            filter: { search: 'is-apple-signed-executable', bucket: 'year', stackBy: 'effect' }
          },
          {
            label: '!is-apple-signed-executable in GPU (33cc299a31)',
            sublabel: 'Grants SYS_mkdirat so 3P rendering extensions can call mkdtemp() without crashing',
            rightText: 'GPU: SYS_mkdirat (mkdtemp)',
            pct: 85,
            color: '#0284c7',
            filter: { search: 'is-apple-signed-executable', bucket: 'year', stackBy: 'effect' }
          },
          {
            label: '!is-apple-signed-executable Diagnostic Logging (ba762580c0)',
            sublabel: 'Allows com.apple.diagnosticd Mach lookup so 3P engines can stream os_log',
            rightText: 'Shared: com.apple.diagnosticd',
            pct: 70,
            color: '#0284c7',
            filter: { search: 'is-apple-signed-executable', bucket: 'year', stackBy: 'effect' }
          },
          {
            label: 'sandbox-version-2 / local:tested_version_2.0 (f1f264edcf, 3578a0f4e7)',
            sublabel: 'Backs applyRestrictedSandbox(revision: .revision2) \u2014 monolithic opt-in across 3 profiles',
            rightText: '.revision2 (All-or-Nothing)',
            pct: 90,
            color: '#7c3aed',
            filter: { search: 'tested_version_2', bucket: 'year', stackBy: 'effect' }
          }
        ],
        0
      )
    );

    card6.appendChild(
      createBulletList([
        { lead: 'Networking Container Breakage & Fix', text: 'Commits b148037850 & e62ea2ac63 blocked container file access in Networking (fine for WebKit, which brokers via UIProcess), breaking 3P engines until c01e8de3c1 added a !is-apple-signed-executable exemption.' },
        { lead: 'GPU mkdtemp Crash in 3P Engines', text: '3P GPU extensions calling POSIX mkdtemp() crashed because SYS_mkdirat was missing from gpu-defines.sb until 33cc299a31.' },
        { lead: 'Coarse Feature Flags', text: 'RenderingExtension.enableFeature(.coreML) (666daa6403) and .revision2 (f1f264edcf) expose coarse switches rather than per-primitive control.' }
      ])
    );
    const c6Commits = el('div', 'insights-chip-list');
    [
      ['c01e8de3c1', 'Restore container /tmp and /Library/Caches in Networking for !is-apple-signed-executable'],
      ['33cc299a31', 'Allow SYS_mkdirat in GPU for !is-apple-signed-executable (mkdtemp in 3P engines)'],
      ['ba762580c0', 'Allow com.apple.diagnosticd Mach lookup for !is-apple-signed-executable'],
      ['f1f264edcf', 'Introduce sandbox-version-2 (local:tested_version_2.0) for BrowserEngineKit .revision2'],
      ['666daa6403', 'Support RenderingExtension.enableFeature(.coreML) via local:FeatureCoreMLDisabled']
    ].forEach((p) => c6Commits.appendChild(createCommitChip(p[0], p[1])));
    card6.appendChild(c6Commits);
    const c6Actions = el('div', 'insight-card-actions');
    c6Actions.appendChild(createFilterActionButton('Data View: !is-apple-signed-executable Commits', { search: 'is-apple-signed-executable', bucket: 'year', stackBy: 'effect' }));
    c6Actions.appendChild(createFilterActionButton('Data View: sandbox-version-2 (.revision2) Commits', { search: 'tested_version_2', bucket: 'year', stackBy: 'effect' }, true));
    c6Actions.appendChild(createFilterActionButton('Data View: All 8 3p-specific Commits', { tag: '3p-specific', bucket: 'year', stackBy: 'effect' }, true));
    card6.appendChild(c6Actions);
    cardsContainer.appendChild(card6);

    container.appendChild(cardsContainer);
  }

  function toggleFilter(field, value) {
    if (state[field] === value) {
      state[field] = 'all';
    } else {
      state[field] = value;
    }
    state.page = 1;
    refreshAll({ pushHistory: true });
  }

  function resetAllFilters() {
    resetAllFiltersQuiet();
    refreshAll({ pushHistory: true });
  }

  function exportFilteredCsv() {
    const headers = [
      'date',
      'hash',
      'category',
      'category_label',
      'effect',
      'effect_label',
      'trigger',
      'trigger_label',
      'sb_only',
      'touches_mac_sb',
      'profiles',
      'resources',
      'tags',
      'summary',
      'subject',
      'author',
      'github_url'
    ];
    const escapeCsv = (val) => {
      const s = String(val === undefined || val === null ? '' : val);
      if (/[",\n\r]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    };
    const rows = [headers.join(',')];
    filteredCommits.forEach((c) => {
      rows.push(
        [
          c.date,
          c.hash,
          c.category,
          c.category_label,
          c.effect,
          c.effect_label,
          c.trigger || '',
          c.trigger_label || '',
          c.sb_only ? 'true' : 'false',
          c.touches_mac_sb ? 'true' : 'false',
          (c.profiles || []).join(';'),
          (c.resources || []).join(';'),
          (c.tags || []).join(';'),
          c.summary,
          c.subject,
          c.author,
          safeGithubCommitUrl(c.hash, c.github_url)
        ]
          .map(escapeCsv)
          .join(',')
      );
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = 'webkit_ios_sandbox_changes.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function refreshAll(opts) {
    const skipHistory = Boolean(opts && opts.skipHistory);
    const pushHistory = Boolean(opts && opts.pushHistory);
    syncControlsFromState();
    if (!skipHistory) {
      syncStateToHistory(pushHistory);
    }
    applyFilters();
    renderKpiCards();
    renderQuickCategoryPills();
    renderMainChart();
    renderBreakdowns();
    renderTable();
  }

  function setBreakdownTab(tabName) {
    const changed = state.breakdownTab !== tabName;
    state.breakdownTab = tabName;
    syncControlsFromState();
    syncStateToHistory(changed);
    renderBreakdowns();
  }

  function bindEvents() {
    const viewExplorerBtn = document.getElementById('viewTabExplorer');
    const viewInsightsBtn = document.getElementById('viewTabInsights');
    if (viewExplorerBtn) {
      viewExplorerBtn.addEventListener('click', () => switchView('explorer'));
    }
    if (viewInsightsBtn) {
      viewInsightsBtn.addEventListener('click', () => switchView('insights'));
    }

    document.getElementById('toggleMethodologyBtn').addEventListener('click', () => {
      const panel = document.getElementById('methodologyPanel');
      const btn = document.getElementById('toggleMethodologyBtn');
      const isHidden = panel.classList.toggle('hidden');
      btn.setAttribute('aria-expanded', String(!isHidden));
    });

    document.getElementById('filterCategory').addEventListener('change', (e) => {
      state.category = e.target.value;
      state.page = 1;
      refreshAll({ pushHistory: true });
    });
    document.getElementById('filterEffect').addEventListener('change', (e) => {
      state.effect = e.target.value;
      state.page = 1;
      refreshAll({ pushHistory: true });
    });
    const trigEl = document.getElementById('filterTrigger');
    if (trigEl) {
      trigEl.addEventListener('change', (e) => {
        state.trigger = e.target.value;
        state.page = 1;
        refreshAll({ pushHistory: true });
      });
    }
    document.getElementById('filterProfile').addEventListener('change', (e) => {
      state.profile = e.target.value;
      state.page = 1;
      refreshAll({ pushHistory: true });
    });
    document.getElementById('filterResource').addEventListener('change', (e) => {
      state.resource = e.target.value;
      state.page = 1;
      refreshAll({ pushHistory: true });
    });
    const tagEl = document.getElementById('filterTag');
    if (tagEl) {
      tagEl.addEventListener('change', (e) => {
        state.tag = e.target.value;
        state.page = 1;
        refreshAll({ pushHistory: true });
      });
    }
    document.getElementById('filterStartDate').addEventListener('change', (e) => {
      state.startDate = e.target.value;
      state.page = 1;
      refreshAll({ pushHistory: true });
    });
    document.getElementById('filterEndDate').addEventListener('change', (e) => {
      state.endDate = e.target.value;
      state.page = 1;
      refreshAll({ pushHistory: true });
    });
    document.getElementById('filterSearch').addEventListener('input', (e) => {
      state.search = e.target.value;
      state.page = 1;
      refreshAll({ pushHistory: false });
    });

    document.getElementById('resetFiltersBtn').addEventListener('click', resetAllFilters);
    document.getElementById('exportCsvBtn').addEventListener('click', exportFilteredCsv);

    document.getElementById('chartBucketSelect').addEventListener('change', (e) => {
      state.bucket = e.target.value;
      refreshAll({ pushHistory: true });
    });
    document.getElementById('chartStackSelect').addEventListener('change', (e) => {
      state.stackBy = e.target.value;
      refreshAll({ pushHistory: true });
    });
    document.getElementById('scaleAbsoluteBtn').addEventListener('click', () => {
      state.scale = 'absolute';
      refreshAll({ pushHistory: true });
    });
    document.getElementById('scaleRelativeBtn').addEventListener('click', () => {
      state.scale = 'relative';
      refreshAll({ pushHistory: true });
    });

    document.getElementById('tabProfilesBtn').addEventListener('click', () => setBreakdownTab('profiles'));
    document.getElementById('tabResourcesBtn').addEventListener('click', () => setBreakdownTab('resources'));
    const tabTrigBtn = document.getElementById('tabTriggersBtn');
    if (tabTrigBtn) {
      tabTrigBtn.addEventListener('click', () => setBreakdownTab('triggers'));
    }
    const tabTagsBtn = document.getElementById('tabTagsBtn');
    if (tabTagsBtn) {
      tabTagsBtn.addEventListener('click', () => setBreakdownTab('tags'));
    }

    document.getElementById('tableSortSelect').addEventListener('change', (e) => {
      state.sort = e.target.value;
      state.page = 1;
      refreshAll({ pushHistory: true });
    });
    document.getElementById('tablePageSizeSelect').addEventListener('change', (e) => {
      state.pageSize = parseInt(e.target.value, 10) || 100;
      state.page = 1;
      refreshAll({ pushHistory: false });
    });

    const goPrev = () => {
      if (state.page > 1) {
        state.page -= 1;
        syncStateToHistory(false);
        renderTable();
      }
    };
    const goNext = () => {
      const totalPages = Math.max(1, Math.ceil(filteredCommits.length / state.pageSize));
      if (state.page < totalPages) {
        state.page += 1;
        syncStateToHistory(false);
        renderTable();
      }
    };
    document.getElementById('prevPageBtn').addEventListener('click', goPrev);
    document.getElementById('prevPageBottomBtn').addEventListener('click', goPrev);
    document.getElementById('nextPageBtn').addEventListener('click', goNext);
    document.getElementById('nextPageBottomBtn').addEventListener('click', goNext);

    // Table header click sorting
    document.querySelectorAll('#changesTable thead th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort');
        if (key === 'date') {
          state.sort = state.sort === 'date-desc' ? 'date-asc' : 'date-desc';
        } else if (key === 'category') {
          state.sort = 'category-asc';
        } else if (key === 'effect') {
          state.sort = 'effect-asc';
        } else if (key === 'rules') {
          state.sort = 'rules-desc';
        }
        state.page = 1;
        refreshAll({ pushHistory: true });
      });
    });

    window.addEventListener('popstate', (ev) => {
      if (ev.state && typeof ev.state === 'object' && ev.state.view) {
        applyStateSnapshot(ev.state);
      } else {
        loadStateFromHash();
      }
      refreshAll({ skipHistory: true });
    });

    window.addEventListener('resize', () => {
      if (state.view === 'explorer') {
        renderMainChart();
      }
    });
  }

  function init() {
    const payload = window.__WKANALYZE_SANDBOX_DATA__;
    if (!payload || !Array.isArray(payload.commits)) {
      document.getElementById('datasetMetaBadge').textContent = 'Dataset failed to load';
      return;
    }

    allCommits = payload.commits;
    const meta = payload.metadata || {};
    const minDate = meta.min_date || (allCommits.length ? allCommits[allCommits.length - 1].date : '');
    const maxDate = meta.max_date || (allCommits.length ? allCommits[0].date : '');
    document.getElementById('datasetMetaBadge').textContent =
      formatNumber(allCommits.length) + ' commits \u00B7 ' + minDate + ' to ' + maxDate;

    loadStateFromHash();
    populateFilterControls();
    renderInsightsView();
    bindEvents();
    refreshAll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

