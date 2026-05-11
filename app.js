/* ══════════════════════════════════════════════════════════════
   CX MODULE ROUTER — Hub + 3 module navigation
══════════════════════════════════════════════════════════════ */
const CX_MODULES = ['hub', 'prospecting', 'opportunity', 'rfx'];
let currentModule = 'hub';

const MODULE_ID_MAP = {
  hub:          'cxHub',
  prospecting:  'cxProspecting',
  opportunity:  'cxOpportunity',
  rfx:          'cxRfx'
};

function showModule(id) {
  if (!CX_MODULES.includes(id)) return;
  currentModule = id;
  CX_MODULES.forEach(m => {
    const el = document.getElementById(MODULE_ID_MAP[m]);
    if (el) el.classList.toggle('hidden', m !== id);
  });
  // Update global nav active state
  document.querySelectorAll('[data-cx-module]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cxModule === id);
  });
  // Update nav context label
  const labels = { hub: 'SDR Command Centre', prospecting: 'Prospecting', opportunity: 'Opportunity Developer', rfx: 'RFX Evaluator' };
  const navCtx = document.getElementById('navContext');
  if (navCtx) navCtx.textContent = labels[id] || 'SDR Command Centre';
  window.scrollTo(0, 0);
}

/* ══════════════════════════════════════════════════════════════
   WORKSPACE — selector, theming, company profile
══════════════════════════════════════════════════════════════ */
function isUniversal() {
  return sessionStorage.getItem('cx_workspace') === 'universal';
}

function getCompanyName() {
  if (isUniversal()) {
    try {
      const p = JSON.parse(localStorage.getItem('cx_company_profile') || '{}');
      return p.name || 'your company';
    } catch { return 'your company'; }
  }
  return 'Intretech';
}

function applyWorkspace() {
  const ws = sessionStorage.getItem('cx_workspace') || 'intretech';
  document.body.classList.remove('ws-intretech', 'ws-universal');
  document.body.classList.add('ws-' + ws);

  // Update nav context label
  const navCtx = document.getElementById('navContext');
  if (navCtx && navCtx.textContent === 'SDR Command Centre') {
    navCtx.textContent = ws === 'universal' ? 'Universal Workstation' : 'Intretech Workstation';
  }

  // Update hub hero subtitle for universal
  const hubSub = document.querySelector('.hub-subtitle');
  if (hubSub && ws === 'universal') {
    hubSub.textContent = 'Your SDR Command Centre. Choose your workstream.';
  }

  // Show/hide company profile card
  const cpCard = document.getElementById('companyProfileCard');
  if (cpCard) cpCard.style.display = ws === 'universal' ? '' : 'none';

  // Update login page branding for universal mode
  const loginSub = document.querySelector('.login-sub');
  if (loginSub) loginSub.textContent = ws === 'universal' ? 'SDR Command Centre · Universal Workstation' : 'SDR Command Centre · Intretech';

  const loginHint = document.querySelector('.login-hint');
  if (loginHint) loginHint.textContent = ws === 'universal' ? 'CoalitionX · authorised users only.' : 'Intretech internal tool — authorised users only.';

  // Update footer strip
  document.querySelectorAll('.footer-company-label').forEach(el => {
    el.textContent = ws === 'universal' ? 'CoalitionX · SDR Command Centre' : 'Intretech · CoalitionX SDR Command Centre';
  });

  // Update version badge
  const verBadge = document.querySelector('.version-badge');
  if (verBadge) verBadge.textContent = ws === 'universal' ? 'SDR Command Centre · Universal Workstation' : 'SDR Command Centre · Intretech';
}

/* ══════════════════════════════════════════════════════════════
   AUTH — server-side login; credentials never stored in client JS
══════════════════════════════════════════════════════════════ */
function cxIsLoggedIn() {
  return !!(sessionStorage.getItem('cx_user') && sessionStorage.getItem('cx_token'));
}

function cxGetUser() {
  try { return JSON.parse(sessionStorage.getItem('cx_user')); } catch { return null; }
}

function cxGetToken() {
  return sessionStorage.getItem('cx_token') || '';
}

/* Server-side login — returns { ok, name, email } or { ok: false, error } */
async function cxLogin(email, password) {
  // Local fallback when running as file:// (dev mode only)
  if (location.protocol === 'file:' || location.hostname === 'localhost') {
    // Dev-only placeholder — no real credentials stored here
    if (email && password) {
      const fakeToken = btoa(`${email}:${Math.floor(Date.now()/86400000)}:devmode`);
      sessionStorage.setItem('cx_user', JSON.stringify({ email, name: 'Dev User' }));
      sessionStorage.setItem('cx_token', fakeToken);
      return { ok: true, name: 'Dev User', email };
    }
    return { ok: false, error: 'Invalid credentials.' };
  }
  try {
    const res = await fetch('/api/auth-login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      sessionStorage.setItem('cx_user',  JSON.stringify({ email: data.email, name: data.name }));
      sessionStorage.setItem('cx_token', data.token);
      return { ok: true, name: data.name, email: data.email };
    }
    return { ok: false, error: data.error || 'Invalid credentials.' };
  } catch {
    return { ok: false, error: 'Network error — please try again.' };
  }
}

function cxLogout() {
  sessionStorage.removeItem('cx_user');
  sessionStorage.removeItem('cx_token');
  location.reload();
}

/* Attach auth token to every internal API fetch */
function authFetch(url, options = {}) {
  const token = cxGetToken();
  const headers = { ...(options.headers || {}), ...(token ? { 'Authorization': `Bearer ${token}` } : {}) };
  return fetch(url, { ...options, headers });
}

/* ══════════════════════════════════════════════════════════════
   ROUTER — Page-mode navigation (tab → full-width page)
══════════════════════════════════════════════════════════════ */
const TAB_LABELS = {
  strategy:   'GTM Strategy',
  accounts:   'Account Suggestions',
  product:    'Product Match',
  news:       'News & Signals',
  outreach:   'Outreach Sequence',
  call:       'Call Script',
  research:   'Research & Sources',
  competitor: 'Competitor Intel',
  awards:     'Awards & Signals',
  swot:       'SWOT Analysis',
  evaluation: 'RFX Evaluation',
  playbook:   'Account Playbook'
};
const TAB_ORDER = Object.keys(TAB_LABELS);

let isPageMode = false;
let currentPageTab = null;

function enterPageMode(tabId) {
  // Legacy function — in new architecture tabs are inline within the module.
  // Just switch the active tab panel.
  isPageMode = true;
  currentPageTab = tabId;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === tabId));
}

function exitPageMode() {
  // Legacy function — kept for compatibility. New architecture uses showModule().
  isPageMode = false;
  currentPageTab = null;
}

function syncNavTabs(activeTab) {
  // Legacy — no-op in new architecture (module router handles nav state)
}

/* ══════════════════════════════════════════════════════════════
   ADMIN PORTAL
══════════════════════════════════════════════════════════════ */
const AdminPortal = {
  open() {
    document.getElementById('adminPortal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    this.loadSaved();
    const u = cxGetUser();
    if (u) {
      document.getElementById('adminUserLabel').textContent = u.email;
      document.getElementById('adminStatusUserName').textContent = u.name || u.email;
    }
    // Show/hide company profile card based on workspace
    const cpCard = document.getElementById('companyProfileCard');
    if (cpCard) cpCard.style.display = isUniversal() ? '' : 'none';
    // Populate company profile fields if universal
    if (isUniversal()) {
      try {
        const cp = JSON.parse(localStorage.getItem('cx_company_profile') || '{}');
        const cnEl = document.getElementById('companyName');
        const cdEl = document.getElementById('companyDesc');
        const ccEl = document.getElementById('companyCapabilities');
        const cvEl = document.getElementById('companyVerticals');
        if (cnEl && cp.name) cnEl.value = cp.name;
        if (cdEl && cp.desc) cdEl.value = cp.desc;
        if (ccEl && cp.capabilities) ccEl.value = cp.capabilities;
        if (cvEl && cp.verticals) cvEl.value = cp.verticals;
      } catch { /* ignore */ }
    }
  },
  close() {
    document.getElementById('adminPortal').classList.add('hidden');
    document.body.style.overflow = '';
  },
  loadSaved() {
    const cfg = this.getConfig();
    const apKeyEl = document.getElementById('apKey');
    if (apKeyEl && cfg.apKey) apKeyEl.value = cfg.apKey;
    const prefs = this.getPrefs();
    if (prefs.name)    { const el = document.getElementById('adminName'); if (el) el.value = prefs.name; }
    if (prefs.team)    { const el = document.getElementById('adminTeam'); if (el) el.value = prefs.team; }
    if (prefs.vertical){ const el = document.getElementById('adminDefaultVertical'); if (el) el.value = prefs.vertical; }
    if (prefs.tone)    { const el = document.getElementById('adminDefaultTone'); if (el) el.value = prefs.tone; }
    this.updateStatusBar();
  },
  getConfig() {
    try { return JSON.parse(localStorage.getItem('cx_admin_cfg') || '{}'); } catch { return {}; }
  },
  saveConfig(patch) {
    const cfg = { ...this.getConfig(), ...patch };
    localStorage.setItem('cx_admin_cfg', JSON.stringify(cfg));
  },
  getPrefs() {
    try { return JSON.parse(localStorage.getItem('cx_admin_prefs') || '{}'); } catch { return {}; }
  },
  savePrefs(patch) {
    const prefs = { ...this.getPrefs(), ...patch };
    localStorage.setItem('cx_admin_prefs', JSON.stringify(prefs));
  },
  setStatus(dotId, labelId, connected, msg) {
    const dot   = document.getElementById(dotId);
    const label = document.getElementById(labelId);
    if (dot) { dot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected'); }
    if (label) label.textContent = msg;
  },
  updateStatusBar() {
    const cfg = this.getConfig();
    const setBar = (id, connected) => {
      const el = document.getElementById(id);
      if (!el) return;
      const dot = el.querySelector('.status-dot');
      const strong = el.querySelector('strong');
      if (dot) dot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
      if (strong) strong.textContent = connected ? 'Connected' : 'Disconnected';
    };
    setBar('adminStatusHs', !!(cfg.hsOAuth || cfg.hsToken));
    // AI is always connected — key is server-side
    setBar('adminStatusAi', true);
    setBar('adminStatusAp', !!cfg.apKey);
    if (cfg.hsOAuth || cfg.hsToken) this.setStatus('hsDot', 'hsStatusLabel', true, 'Connected via OAuth ✓');
    // Always show AI as configured
    this.setStatus('aiDot', 'aiStatusLabel', true, 'Claude AI · Configured');
    if (cfg.apKey) this.setStatus('apDot', 'apStatusLabel', true, 'Key saved');
  },
  result(id, msg, ok) {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.className = 'admin-result ' + (ok ? 'ok' : 'err'); }
  }
};

/* ══════════════════════════════════════════════════════════════
   BOOT — show login or app
══════════════════════════════════════════════════════════════ */
(function bootCX() {
  const loginOverlay = document.getElementById('cxLogin');
  const appShell     = document.getElementById('appShell');
  const globalNav    = document.getElementById('globalNav');

  function bootIntoApp() {
    loginOverlay.classList.add('hidden');
    appShell.classList.remove('hidden');
    globalNav.classList.remove('hidden');
    applyWorkspace();
    showModule('hub');
    applyUserPrefs();
    updateNavAccount();
    // Show user greeting on hub
    const u = cxGetUser();
    const greet = document.getElementById('hubUserGreet');
    if (greet && u) greet.textContent = `Welcome, ${u.name || u.email}`;
    // Mount legacy RFX scoring tool in its new location
    setTimeout(mountLegacyRfxScoring, 100);
  }

  if (cxIsLoggedIn()) {
    bootIntoApp();
  } else {
    loginOverlay.classList.remove('hidden');
  }

  // Workspace selector buttons (before login)
  document.querySelectorAll('.workspace-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.workspace-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      sessionStorage.setItem('cx_workspace', btn.dataset.workspace);
      applyWorkspace();
    });
  });

  // Login form submit — calls server-side /api/auth-login
  document.getElementById('loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const submitBtn = document.querySelector('.login-submit');
    const email = document.getElementById('loginEmail').value.trim();
    const pass  = document.getElementById('loginPassword').value;
    if (submitBtn) { submitBtn.textContent = 'Signing in…'; submitBtn.disabled = true; }
    const result = await cxLogin(email, pass);
    if (result.ok) {
      loginOverlay.classList.add('cx-login-exit');
      setTimeout(() => {
        bootIntoApp();
      }, 380);
    } else {
      document.getElementById('loginError').textContent = result.error || 'Incorrect email or password — please try again.';
      document.getElementById('loginError').classList.remove('hidden');
      document.getElementById('loginPassword').value = '';
      document.getElementById('loginPassword').focus();
      if (submitBtn) { submitBtn.textContent = 'Sign in to CoalitionX →'; submitBtn.disabled = false; }
    }
  });

  // Clear error on input change
  ['loginEmail', 'loginPassword'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      document.getElementById('loginError').classList.add('hidden');
    });
  });
})();

function applyUserPrefs() {
  const prefs = AdminPortal.getPrefs();
  if (prefs.vertical) {
    const v = document.getElementById('vertical');
    if (v) v.value = prefs.vertical;
  }
  if (prefs.tone) {
    const t = document.getElementById('tone');
    if (t) t.value = prefs.tone;
  }
}

function updateNavAccount() {
  const acct = document.getElementById('briefAccount')?.textContent;
  const navAcct = document.getElementById('navAccount');
  if (navAcct) navAcct.textContent = acct && acct !== 'No account selected' ? acct : '';
}

/* ══════════════════════════════════════════════════════════════
   GLOBAL NAV & ADMIN PORTAL EVENT WIRING
══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  // Global nav logout
  document.getElementById('navLogout')?.addEventListener('click', cxLogout);
  document.getElementById('adminSignOut')?.addEventListener('click', cxLogout);

  // Open / close admin portal
  document.getElementById('navAdmin')?.addEventListener('click', () => AdminPortal.open());
  document.getElementById('closeAdmin')?.addEventListener('click', () => AdminPortal.close());
  document.getElementById('adminPortal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('adminPortal')) AdminPortal.close();
  });

  // Global nav module routing (new architecture)
  document.querySelectorAll('[data-cx-module]').forEach(btn => {
    btn.addEventListener('click', () => {
      showModule(btn.dataset.cxModule);
    });
  });

  // Visibility toggle for admin password fields
  document.querySelectorAll('.admin-toggle-vis').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (target) target.type = target.type === 'password' ? 'text' : 'password';
    });
  });

  // ── HubSpot admin — OAuth flow ──
  // Check for #hs-connected or #hs-error on page load (redirect from OAuth callback)
  (function checkHsOAuthResult() {
    const hash = window.location.hash;
    if (hash === '#hs-connected') {
      AdminPortal.setStatus('hsDot', 'hsStatusLabel', true, 'Connected via OAuth ✓');
      AdminPortal.result('hsResult', '✓ HubSpot connected. CRM intelligence is now live.', true);
      AdminPortal.saveConfig({ hsOAuth: true });
      AdminPortal.updateStatusBar();
      history.replaceState(null, '', window.location.pathname);
    } else if (hash.startsWith('#hs-error=')) {
      const msg = decodeURIComponent(hash.replace('#hs-error=', ''));
      AdminPortal.setStatus('hsDot', 'hsStatusLabel', false, 'Auth failed');
      AdminPortal.result('hsResult', `✗ HubSpot auth failed: ${msg}`, false);
      history.replaceState(null, '', window.location.pathname);
    }
  })();

  document.getElementById('hsTest')?.addEventListener('click', () => {
    AdminPortal.result('hsResult', 'Testing HubSpot connection…', true);
    authFetch('/api/hubspot-intelligence?account=test')
      .then(async r => {
        const data = await r.json();
        if (r.ok || r.status === 200) {
          AdminPortal.setStatus('hsDot', 'hsStatusLabel', true, 'Connected ✓');
          AdminPortal.result('hsResult', '✓ HubSpot connection verified. CRM intelligence is live.', true);
          AdminPortal.saveConfig({ hsOAuth: true });
          AdminPortal.updateStatusBar();
        } else if (r.status === 503) {
          AdminPortal.setStatus('hsDot', 'hsStatusLabel', false, 'Not connected');
          AdminPortal.result('hsResult', '✗ Not connected yet — click "Connect HubSpot →" to authorise.', false);
        } else {
          AdminPortal.result('hsResult', `✗ Error ${r.status}: ${data.error || 'Unknown error'}`, false);
        }
      })
      .catch(() => AdminPortal.result('hsResult', '✗ Network error — ensure you are on the hosted app.', false));
  });

  // ── AI admin — server-side key, just test the endpoint ──
  document.getElementById('aiTest')?.addEventListener('click', () => {
    AdminPortal.result('aiResult', 'Testing AI connection…', true);
    if (location.protocol === 'file:' || location.hostname === 'localhost') {
      AdminPortal.result('aiResult', '✓ Running locally — AI enrichment active on hosted app.', true);
      AdminPortal.setStatus('aiDot', 'aiStatusLabel', true, 'Claude AI · Configured');
      return;
    }
    authFetch('/api/ai-enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountName: 'connection-test', vertical: 'Smart home / connected devices', role: 'test', signal: 'test', prospect: 'test', notes: '', linkedin: '' })
    }).then(r => {
      if (r.ok || r.status === 429) {
        AdminPortal.setStatus('aiDot', 'aiStatusLabel', true, 'Claude AI · Active ✓');
        AdminPortal.result('aiResult', '✓ AI connection verified. Claude is active and enrichment is live.', true);
        AdminPortal.updateStatusBar();
      } else {
        AdminPortal.result('aiResult', `AI endpoint responded with status ${r.status}. Check Netlify function logs.`, false);
      }
    }).catch(() => AdminPortal.result('aiResult', '✗ Network error contacting AI endpoint.', false));
  });

  // ── Apollo admin ──
  document.getElementById('apSave')?.addEventListener('click', () => {
    AdminPortal.saveConfig({ apKey: document.getElementById('apKey').value.trim() });
    AdminPortal.setStatus('apDot', 'apStatusLabel', true, 'Key saved');
    AdminPortal.result('apResult', 'Apollo key saved. Contact enrichment activates via Netlify functions.', true);
    AdminPortal.updateStatusBar();
  });
  document.getElementById('apTest')?.addEventListener('click', () => {
    const key = document.getElementById('apKey').value.trim();
    if (!key) { AdminPortal.result('apResult', 'Enter your Apollo API key first.', false); return; }
    AdminPortal.result('apResult', 'Apollo connection test requires server-side proxy (Netlify). Key saved for hosted use.', true);
    AdminPortal.saveConfig({ apKey: key });
    AdminPortal.setStatus('apDot', 'apStatusLabel', true, 'Key saved');
    AdminPortal.updateStatusBar();
  });

  // ── User prefs ──
  document.getElementById('adminSavePrefs')?.addEventListener('click', () => {
    AdminPortal.savePrefs({
      name:     document.getElementById('adminName').value.trim(),
      team:     document.getElementById('adminTeam').value.trim(),
      vertical: document.getElementById('adminDefaultVertical').value,
      tone:     document.getElementById('adminDefaultTone').value
    });
    document.getElementById('adminPrefsResult').textContent = '✓ Preferences saved.';
    document.getElementById('adminPrefsResult').className   = 'admin-result ok';
    setTimeout(() => { document.getElementById('adminPrefsResult').textContent = ''; }, 2000);
  });

  // ── Company Profile (Universal Workstation) ──
  document.getElementById('saveCompanyProfile')?.addEventListener('click', () => {
    const profile = {
      name:         (document.getElementById('companyName')?.value || '').trim(),
      desc:         (document.getElementById('companyDesc')?.value || '').trim(),
      capabilities: (document.getElementById('companyCapabilities')?.value || '').trim(),
      verticals:    (document.getElementById('companyVerticals')?.value || '').trim()
    };
    localStorage.setItem('cx_company_profile', JSON.stringify(profile));
    const resEl = document.getElementById('companyProfileResult');
    if (resEl) { resEl.textContent = '✓ Company profile saved.'; resEl.className = 'admin-result ok'; }
    setTimeout(() => { if (resEl) resEl.textContent = ''; }, 2000);
  });
});

const capabilityMap = {
  "Air purification & home appliances": {
    pains: ["EU/US localisation credibility", "IoT differentiation", "prototype-to-NPI conversion", "quality consistency across high-volume assembly"],
    capabilities: ["FATP in China, Malaysia, Hungary and Mexico", "smart manufacturing systems with real-time quality statistics", "air, water and appliance product experience", "in-house tooling, injection moulding, SMT and assembly"],
    proof: "Use Blueair, Versuni, Honeywell, Miele or Stadler Form style angles: prototype kit, pilot line, IoT integration and RFQ readiness.",
    content: "Short technical note: reducing RFQ risk in connected air-treatment products through NPI gates, validation and regional FATP."
  },
  "Medical & health devices": {
    pains: ["regulated quality expectations", "reliability and safety validation", "supplier qualification", "design transfer from concept to production"],
    capabilities: ["ISO13485 referenced capability", "reliability, safety, EMC and compliance testing", "R&D and validation teams", "structured EVT to PVT process"],
    proof: "Lead with credibility, validation discipline and early feasibility review rather than a pure cost story.",
    content: "Article angle: why design-transfer discipline matters before medical device RFQs reach costing."
  },
  "Automotive & e-mobility": {
    pains: ["local production proof", "automotive references", "sensor and HMI module validation", "Tier-1 / Tier-2 entry barriers"],
    capabilities: ["Hungary and Mexico footprint", "electronics, sensors, HMI, power and RF design", "automation capability", "IATF16949 referenced capability"],
    proof: "Use Hungary/Mexico pilot-line and demo-module language: sensor hub, EC mirror, HMI system, speaker/audio electronics.",
    content: "Insight: how local pilot lines help de-risk automotive electronics sourcing before OEM nomination."
  },
  "Audio, gaming & consumer electronics": {
    pains: ["fast innovation cycles", "cost benchmarking", "audio performance validation", "post-event follow-up gaps"],
    capabilities: ["Malaysia R&D and manufacturing", "audio, BT speaker, BT headset, ANC and speaker cavity design", "SMT and high-volume FATP", "industrial design and CMF support"],
    proof: "Anchor on AI-audio prototypes, TWS/gaming headsets, acoustics and NPI speed.",
    content: "Benchmark note: moving audio concepts from acoustic validation into production without slowing design iteration."
  },
  "AgriTech / rugged IoT": {
    pains: ["field reliability", "battery life", "seasonal demand peaks", "serviceability and traceability"],
    capabilities: ["waterproof sealing design", "RF, cellular, LoRa, BLE and sensor design", "reliability testing", "regional assembly and lifecycle support"],
    proof: "Use rugged-device language: harsh environments, battery trade-offs, alerts, spares and seasonal stock planning.",
    content: "One-page checklist: rugged IoT validation across temperature, humidity, sealing, battery and connectivity."
  },
  "Water purification": {
    pains: ["filtration roadmap fit", "appliance platform expansion", "landed-cost pressure", "retail launch timing"],
    capabilities: ["water product catalogues and iHastek water capabilities", "in-house plastics, tooling and assembly", "IoT/app integration", "regional supply chain options"],
    proof: "Lead with product platform, costed variants and quick sample path.",
    content: "Product teardown angle: connected water purification platforms and what to validate before scale."
  },
  "Robotics / industrial automation": {
    pains: ["prototype reliability", "automation integration", "sensor and control complexity", "production test coverage"],
    capabilities: ["UMS smart manufacturing systems", "500+ automation team", "AI/CV/NLP/audio/edge deployment capability", "ITTS production-line test systems"],
    proof: `Frame ${getCompanyName()} as a co-development and industrialisation partner, not only a CM.`,
    content: "Technical article: turning robotics prototypes into repeatable production with test systems and traceability."
  },
  "Smart home / connected devices": {
    pains: ["connectivity stability", "firmware/app integration", "certification", "design iteration speed"],
    capabilities: ["WiFi, BT/BLE, Zigbee, cellular, LoRa and NFC", "Android/iOS app and web software support", "EMC/RF lab capability", "rapid prototyping in 3-7 days"],
    proof: "Use connected-device architecture, certification readiness and global footprint.",
    content: "Briefing note: common certification and RF traps in connected smart-home product launches."
  }
};

const roleMap = [
  {
    match: ["smart factory","industry 4.0","digital transformation","chief digital","cdo","digitalisation","iiot","digital factory","iot platform"],
    persona: "Digital Transformation & Smart Factory Leader",
    title: "CDO / Head of Digital Transformation",
    cares: ["IIoT integration ROI","OEE dashboards and production intelligence","factory connectivity and data-driven quality","automation roadmap prioritisation","change management for digital adoption"],
    fears: ["lengthy integration projects","technology lock-in","unclear ROI on digital investment","disrupting existing production lines"],
    language: ["OEE","IIoT","Digital Factory","Industry 4.0","connected production","data-led manufacturing","smart line"],
    hook: "Lead with measurable OEE uplift and fast integration timelines — this persona needs business case clarity, not technology features.",
    cta: "explore smart manufacturing integration and the measurable production intelligence outcomes",
    contentAngle: "Case study or benchmark: OEE improvement from IIoT-connected FATP lines — how the numbers stack up.",
    discoveryQuestions: [
      "What percentage of your production lines are currently connected for real-time data capture?",
      "How are you measuring OEE today — and what is your current baseline vs target?",
      "Which production process generates the most quality escapes or unplanned downtime?",
      "What does your digital transformation roadmap look like for the next 12-18 months?",
      "How are decisions made about new manufacturing technology investment — who owns the budget?"
    ]
  },
  {
    match: ["test & validation","test and validation","validation engineering","head of test","reliability","compliance","emc","safety validation"],
    persona: "Quality & Validation Engineering",
    title: "Head of Test & Validation / Quality Director",
    cares: ["process control and traceability","reliability and HALT/HASS testing","compliance readiness (CE/FCC/UL/ISO)","yield containment and defect escape prevention","FMEA and DVT gate discipline"],
    fears: ["field reliability failures post-launch","compliance surprises late in NPI","losing control of validation data as CMs change","test coverage gaps that become recalls"],
    language: ["DVT","PVT","HALT","HASS","DFT","yield","compliance","traceability","EVT","design freeze"],
    hook: "Open with a specific validation or compliance risk that relates to their product stage. This persona values technical rigour above all.",
    cta: "walk through a quality, reliability and production test risk review relevant to their current lifecycle stage",
    contentAngle: "Technical note: common validation gaps between DVT and PVT that create post-launch reliability issues.",
    discoveryQuestions: [
      "What lifecycle stage is your current product in — are you pre-EVT, between DVT and PVT, or heading into FATP?",
      "Where do your most frequent field failures or quality escapes originate — PCBA, mechanical, firmware, or assembly?",
      "How do you handle design freeze today — is there a formal quality gate before tooling commits?",
      "What compliance markets are you targeting and how are you managing certification timing relative to your NPI schedule?",
      "Does your current CM have dedicated test engineering resources on-site or is test coverage subcontracted?"
    ]
  },
  {
    match: ["programme director","tpm lead","tpm","programme manager","systems engineering","systems director","project management","npi programme"],
    persona: "Programme / Systems Engineering",
    title: "Programme Director / TPM Lead",
    cares: ["schedule integrity and gate milestones","cross-functional EE/ME/TPM alignment","scope control and decision ownership","NPI risk containment and early issue surfacing","supplier dependency management"],
    fears: ["re-spin cycles eating schedule","EE/ME/TPM working in silos","tooling delays slipping launch","CM changes mid-programme"],
    language: ["gate","milestone","EVT/DVT/PVT","NPI","re-spin","BOM freeze","design freeze","programme risk","cross-functional"],
    hook: "This persona owns schedule. Lead with how early CM engagement reduces gate-to-gate risk and prevents re-spin cycles.",
    cta: "align on programme gate criteria, EE/ME/TPM dependencies and NPI risk containment",
    contentAngle: "Programme note: the three NPI decisions that most often slip launch dates — and how to front-load them.",
    discoveryQuestions: [
      "What is the current programme milestone you are working towards — which gate is next?",
      "Where does the most schedule risk sit today — EE, ME, firmware, validation, tooling, or supplier qualification?",
      "How many re-spin cycles have you experienced on this programme so far and what drove them?",
      "At what stage do you typically bring the CM into the programme — at concept, EVT, DVT, or later?",
      "Who owns the cross-functional integration between EE, ME and TPM on this programme?"
    ]
  },
  {
    match: ["lean","continuous improvement","industrial engineering","plant manager","vp of manufacturing","director of operations","manufacturing engineering","manufacturing director","production director","operations director"],
    persona: "Manufacturing & Operations Leader",
    title: "VP Manufacturing / Director of Operations",
    cares: ["yield and throughput optimisation","OEE and unplanned downtime reduction","production ramp readiness","process stability and SPC","cost per unit and labour efficiency"],
    fears: ["supplier quality variability disrupting lines","ramp failures at high volume","hidden yield losses","being held responsible for a CM that underdelivers"],
    language: ["yield","throughput","OEE","takt time","line efficiency","Cpk","SPC","FMEA","ramp","production readiness"],
    hook: "Operational leaders respond to data. Use specific metrics — yield improvement percentages, OEE benchmarks, cycle time reductions.",
    cta: "review manufacturing process maturity, production ramp readiness and yield improvement opportunities",
    contentAngle: "Operations benchmark: what best-in-class FATP yield and OEE looks like for your product category.",
    discoveryQuestions: [
      "What is your current yield rate at FATP and where do most defects originate?",
      "How far in advance do you typically qualify a new production line before volume ramp?",
      "What does your production test coverage look like — functional test, EOL test, or automated test systems?",
      "Where is the biggest operational risk in your current manufacturing setup — process, people, supplier, or equipment?",
      "How do you measure and track OEE across your production lines today?"
    ]
  },
  {
    match: ["r&d","hardware engineering","product engineering","head of npi","npi","head of product development","product development","electronics engineering","mechanical engineering","firmware","embedded"],
    persona: "R&D / Hardware Engineering",
    title: "Director of Product Engineering / Head of NPI",
    cares: ["technical feasibility and DFM/DFA","validation speed and first-time-right","PCBA and mechanical design quality","prototype turnaround and iteration speed","production-readiness of the design"],
    fears: ["DFM surprises late in the process","tooling commits before design is stable","CM not having the right technical depth","losing IP in CM collaboration"],
    language: ["DFM","DFA","BOM","schematic","Gerber","tolerances","first article","prototype","EVT","tooling","NRE","re-spin"],
    hook: "Engineering leaders want a technical peer, not a sales pitch. Lead with a specific DFM/DFA insight or validation hypothesis.",
    cta: "compare notes on the product roadmap, DFM/DFA risk and prototype-to-production path",
    contentAngle: "Technical brief: common DFM gaps in PCBA and mechanical design that create re-spin costs at EVT/DVT.",
    discoveryQuestions: [
      "Where is the product in the development cycle — are you still in schematic capture, PCB layout, or heading towards first prototype build?",
      "What are the top three DFM or DFA risks you're currently managing on this design?",
      "Have you done a formal DFM review with your CM yet — and at what stage do you typically bring them in?",
      "What is your NRE and tooling budget, and have you committed to tooling yet?",
      "What validation gates are you planning — EVT, DVT, PVT — and are you doing those internally or with the CM?"
    ]
  },
  {
    match: ["cto","chief technology","vp of hardware","director of systems","vp r&d","chief engineer","head of engineering"],
    persona: "CTO / Hardware Engineering Leader",
    title: "CTO / VP R&D",
    cares: ["technology platform strategy","hardware architecture and scalability","co-development risk and IP","cross-functional R&D alignment","build vs buy decisions","speed-to-market vs technical debt"],
    fears: ["strategic dependency on a single CM","IP leakage in co-development","technology platform not scalable","hardware decisions being made too tactically"],
    language: ["platform","architecture","IP","co-development","JDM","ODM","technology roadmap","scalability","strategic partner"],
    hook: "CTOs think in platforms and strategic risk. Open with the IP and co-development model, not capabilities.",
    cta: "review hardware platform strategy, co-development model options and the OEM/ODM/JDM fit",
    contentAngle: "Strategic note: how to structure a CM co-development agreement that protects IP while accelerating NPI.",
    discoveryQuestions: [
      "Are you thinking OEM, ODM or JDM for this product — or is that decision still open?",
      "How do you think about IP ownership and protection when engaging a contract manufacturer at the design stage?",
      "Is this product a standalone SKU or part of a wider hardware platform that needs to scale?",
      "What does your current manufacturing partnership model look like — and where are the strategic gaps?",
      "At what point in the roadmap do you typically engage a CM — concept stage, post-EVT, or later?"
    ]
  },
  {
    match: ["procurement","sourcing","supply chain","buyer","category","strategic sourcing","supply chain director","purchasing","vendor management","supplier development"],
    persona: "Procurement & Supply Chain",
    title: "Procurement Director / Supply Chain Director",
    cares: ["landed cost and total cost of ownership","regional supply-chain resilience","supplier qualification and lead time","risk diversification (China+1)","NCNR and inventory exposure"],
    fears: ["single-source dependency","tariff/logistics disruption","supplier quality variability","being locked into a CM contract without exit"],
    language: ["landed cost","TCO","China+1","localisation","MOQ","lead time","RFQ","dual-source","supplier audit","NCNR","tariff"],
    hook: "Procurement personas respond to cost and risk data. Lead with a landed-cost scenario or China+1 resilience angle.",
    cta: "run through a localisation and landed-cost scenario for the most relevant product line",
    contentAngle: "Cost model: how regional FATP footprint affects landed cost, tariff exposure and inventory risk for your product category.",
    discoveryQuestions: [
      "How is your current manufacturing footprint structured — single-region or multi-site?",
      "What is driving the current sourcing review — cost, risk, tariff, quality, lead time, or a combination?",
      "How do you currently model landed cost — does that include tariffs, logistics, inventory carry and quality cost?",
      "Is there a preferred region for FATP that your business requires — EU, North America, or open?",
      "What does your supplier qualification process look like and how long does it typically take?"
    ]
  },
  {
    match: ["quality director","quality assurance","director of quality","head of quality","quality manager","quality systems","supplier quality"],
    persona: "Quality & Compliance Director",
    title: "Quality Director / Head of QA",
    cares: ["supplier quality systems and audits","process control documentation","reliability and safety validation","compliance and certification management","corrective action and CAPA discipline"],
    fears: ["field failures linked to CM process","supplier audit failures","compliance gaps discovered late","lack of traceability in production records"],
    language: ["ISO9001","ISO13485","IATF16949","CAPA","process control","audit","SPC","yield","traceability","compliance","reliability","FMEA"],
    hook: "Quality leaders want proof, not promises. Open with a specific quality system capability or process control reference.",
    cta: "walk through a quality and reliability risk review relevant to the product stage and compliance requirements",
    contentAngle: "Quality brief: what to validate in a CM's quality system before committing to production transfer.",
    discoveryQuestions: [
      "What quality standards are applicable to your product — ISO9001, ISO13485, IATF16949, or others?",
      "How do you currently audit and qualify your CMs — on-site audits, questionnaires, or third-party?",
      "Where do most quality escapes originate — incoming material, PCBA, assembly, or test?",
      "How does your current CM handle corrective actions and CAPA — are the response times and closure rates acceptable?",
      "What level of production traceability do you require — component-level, board-level, or serial number tracking to the unit?"
    ]
  },
  {
    match: ["ceo","coo","gm","general manager","managing director","chief operating","chief executive","president","board","investor"],
    persona: "Executive / Business Owner",
    title: "CEO / COO / General Manager",
    cares: ["speed to market and competitive positioning","strategic supply-chain resilience","portfolio margin and unit economics","executive risk management","M&A and scale-up manufacturing strategy"],
    fears: ["product launch delays impacting revenue","quality issue becoming a public problem","strategic over-dependence on a single CM","manufacturing bottleneck blocking growth"],
    language: ["revenue","margin","market timing","strategic risk","scale","competitive advantage","executive","board","ROI","capital efficiency"],
    hook: "Executive personas are outcome-focused and time-poor. One sentence on the business risk, one on the solution, one on the ask.",
    cta: "confirm whether this manufacturing strategy question warrants a focused executive-level conversation",
    contentAngle: "Executive brief: the three manufacturing decisions that most affect time-to-market and margin for your product category.",
    discoveryQuestions: [
      "What is the most significant manufacturing risk to your growth plan or product launch timeline right now?",
      "How is your manufacturing strategy connected to your competitive differentiation — cost, speed, quality, or geography?",
      "Are there board-level or investor expectations around supply-chain resilience or regional manufacturing footprint?",
      "Who on your team owns the manufacturing partnership decision — and what does the typical evaluation process look like?",
      "Is there a specific product line or programme where manufacturing performance is most business-critical right now?"
    ]
  }
];

const sourceDocs = [
  "ABM consolidated playbook: persona-based outreach, varied CTAs and consultative email structure",
  "2026 Sales Plan V4: diversification, VIP accounts, air purification, automotive, audio/gaming, regional pilot lines",
  "GTM notes: champion list of around five contacts, aligned LinkedIn/email/phone sequence, content-led touchpoints",
  "Sales SOP: outreach, content request, discovery, deal qualification, customer evaluation, RFQ handover",
  `${getCompanyName()} capability decks: R&D, innovation, global footprint, SMT, FATP, tooling, testing, automation and compliance`,
  "Ahmed's Handbook: SDR decision trees, qualification criteria, HubSpot hygiene, ImportYeti research and ABM method",
  "Sales Kick-Off 2026: value-based conversations, manufacturing lifecycle, FATP, China+1, EVT/DVT/PVT, RFQ timing and EE/ME/TPM collaboration"
];

const salesKnowledge = {
  positioning: [
    `Frame ${getCompanyName()} as an end-to-end manufacturing system, not a factory: R&D, tooling, moulding, PCBA, electronics, automation, testing, FATP and lifecycle support.`,
    "Lead with outcomes across speed-to-market, cost optimisation, risk reduction, quality, scale and supply resilience.",
    "Use vertical integration and multi-region FATP as strategic proof: China for NPI/scale ecosystem, Malaysia/Mexico/Europe for market access, responsiveness and resilience.",
    "Position OEM, ODM and JDM correctly: OEM when customer owns design/IP, ODM when manufacturer designs/builds, JDM for shared design ownership and strategic co-development."
  ],
  discovery: [
    "Does the product have a manufacturing, cost, quality, output or supply-chain problem?",
    "Can the current CM fix the problem, or is the problem large enough to consider a new CM?",
    "Is the issue impacting reputation, users, profitability, market position or growth capacity?",
    "Does the current CM have the technology, capacity and experience required for the next stage?"
  ],
  qualification: [
    "Customer, country and founding date",
    "Account category A/B/C",
    "Product name and product type",
    "Business model: OEM, ODM or JDM",
    "Main market and annual volume",
    "Target price and project schedule",
    "Special requirements, quality standards and data pack status",
    "Clear need, budget/timeline insight and project scope before RFQ"
  ],
  lifecycle: [
    "EVT proves technical feasibility and core functionality; design changes are expected.",
    "DVT validates reliability, compliance, user experience and manufacturability; design freeze follows.",
    "PVT validates manufacturing process, yield, quality plans and production-ready supply chain.",
    "RFQs work best when requirements are clear and engineering input has already reduced risk.",
    "NRE includes design work, prototypes, tooling and test fixtures; tooling maturity should match lifecycle stage."
  ],
  collaboration: [
    "EE owns circuit/system design, power management, signal integrity, sensor and communication integration.",
    "ME owns enclosure, thermal management, moving parts, tolerances, ergonomics and durability.",
    "TPM is the integration layer: schedule, scope, dependencies, decision gates and stakeholder alignment.",
    "Sequential work creates risk; early EE/ME/TPM collaboration reduces re-spins, tooling rework and launch delays."
  ],
  crm: [
    "Keep HubSpot contact and company records accurate: email/domain, job title, company, lifecycle stage, notes and tasks.",
    "Associate contacts to companies and create follow-up tasks after every meaningful engagement.",
    "Use filters/lists to segment by location, industry, job title and intent topic.",
    "Use ImportYeti shipment, supplier, volume and port data to form supply-chain hypotheses for outreach."
  ]
};

const productBenchmarks = {
  "Air purification & home appliances": {
    products: ["premium air purifier", "connected fan", "humidifier / diffuser", "air quality monitor"],
    reviewChallenges: ["filter replacement cost", "noise at high fan speed", "sensor accuracy", "app pairing reliability", "plastic finish and cleanability", "regional plug/compliance variants"],
    retail: [129, 699],
    manufacturingCostPct: [0.22, 0.38],
    annualUnits: [50000, 250000, 900000],
    fatpPerUnit: { light: [3, 7], regional: [8, 18], full: [22, 55] },
    likelyRegions: "China for PCBA/tooling/NPI, Malaysia/Mexico/Eastern Europe for regional FATP where market access matters."
  },
  "Medical & health devices": {
    products: ["nebuliser", "wearable biosensor", "diagnostic accessory", "therapy device controller"],
    reviewChallenges: ["battery reliability", "cleaning and ingress protection", "comfort and ergonomics", "accuracy drift", "regulatory documentation", "traceability"],
    retail: [79, 499],
    manufacturingCostPct: [0.28, 0.48],
    annualUnits: [20000, 120000, 450000],
    fatpPerUnit: { light: [5, 12], regional: [14, 32], full: [35, 95] },
    likelyRegions: "Qualified China/Malaysia builds for electronics and regulated assembly; regional FATP if labelling, logistics or compliance support is needed."
  },
  "Automotive & e-mobility": {
    products: ["sensor hub", "HMI module", "audio electronics module", "mirror / lighting controller"],
    reviewChallenges: ["thermal stability", "vibration robustness", "connector reliability", "EMC performance", "long qualification cycles", "regional OEM supply-chain trust"],
    retail: [35, 350],
    manufacturingCostPct: [0.35, 0.6],
    annualUnits: [30000, 200000, 800000],
    fatpPerUnit: { light: [4, 10], regional: [12, 28], full: [30, 85] },
    likelyRegions: "Hungary and Mexico are strategically relevant for EU/North America automotive proximity; China remains strong for electronics ecosystem and NPI."
  },
  "Audio, gaming & consumer electronics": {
    products: ["TWS earbuds", "gaming headset", "conference speaker", "audio dock"],
    reviewChallenges: ["battery life", "Bluetooth stability", "ANC/audio tuning", "microphone quality", "comfort over long wear", "cosmetic finish yield"],
    retail: [39, 399],
    manufacturingCostPct: [0.2, 0.42],
    annualUnits: [80000, 500000, 2000000],
    fatpPerUnit: { light: [2, 6], regional: [6, 14], full: [15, 42] },
    likelyRegions: "Malaysia and China are highly relevant for audio electronics, SMT, acoustic validation and high-volume FATP."
  },
  "AgriTech / rugged IoT": {
    products: ["livestock sensor", "GPS collar", "rugged tracker", "field gateway"],
    reviewChallenges: ["waterproofing", "battery life", "connectivity dropouts", "impact resistance", "serviceability", "seasonal demand peaks"],
    retail: [89, 399],
    manufacturingCostPct: [0.25, 0.45],
    annualUnits: [10000, 75000, 250000],
    fatpPerUnit: { light: [4, 9], regional: [10, 24], full: [28, 70] },
    likelyRegions: "China for rugged electronics and sealing validation; regional assembly can reduce lead time for seasonal demand."
  },
  "Water purification": {
    products: ["countertop purifier", "under-sink filtration controller", "smart pitcher", "filter sensor module"],
    reviewChallenges: ["leak prevention", "filter life claims", "taste consistency", "pump noise", "app reminders", "retail packaging and replacement ecosystem"],
    retail: [49, 699],
    manufacturingCostPct: [0.22, 0.4],
    annualUnits: [40000, 220000, 850000],
    fatpPerUnit: { light: [3, 8], regional: [9, 20], full: [24, 60] },
    likelyRegions: "China/Malaysia for appliance platform and plastics; regional FATP for bulky products, labelling and logistics."
  },
  "Robotics / industrial automation": {
    products: ["service robot module", "automation controller", "vision sensor unit", "industrial edge box"],
    reviewChallenges: ["sensor calibration", "thermal management", "software/firmware stability", "serviceability", "production test coverage", "system integration"],
    retail: [299, 2500],
    manufacturingCostPct: [0.32, 0.55],
    annualUnits: [5000, 30000, 120000],
    fatpPerUnit: { light: [12, 30], regional: [35, 90], full: [95, 280] },
    likelyRegions: "China for automation ecosystem, test systems and NPI; regional FATP if deployment/service proximity is important."
  },
  "Smart home / connected devices": {
    products: ["smart controller", "connected sensor", "gateway", "security accessory"],
    reviewChallenges: ["pairing friction", "firmware updates", "RF range", "power consumption", "certification", "cloud/app reliability"],
    retail: [29, 249],
    manufacturingCostPct: [0.18, 0.36],
    annualUnits: [100000, 650000, 2500000],
    fatpPerUnit: { light: [2, 5], regional: [5, 12], full: [12, 32] },
    likelyRegions: "China and Malaysia for electronics, RF and app-enabled device assembly; regional FATP for market access and logistics."
  }
};

const accountSuggestions = {
  "Air purification & home appliances": [
    { segment: "Enterprise / £1B+", account: "Blueair / Unilever", revenue: "£1B+ parent scale", fit: "Premium connected air care with recurring filter economics and global retail complexity.", products: ["premium air purifier", "air quality monitor"], angle: "NPI, PCBA, sensor validation, plastics, filter housing, regional FATP and quality traceability." },
    { segment: "Upper mid-market / £250M-£1B", account: "Stadler Form", revenue: "£250M-£1B category potential", fit: "Design-led appliances where finish quality, acoustic performance and retail timing matter.", products: ["connected fan", "humidifier / diffuser"], angle: "Plastics finish, motor noise, pilot production, test fixtures and packaging localisation." },
    { segment: "Growth / £50M-£250M", account: "Mila", revenue: "£50M-£250M growth brand", fit: "Connected purifier brand likely sensitive to app reliability, review quality and scale-up cost.", products: ["premium air purifier", "air quality monitor"], angle: "Connected-device validation, PCBA, sensor calibration, DFM/DFA and supply-chain resilience." }
  ],
  "Medical & health devices": [
    { segment: "Enterprise / £1B+", account: "Omron Healthcare", revenue: "£1B+ healthcare devices", fit: "High-volume regulated devices with quality, traceability and design-transfer needs.", products: ["nebuliser", "therapy device controller"], angle: "ISO13485-style process discipline, reliability validation, test coverage and controlled FATP." },
    { segment: "Upper mid-market / £250M-£1B", account: "ResMed consumer health accessories", revenue: "£250M-£1B accessory opportunity", fit: "Connected therapy accessories and controllers with comfort, cleaning and electronics reliability pressure.", products: ["diagnostic accessory", "therapy device controller"], angle: "PCBA, plastics, cleaning/IP validation, traceability and regional assembly." },
    { segment: "Growth / £50M-£250M", account: "Tytocare", revenue: "£50M-£250M connected-care brand", fit: "Connected diagnostic hardware where app, sensor and manufacturing quality shape adoption.", products: ["wearable biosensor", "diagnostic accessory"], angle: "Prototype-to-production, sensor validation, compliance readiness and NPI support." }
  ],
  "Automotive & e-mobility": [
    { segment: "Enterprise / £1B+", account: "Valeo", revenue: "£1B+ automotive supplier", fit: "Electronics modules and regional supply expectations across EU and North America.", products: ["sensor hub", "HMI module"], angle: "Hungary/Mexico proximity, PCBA, automation, traceability and IATF-style quality systems." },
    { segment: "Upper mid-market / £250M-£1B", account: "Wallbox", revenue: "£250M-£1B e-mobility scale", fit: "Charging hardware with electronics, plastics, compliance and regional localisation pressure.", products: ["HMI module", "mirror / lighting controller"], angle: "Power electronics support, plastics, test systems, FATP and cost-down scenarios." },
    { segment: "Growth / £50M-£250M", account: "EO Charging", revenue: "£50M-£250M growth e-mobility", fit: "Scale-up hardware where production repeatability and landed cost can become constraints.", products: ["sensor hub", "audio electronics module"], angle: "PCBA, rugged enclosure, firmware test, tooling and regional fulfilment." }
  ],
  "Audio, gaming & consumer electronics": [
    { segment: "Enterprise / £1B+", account: "Jabra / GN Group", revenue: "£1B+ audio portfolio", fit: "Audio, headset and collaboration devices with acoustics, battery and cosmetic yield pressure.", products: ["TWS earbuds", "conference speaker"], angle: "Acoustic validation, SMT, battery reliability, plastics, final assembly and test automation." },
    { segment: "Upper mid-market / £250M-£1B", account: "SteelSeries", revenue: "£250M-£1B gaming category", fit: "Gaming headsets and accessories with fast cycles, finish quality and retail launch pressure.", products: ["gaming headset", "audio dock"], angle: "PCBA, acoustic chambers, tooling, cosmetic yield, packaging and high-volume FATP." },
    { segment: "Growth / £50M-£250M", account: "Nothing", revenue: "£50M-£250M growth electronics", fit: "Design-led connected audio products with high expectations for finish and app experience.", products: ["TWS earbuds", "audio dock"], angle: "CMF, plastics, PCBA, Bluetooth validation, yield improvement and launch readiness." }
  ],
  "AgriTech / rugged IoT": [
    { segment: "Enterprise / £1B+", account: "DeLaval", revenue: "£1B+ agri equipment", fit: "Connected farm hardware with ruggedness, serviceability and seasonal reliability needs.", products: ["livestock sensor", "field gateway"], angle: "Waterproofing, battery validation, RF reliability, rugged plastics and lifecycle support." },
    { segment: "Upper mid-market / £250M-£1B", account: "Allflex / MSD Animal Health", revenue: "£250M-£1B device ecosystem", fit: "Animal monitoring devices where traceability and field reliability are central.", products: ["GPS collar", "livestock sensor"], angle: "Sealing design, PCBA, RF modules, impact tests and regional assembly." },
    { segment: "Growth / £50M-£250M", account: "HerdDogg", revenue: "£50M-£250M growth IoT", fit: "Rugged IoT brand likely balancing cost, battery and connectivity at scale.", products: ["rugged tracker", "field gateway"], angle: "Prototype-to-PVT, waterproofing, battery life, LoRa/BLE testing and DFM." }
  ],
  "Water purification": [
    { segment: "Enterprise / £1B+", account: "Brita", revenue: "£1B+ water category", fit: "Filter ecosystem with consumer appliance extensions and retail volume complexity.", products: ["countertop purifier", "filter sensor module"], angle: "Plastics, leak prevention, sensor PCBA, packaging and regional FATP." },
    { segment: "Upper mid-market / £250M-£1B", account: "A. O. Smith water products", revenue: "£250M-£1B appliance line", fit: "Water systems with controller, pump, plastics and compliance considerations.", products: ["under-sink filtration controller", "countertop purifier"], angle: "PCBA, pump noise, reliability testing, enclosure tooling and final assembly." },
    { segment: "Growth / £50M-£250M", account: "LARQ", revenue: "£50M-£250M growth brand", fit: "Design-led purification products with electronics, charging and premium finish pressure.", products: ["smart pitcher", "filter sensor module"], angle: "Industrial design support, plastics, battery/charging PCBA, validation and retail packaging." }
  ],
  "Robotics / industrial automation": [
    { segment: "Enterprise / £1B+", account: "ABB Robotics", revenue: "£1B+ automation", fit: "Industrial modules where sensors, controllers and test systems matter.", products: ["automation controller", "vision sensor unit"], angle: "PCBA, thermal management, production test systems, traceability and automation fixtures." },
    { segment: "Upper mid-market / £250M-£1B", account: "MiR / Teradyne robotics", revenue: "£250M-£1B robotics portfolio", fit: "Autonomous robotics hardware with sensor, edge compute and serviceability requirements.", products: ["service robot module", "industrial edge box"], angle: "Edge electronics, sensor calibration, rugged enclosure, test coverage and NPI." },
    { segment: "Growth / £50M-£250M", account: "Dexory", revenue: "£50M-£250M growth robotics", fit: "Warehouse robotics scale-up with reliability and production repeatability needs.", products: ["vision sensor unit", "industrial edge box"], angle: "Prototype industrialisation, cable/connector reliability, PCBA, fixtures and FATP." }
  ],
  "Smart home / connected devices": [
    { segment: "Enterprise / £1B+", account: "Signify / Philips Hue", revenue: "£1B+ connected-home portfolio", fit: "Connected devices with RF, app, certification and global retail requirements.", products: ["smart controller", "gateway"], angle: "RF validation, PCBA, plastics, certification readiness and regional FATP." },
    { segment: "Upper mid-market / £250M-£1B", account: "Tado", revenue: "£250M-£1B connected climate category", fit: "Smart thermostats and sensors where connectivity, installation and compliance drive reviews.", products: ["connected sensor", "smart controller"], angle: "RF range, power consumption, plastics, app-pairing validation and DFM." },
    { segment: "Growth / £50M-£250M", account: "Aqara", revenue: "£50M-£250M growth connected devices", fit: "Large SKU portfolio where gateway, sensors and accessories need scalable assembly.", products: ["gateway", "security accessory"], angle: "PCBA, plastics, test automation, packaging localisation and supplier diversification." }
  ]
};

const toneGuidance = {
  Consultative: {
    opener: "I wanted to share a practical hypothesis rather than pitch a generic manufacturing offer.",
    cta: "compare notes and see whether a focused technical review would be useful",
    style: "balanced, advisory and problem-led"
  },
  Direct: {
    opener: "I am reaching out because there may be a clear manufacturing or supply-chain improvement opportunity.",
    cta: "confirm whether this is worth a short call",
    style: "short, specific and commercially clear"
  },
  Technical: {
    opener: "I am reaching out with a technical manufacturing hypothesis tied to validation, yield and production readiness.",
    cta: "review the technical risk points with R&D, NPI or quality",
    style: "engineering-led, evidence-based and precise"
  },
  Executive: {
    opener: "I am reaching out because this may connect to a strategic risk around speed, resilience, margin or product quality.",
    cta: "decide whether this should become an executive-sponsored workstream",
    style: "commercial, concise and outcome-led"
  }
};

const signalGuidance = {
  "New product development or refresh": {
    priority: "Use EVT/DVT language, early DFM/DFA, prototype speed, tooling choices and launch risk reduction.",
    lifecycle: "Concept to EVT/DVT",
    offer: "early engineering review, prototype/NPI support and DFM/DFA workshop"
  },
  "Supplier diversification / localisation": {
    priority: "Lead with China+1, regional FATP, tariff/logistics resilience and market-access responsiveness.",
    lifecycle: "FATP / localisation",
    offer: "regional FATP and supply-chain resilience scenario"
  },
  "Scaling from prototype to production": {
    priority: "Lead with PVT, yield, test coverage, automation, traceability and stable ramp.",
    lifecycle: "DVT to PVT",
    offer: "PVT readiness and production test review"
  },
  "Quality, reliability or compliance concern": {
    priority: "Lead with reliability testing, compliance, root-cause containment, quality plans and process controls.",
    lifecycle: "DVT / reliability",
    offer: "quality and reliability risk review"
  },
  "Cost-down or landed-cost pressure": {
    priority: "Lead with VA/VE, PCBA yield, plastics/tooling optimisation, automation and landed-cost modelling.",
    lifecycle: "Lifecycle cost-down",
    offer: "cost-down and localisation scenario"
  },
  "RFQ / RFI preparation": {
    priority: "Qualify requirements before pricing; suggest RFI or technical scoping if requirements are unclear.",
    lifecycle: "RFI/RFQ gate",
    offer: "RFQ readiness and RFX qualification checklist"
  },
  "Smart factory / digital transformation": {
    priority: `Lead with ${getCompanyName()}'s UMS smart manufacturing systems, real-time quality statistics, OEE dashboards and IIoT-enabled FATP lines.`,
    lifecycle: "Digital factory / Industry 4.0",
    offer: "smart manufacturing capability tour and IIoT integration discussion"
  },
  "Automation & production efficiency": {
    priority: "Lead with automation capability (500+ automation engineers), cycle-time reduction, yield improvement and intelligent line optimisation.",
    lifecycle: "Production automation",
    offer: "automation capability review and line efficiency assessment"
  }
};

// Lazy element getters (DOM is populated after DOMContentLoaded)
const _el = id => document.getElementById(id);
const form         = () => _el("strategyForm");
const results      = () => _el("results");
const emptyState   = () => _el("emptyState");
const outputTitle  = () => _el("outputTitle");
const copyAllBtn   = () => _el("copyAll");
const briefAccount = () => _el("briefAccount");
const briefMeta    = () => _el("briefMeta");
const briefPersona = () => _el("briefPersona");
const briefSignal  = () => _el("briefSignal");
const briefObjective = () => _el("briefObjective");
const saveDraftBtn = () => _el("saveDraft");
const exportBriefBtn = () => _el("exportBrief");
const accountFocusPanel = () => _el("accountFocusPanel");
let lastOutputText = "";
let lastData = null;
let lastOutput = null;

function getPersona(role) {
  const lower = role.toLowerCase();
  // Match against match array first, then also check title field
  return roleMap.find(item =>
    item.match.some(token => lower.includes(token)) ||
    (item.title && lower.includes(item.title.toLowerCase().split('/')[0].trim().toLowerCase()))
  ) || roleMap[4]; // default to R&D / Hardware Engineering
}

function firstName(name) {
  return (name || "there").trim().split(/\s+/)[0] || "there";
}

function clean(value, fallback) {
  return value && value.trim() ? value.trim() : fallback;
}

function collectFormData() {
  const f = form();
  const data = f ? Object.fromEntries(new FormData(f).entries()) : {};
  data.accountName = clean(data.accountName, "Target account");
  data.prospectName = clean(data.prospectName, "there");
  data.role = clean(data.role, "Business owner");
  return data;
}

function escapeHtml(value) {
  return String(value)
    .replace(/Â£|£/g, "GBP ")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.left = "-9999px";
  document.body.appendChild(area);
  area.select();
  document.execCommand("copy");
  document.body.removeChild(area);
  return Promise.resolve();
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function requireHostedApi(feature) {
  if (location.protocol === "file:") {
    throw new Error(`${feature} requires the Netlify-hosted app because it uses secure serverless functions.`);
  }
}

/* ══════════════════════════════════════════════════════════════
   AI ENRICHMENT — Claude-powered account intelligence
══════════════════════════════════════════════════════════════ */

function aiEnrichLoadingBanner(accountName) {
  return `
    <div class="ai-intel-banner ai-intel-loading" id="aiIntelBanner">
      <div class="ai-intel-icon">✦</div>
      <div class="ai-intel-body">
        <strong>AI Intelligence</strong>
        <span>Analysing <em>${escapeHtml(accountName)}</em> with Claude…</span>
      </div>
      <div class="ai-intel-spinner"></div>
    </div>
  `;
}

function aiEnrichPanel(enriched, accountName) {
  return `
    <div class="ai-intel-banner ai-intel-ready" id="aiIntelBanner">
      <div class="ai-intel-icon">✦</div>
      <div class="ai-intel-body">
        <strong>AI Intelligence · ${escapeHtml(accountName)}</strong>
        <span>${escapeHtml(enriched.companySnapshot || '')}</span>
      </div>
    </div>
  `;
}

function aiInsightCard(label, content) {
  if (!content) return '';
  const isArray = Array.isArray(content);
  const body = isArray
    ? `<ul>${content.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : `<p>${escapeHtml(content)}</p>`;
  return `
    <article class="card ai-insight-card">
      <div class="ai-insight-header"><span class="ai-badge">✦ AI</span><h3>${escapeHtml(label)}</h3></div>
      ${body}
    </article>
  `;
}

/* Client-side session cache for AI enrichment
   Key: hash of account+vertical+role+signal
   Avoids repeat Claude calls within the same browser session */
function _enrichCacheKey(data) {
  const str = [data.accountName, data.vertical, data.role, data.signal]
    .map(s => (s || '').toLowerCase().trim()).join('|');
  let h = 0;
  for (const c of str) { h = Math.imul(31, h) + c.charCodeAt(0) | 0; }
  return 'cx_enrich_' + Math.abs(h).toString(36);
}

async function callAiEnrich(data) {
  if (location.protocol === 'file:') return null;   // skip when running locally

  // ── L1 cache: sessionStorage (free, instant) ──────────────
  const cKey = _enrichCacheKey(data);
  try {
    const hit = sessionStorage.getItem(cKey);
    if (hit) return JSON.parse(hit);
  } catch { /* ignore parse errors */ }

  try {
    const resp = await authFetch('/api/ai-enrich', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountName: data.accountName,
        vertical:    data.vertical,
        role:        data.role,
        signal:      data.signal,
        prospect:    data.prospectName,
        notes:       data.notes,
        linkedin:    data.linkedin
      })
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const enriched = json.enriched || null;

    // ── L1 write: store in sessionStorage for this session ──
    if (enriched) {
      try { sessionStorage.setItem(cKey, JSON.stringify(enriched)); } catch { /* quota full */ }
    }
    return enriched;
  } catch {
    return null;
  }
}

function injectAiEnrichment(enriched, data) {
  if (!enriched) {
    // Remove loading banners if enrichment failed silently
    document.querySelectorAll('.ai-intel-banner').forEach(el => el.remove());
    return;
  }

  // Strategy tab — replace banner + prepend company insight + strategy priority
  const strategyEl = document.getElementById('strategy');
  if (strategyEl) {
    const banner = strategyEl.querySelector('#aiIntelBanner');
    if (banner) banner.outerHTML = aiEnrichPanel(enriched, data.accountName);
    const insightSection = strategyEl.querySelector('.ai-enrichment-section');
    if (insightSection) insightSection.remove();
    const strategyCard = strategyEl.querySelector('.card');
    if (strategyCard) {
      const section = document.createElement('div');
      section.className = 'ai-enrichment-section';
      section.innerHTML =
        aiInsightCard('Strategic priority for ' + data.accountName, enriched.strategyPriority) +
        (enriched.riskFlags ? aiInsightCard('Account-specific risk flags', enriched.riskFlags) : '');
      strategyCard.insertAdjacentElement('beforebegin', section);
    }
  }

  // Product tab — inject product match insight
  const productEl = document.getElementById('product');
  if (productEl) {
    const existing = productEl.querySelector('.ai-enrichment-section');
    if (existing) existing.remove();
    const hero = productEl.querySelector('.product-hero');
    if (hero) {
      const section = document.createElement('div');
      section.className = 'ai-enrichment-section';
      section.innerHTML = aiInsightCard('AI product match insight · ' + data.accountName, enriched.productMatchInsight);
      hero.insertAdjacentElement('afterend', section);
    }
  }

  // Outreach tab — inject opening hook at top
  const outreachEl = document.getElementById('outreach');
  if (outreachEl) {
    const existing = outreachEl.querySelector('.ai-enrichment-section');
    if (existing) existing.remove();
    const section = document.createElement('div');
    section.className = 'ai-enrichment-section';
    section.innerHTML = aiInsightCard('AI-generated opening hook · ' + data.accountName, enriched.openingHook);
    outreachEl.prepend(section);
  }

  // News tab — inject news angle insight
  const newsEl = document.getElementById('news');
  if (newsEl) {
    const existing = newsEl.querySelector('.ai-enrichment-section');
    if (existing) existing.remove();
    const section = document.createElement('div');
    section.className = 'ai-enrichment-section';
    section.innerHTML = aiInsightCard('AI news & signal angle · ' + data.accountName, enriched.newsAngle);
    newsEl.prepend(section);
    // Also auto-populate news keywords from AI intelligence
    const newsKeywordsEl = document.getElementById('newsKeywords');
    if (newsKeywordsEl && enriched.newsAngle) {
      newsKeywordsEl.value = `${data.accountName}, ${data.vertical}, ${enriched.newsAngle.split(',').slice(0, 3).join(', ')}`;
    }
  }

  // Playbook tab — inject discovery questions
  const playbookEl = document.getElementById('playbook');
  if (playbookEl) {
    const existing = playbookEl.querySelector('.ai-enrichment-section');
    if (existing) existing.remove();
    const section = document.createElement('div');
    section.className = 'ai-enrichment-section';
    section.innerHTML =
      aiInsightCard('AI discovery questions · ' + data.accountName, enriched.discoveryQuestions) +
      (enriched.hubspotNotes ? aiInsightCard('HubSpot research notes', enriched.hubspotNotes) : '');
    playbookEl.prepend(section);
  }

  // Call tab — inject discovery questions
  const callEl = document.getElementById('call');
  if (callEl) {
    const existing = callEl.querySelector('.ai-enrichment-section');
    if (existing) existing.remove();
    const section = document.createElement('div');
    section.className = 'ai-enrichment-section';
    section.innerHTML = aiInsightCard('AI-tailored discovery questions · ' + data.accountName, enriched.discoveryQuestions);
    callEl.prepend(section);
  }
}

function inferResearch(account, linkedin, notes, vertical, signal) {
  const inputs = `${account} ${linkedin} ${notes}`.toLowerCase();
  const signals = [];
  if (inputs.includes("launch") || inputs.includes("new product")) signals.push("Possible new product or refresh cycle.");
  if (inputs.includes("rfq") || inputs.includes("rfi") || inputs.includes("supplier")) signals.push("Potential sourcing or RFQ timing.");
  if (inputs.includes("quality") || inputs.includes("reliability") || inputs.includes("compliance")) signals.push("Quality and validation may be active decision drivers.");
  if (inputs.includes("linkedin.com")) signals.push("LinkedIn profile supplied. Use it to personalise around role history, remit and shared product interests.");
  if (!signals.length) signals.push(`Use the selected trigger, "${signal}", as the first research hypothesis.`);
  signals.push(`Vertical fit selected: ${vertical}.`);
  return signals;
}

function buildNewsAngles(data, cap) {
  return [
    `Search for ${data.accountName} product launches, roadmap updates, supplier changes, funding, factory moves or leadership hires from the last 90 days.`,
    `Use industry movement around ${data.vertical.toLowerCase()} to create value: ${cap.content}`,
    `Turn any news into a role-specific hypothesis: why it matters to ${data.role}, what risk it creates, and which ${getCompanyName()} capability can help.`,
    "Avoid forwarding news alone. Add a one-line point of view and a soft CTA to compare notes."
  ];
}

function buildPlan(data) {
  const cap = capabilityMap[data.vertical];
  const tone = toneGuidance[data.tone] || toneGuidance.Consultative;
  const signal = signalGuidance[data.signal] || signalGuidance["New product development or refresh"];
  const persona = getPersona(data.role);
  const name = firstName(data.prospectName);
  const account = data.accountName;
  const pains = cap.pains.slice(0, 3);
  const capability = cap.capabilities.slice(0, 4);
  const opener = data.notes ? data.notes.split(/[.!?\n]/).find(Boolean) : `${account} appears to fit the ${data.vertical.toLowerCase()} GTM lane.`;

  const linkedinConnect = `Hi ${name}, I noticed your work around ${data.vertical.toLowerCase()} at ${account}. ${tone.opener} ${getCompanyName()} helps teams with ${signal.offer}. It would be good to connect.`;

  const linkedinFollow = `Hi ${name}, thanks for connecting. Based on your role in ${persona.persona.toLowerCase()}, I thought this might be relevant: ${cap.content} Given the current signal is "${data.signal}", the useful angle is ${signal.priority.toLowerCase()} Open to ${tone.cta}?`;

  const emailOne = `Subject: ${account} and ${signal.lifecycle}\n\nHi ${name},\n\n${opener.trim()}.\n\n${tone.opener} For ${persona.persona.toLowerCase()} teams, the pressure is usually not just finding another supplier. It is proving that the design, validation path and regional build model can support the product roadmap without adding risk.\n\nFor the "${data.signal}" trigger, I would focus on this: ${signal.priority}\n\n${getCompanyName()} can support this through ${capability[0]}, ${capability[1]}, and ${capability[2]}. For ${account}, I would start by mapping the current product or platform against ${pains.join(", ")}.\n\nWould you be open to 20 minutes to ${tone.cta}?\n\nBest,\n[Your name]`;

  const emailTwo = `Subject: ${signal.offer} for ${account}\n\nHi ${name},\n\nOne useful way to de-risk this is to run a focused account hypothesis before any heavy proposal work:\n\n1. Identify the product line most exposed to ${data.signal.toLowerCase()}.\n2. Confirm lifecycle stage: ${signal.lifecycle}.\n3. Match the right ${getCompanyName()} capability: ${capability.slice(0, 3).join(", ")}.\n4. Agree whether the next step is ${signal.offer}.\n\n${cap.proof}\n\nThe tone I would use here is ${tone.style}: useful, specific and connected to your role.\n\nWould it be useful if I sent a short outline tailored to ${account}?\n\nBest,\n[Your name]`;

  const breakup = `Subject: Closing the loop\n\nHi ${name},\n\nI have reached out a couple of times because ${account} looks like a strong fit for ${getCompanyName()}'s ${data.vertical.toLowerCase()} capability.\n\nIf ${data.signal.toLowerCase()} is not a priority, no problem. If it is on the roadmap for the next two quarters, I would still be happy to share a concise validation and sourcing checklist your team can use internally.\n\nBest,\n[Your name]`;

  const callScript = `Opening:\nHi ${name}, it is [Your name] from ${getCompanyName()}. ${tone.opener} ${account} looked relevant to our ${data.vertical.toLowerCase()} work, especially around ${signal.lifecycle.toLowerCase()}.\n\nReason for call:\nI wanted to understand whether ${data.signal.toLowerCase()} is active for your team, or whether there is a better person owning that topic.\n\nDiscovery questions:\n1. Which product line or roadmap area is most exposed to ${data.signal.toLowerCase()}?\n2. Are you currently closer to ${signal.lifecycle}, RFQ, or production ramp?\n3. What tends to block progress internally: technical feasibility, qualification, cost, capacity, or timing?\n4. If there were a useful technical session, who else should be involved: R&D, NPI, procurement, quality, EE, ME or TPM?\n\nClose:\nBased on that, I can send a short ${getCompanyName()} note focused on ${signal.offer}, then we can decide whether a 20-minute technical review is worthwhile.`;

  const handbookDiscovery = `Handbook qualification add-on:\n1. What problem is causing you to look beyond the current CM: cost, quality, output, supply chain, technology, capacity or experience?\n2. Is this issue affecting reputation, users, profitability, market position or growth capacity?\n3. What lifecycle stage is the product in: concept, EVT, DVT, PVT, FATP, scaling or lifecycle cost-down?\n4. Do you already have product requirements, annual volume, target price, market, schedule and special requirements documented?\n5. Is this an OEM, ODM or JDM opportunity?\n6. Would an RFI/technical scoping session be more useful before an RFQ?`;

  return {
    persona,
    cap,
    research: inferResearch(account, data.linkedin, data.notes, data.vertical, data.signal),
    strategy: {
      plays: [
        `Build a champion map of five contacts: one ${persona.persona} lead, one adjacent technical stakeholder, one procurement/sourcing contact, one NPI/quality owner and one senior sponsor.`,
        `Lead with the trigger "${data.signal}" and this priority: ${signal.priority}`,
        `Use a ${data.tone.toLowerCase()} tone: ${tone.style}.`,
        `Offer content before asking for a broad meeting: ${cap.content}`,
        `Use the Sales SOP path: outreach, tailored content, discovery, deal qualification, task-force review, then RFQ handover only if fit is confirmed.`,
        `Apply the handbook decision tree: confirm whether the current CM has a cost, quality, output, technology, capacity or supply-chain gap large enough to justify change.`,
        `Anchor the discussion in lifecycle stage: concept, EVT, DVT, PVT, FATP, scaling or lifecycle cost-down.`
      ],
      risks: [
        "Do not over-pitch manufacturing before confirming product line, timing and decision ownership.",
        "Avoid a single-contact strategy. The GTM notes emphasise mixed champion coverage across R&D, NPI and procurement.",
        "If the account is strategic or VIP, assign executive ownership and log every touchpoint in HubSpot.",
        "Avoid RFQ talk too early. RFQs are accurate only when requirements, volumes, timing and engineering assumptions are clear."
      ],
      nextSteps: [
        "Research company site, LinkedIn, HubSpot history and import/export signals.",
        "Send LinkedIn connection and email in the same week with matching opening, pain and CTA.",
        "Call fact-finding contacts if no reply after first email.",
        "Use a different value angle in follow-up rather than repeating the first email.",
        "Capture RFX fields: product, type, business model, market, annual volume, target price, schedule and special requirements."
      ]
    },
    messages: { linkedinConnect, linkedinFollow, emailOne, emailTwo, breakup, callScript, handbookDiscovery },
    article: cap.content,
    newsAngles: buildNewsAngles(data, cap)
  };
}

function readiness(data, output) {
  let score = 35;
  if (data.accountName && data.accountName !== "Target account") score += 12;
  if (data.prospectName && data.prospectName !== "there") score += 8;
  if (data.role && data.role !== "Business owner") score += 10;
  if (data.prospectEmail) score += 8;
  if (data.linkedin) score += 7;
  if (data.notes && data.notes.length > 60) score += 12;
  if (output.research.length > 2) score += 8;
  return Math.min(score, 100);
}

function premiumSummary(data, output) {
  const score = readiness(data, output);
  const band = score >= 80 ? "Strong" : score >= 60 ? "Workable" : "Needs research";
  const hookHtml = output.persona.hook
    ? `<article class="mini-card mini-card-wide"><strong style="font-size:11px;font-weight:500;line-height:1.5;">${escapeHtml(output.persona.hook)}</strong><span>Hook guidance</span></article>`
    : '';
  return `
    <section class="premium-summary">
      <article class="score-card">
        <div class="score-ring" style="--score:${score * 3.6}deg"><span>${score}</span></div>
        <div>
          <p class="eyebrow">Readiness</p>
          <h3>${band}</h3>
          <p class="source-list">Completeness based on account, persona, notes, LinkedIn signal and CRM-ready identifiers.</p>
        </div>
      </article>
      <article class="mini-card"><strong>${escapeHtml(output.cap.capabilities[0])}</strong><span>Primary capability angle</span></article>
      <article class="mini-card"><strong>${escapeHtml(output.cap.pains[0])}</strong><span>Likely buying pressure</span></article>
      <article class="mini-card"><strong>${escapeHtml(output.persona.cta)}</strong><span>Recommended CTA</span></article>
      ${hookHtml}
    </section>
  `;
}

function knowledgePanel(data, output) {
  const lifecycleHint = data.signal.includes("RFQ")
    ? "Check whether the customer is too early for RFQ. If requirements are unclear, steer to RFI/discovery and technical scoping first."
    : "Use lifecycle language to identify whether the account is at concept, EVT, DVT, PVT, FATP or scale.";

  return `
    <section class="knowledge-grid">
      ${card("Handbook decision logic", list(salesKnowledge.discovery))}
      ${card("Qualification checklist", list(salesKnowledge.qualification))}
      ${card("Kick-off lifecycle lens", list([lifecycleHint, ...salesKnowledge.lifecycle.slice(0, 4)]))}
    </section>
  `;
}

function timeline(output) {
  const steps = [
    ["Day 1", "Connect", "Send LinkedIn connection request and first email with matching pain, role and CTA."],
    ["Day 3", "Value", `Share value angle: ${output.article}`],
    ["Day 5", "Call", "Run a short fact-finding call to identify owner, timing and active product line."],
    ["Day 8", "Champion", "Expand to R&D, NPI/quality, procurement and sponsor contacts."],
    ["Day 12", "Qualify", "Move to discovery or pause based on technical fit, timeline and buying process."]
  ];
  return `
    <article class="card timeline-card">
      <h3>Recommended motion</h3>
      <div class="timeline">
        ${steps.map(([day, title, body]) => `
          <div class="timeline-step">
            <span>${day}</span>
            <strong>${title}</strong>
            <p>${escapeHtml(body)}</p>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function card(title, body) {
  return `<article class="card"><h3>${escapeHtml(title)}</h3>${body}</article>`;
}

function list(items) {
  return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function copyBlock(title, text) {
  return `<article class="card copy-block"><div class="copy-head"><h3>${escapeHtml(title)}</h3><button class="copy-button" data-copy="${encodeURIComponent(text)}">Copy</button></div><pre>${escapeHtml(text)}</pre></article>`;
}

function searchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=nws`;
}

function webSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function quoted(value) {
  return `"${String(value).replace(/"/g, "")}"`;
}

function productQueries(account, product, vertical) {
  const a = quoted(account);
  const p = quoted(product);
  return {
    reviews: `${a} ${p} (review OR reviews OR ratings) (problem OR problems OR defect OR reliability OR noise OR battery)`,
    complaints: `${a} ${p} (complaints OR "common problems" OR "customer issues" OR "support forum" OR reddit)`,
    retail: `${a} ${p} (price OR "retail price" OR MSRP OR Amazon OR BestBuy OR "official store")`,
    teardown: `${a} ${p} (teardown OR "FCC ID" OR PCBA OR PCB OR "internal photos" OR iFixit)`,
    importyeti: `${a} ${p} (ImportYeti OR supplier OR shipment OR importer OR exporter OR "bill of lading")`,
    manufacturer: `${a} ${p} (manufacturer OR "contract manufacturer" OR factory OR "made in" OR supplier OR OEM OR ODM)`,
    image: `${a} ${p} ${quoted(vertical)} product image official`
  };
}

function newsQueries(account, vertical) {
  const a = quoted(account);
  const v = quoted(vertical);
  return {
    account: `${a} (launch OR product OR supplier OR manufacturing OR factory OR partnership OR recall OR quality) when:30d`,
    industry: `${v} (market OR trend OR regulation OR supply chain OR manufacturing OR growth OR product launch) when:30d`,
    product: `${a} ${v} ("top selling" OR bestseller OR review OR complaints OR teardown) when:365d`
  };
}

function referenceSearchCard(title, query, angle, mode = "web") {
  const href = mode === "news" ? searchUrl(query) : webSearchUrl(query);
  return `
    <article class="reference-card">
      <a href="${href}" target="_blank" rel="noreferrer">${escapeHtml(title)}</a>
      <p>${escapeHtml(angle)}</p>
      <code>${escapeHtml(query)}</code>
    </article>
  `;
}

function accountSearchQuery(account, vertical, products) {
  return `${quoted(account)} ${quoted(vertical)} (${products.map(quoted).join(" OR ")}) (product OR supplier OR manufacturer OR reviews OR "annual revenue" OR "top selling")`;
}

function accountSuggestionsCard(data) {
  const suggestions = accountSuggestions[data.vertical] || accountSuggestions["Smart home / connected devices"];
  const bench = productBenchmarks[data.vertical] || productBenchmarks["Smart home / connected devices"];
  const grouped = suggestions.reduce((acc, item) => {
    acc[item.segment] = acc[item.segment] || [];
    acc[item.segment].push(item);
    return acc;
  }, {});

  const segmentCards = Object.entries(grouped).map(([segment, items]) => `
    <section class="account-segment">
      <div class="segment-head">
        <p class="eyebrow">${escapeHtml(segment)}</p>
        <h3>${escapeHtml(data.vertical)}</h3>
      </div>
      <div class="account-card-grid">
        ${items.map(item => {
          const query = accountSearchQuery(item.account, data.vertical, item.products);
          const estimate = accountRevenueEstimate(item, bench);
          return `
            <article class="account-suggestion-card">
              <div class="account-card-top">
                <div>
                  <span class="account-revenue">${escapeHtml(item.revenue)}</span>
                  <h4>${escapeHtml(item.account)}</h4>
                </div>
                <a href="${webSearchUrl(query)}" target="_blank" rel="noreferrer">Research</a>
              </div>
              <p>${escapeHtml(item.fit)}</p>
              <div class="account-opportunity-metrics">
                <span><strong>${rangeText(estimate.annual, money)}</strong>Potential annual opportunity</span>
                <span><strong>${escapeHtml(item.products.join(" + "))}</strong>Product match</span>
              </div>
              <div class="pill-row">
                ${item.products.map(product => `<span class="pill amber">${escapeHtml(product)}</span>`).join("")}
              </div>
              <div class="match-strip">
                <strong>CoalitionX angle</strong>
                <span>${escapeHtml(item.angle)}</span>
              </div>
              <div class="match-strip growth-strip">
                <strong>Growth opportunity</strong>
                <span>${escapeHtml(estimate.growth)}</span>
              </div>
              <div class="reference-grid compact-reference-grid">
                ${referenceSearchCard("Account and product fit", query, "Validate revenue band, product families, reviews, supplier signals and manufacturing clues.")}
              </div>
              <button class="secondary compact use-account" type="button" data-account="${escapeHtml(item.account)}" data-role="${escapeHtml(data.role)}" data-notes="${escapeHtml(`${item.fit} ${item.angle} ${estimate.growth}`)}">Use as target</button>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `).join("");

  return `
    <section class="account-suggestions-view">
      <article class="card product-hero">
        <div>
          <p class="eyebrow">Account suggestions</p>
          <h3>Suggested targets for ${escapeHtml(data.vertical)}</h3>
          <p class="source-list">Segmented by revenue band and paired with relevant product matches. Treat these as SDR starting points, then validate with HubSpot, Google, ImportYeti, reviews and direct discovery.</p>
        </div>
        <div class="assumption-grid segment-summary">
          <span><strong>${escapeHtml(suggestions[0].segment)}</strong>Enterprise targets</span>
          <span><strong>${escapeHtml(suggestions[1].segment)}</strong>Upper mid-market</span>
          <span><strong>${escapeHtml(suggestions[2].segment)}</strong>Growth accounts</span>
          <span><strong>${bench.products.slice(0, 3).map(escapeHtml).join(", ")}</strong>Product match basis</span>
        </div>
      </article>
      ${segmentCards}
    </section>
  `;
}

function verticalAccountFocusCard(data) {
  const suggestions = accountSuggestions[data.vertical] || accountSuggestions["Smart home / connected devices"];
  const bench = productBenchmarks[data.vertical] || productBenchmarks["Smart home / connected devices"];
  const persona = getPersona(data.role);

  const accountCards = suggestions.map(item => {
    const estimate = accountRevenueEstimate(item, bench);
    const query = accountSearchQuery(item.account, data.vertical, item.products);
    const tierClass = item.segment.includes("Enterprise") ? "tier-enterprise" : item.segment.includes("Upper") ? "tier-upper" : "tier-growth";
    const dfm = dfmSuggestions(item.products[0], data.vertical, bench).slice(0, 2);

    return `
      <article class="focus-account-card ${tierClass}">
        <div class="focus-tier-badge">
          <span class="tier-pill">${escapeHtml(item.segment)}</span>
          <span class="tier-revenue">${escapeHtml(item.revenue)}</span>
        </div>
        <h3 class="focus-account-name">${escapeHtml(item.account)}</h3>
        <p class="focus-account-fit">${escapeHtml(item.fit)}</p>

        <div class="focus-block">
          <span class="focus-label">Product match</span>
          <div class="pill-row focus-pills">${item.products.map(p => `<span class="pill amber">${escapeHtml(p)}</span>`).join("")}</div>
        </div>

        <div class="focus-opportunity-grid">
          <div class="focus-opp-cell">
            <span class="focus-opp-label">Revenue opportunity</span>
            <strong class="focus-opp-value">${rangeText(estimate.annual, money)}</strong>
          </div>
          <div class="focus-opp-cell">
            <span class="focus-opp-label">Growth signal</span>
            <strong class="focus-opp-value focus-growth">${escapeHtml(estimate.growth.split(".")[0])}</strong>
          </div>
        </div>

        <div class="focus-angle-strip">
          <span class="focus-label">CoalitionX &amp; DFM angle</span>
          <p>${escapeHtml(item.angle)}</p>
          <ul class="focus-dfm-list">${dfm.map(d => `<li>${escapeHtml(d)}</li>`).join("")}</ul>
        </div>

        <div class="focus-card-actions">
          <button class="primary compact use-account" type="button"
            data-account="${escapeHtml(item.account)}"
            data-role="${escapeHtml(data.role)}"
            data-notes="${escapeHtml(`${item.fit} ${item.angle} ${estimate.growth}`)}">
            Activate strategy ›
          </button>
          <a class="focus-research-link" href="${webSearchUrl(query)}" target="_blank" rel="noreferrer">Research ↗</a>
        </div>
      </article>
    `;
  }).join("");

  return `
    <div class="focus-head">
      <div>
        <p class="eyebrow">Account discovery · ${escapeHtml(data.vertical)}</p>
        <h2>Target accounts by revenue tier</h2>
        <p class="source-list">Accounts ranked by revenue band and matched to product opportunities and ${escapeHtml(getCompanyName())} capabilities for <strong style="color:#ffc176">${escapeHtml(persona.persona)}</strong> targets. Select an account below to generate the full GTM strategy, outreach sequence, call script and product match.</p>
      </div>
      <div class="focus-head-actions">
        <button class="primary quick-action" data-jump="accounts" type="button">Full account map ›</button>
      </div>
    </div>
    <div class="focus-account-grid">${accountCards}</div>
    <div class="focus-footer">
      <p class="source-list">Tier definitions: Enterprise £1B+ parent scale · Upper mid-market £250M–£1B · Growth £50M–£250M. Revenue opportunity is estimated annual FATP/manufacturing at base-case volume. Validate through HubSpot, ImportYeti, reviews and direct discovery.</p>
    </div>
  `;
}

function renderRolePreview() {
  const previewEl = document.getElementById("rolePreviewPanel");
  if (!previewEl) return;
  const roleEl = document.getElementById("role");
  const role = roleEl ? roleEl.value : "Business owner";
  const persona = getPersona(role);

  const fearsHtml = persona.fears && persona.fears.length
    ? `<div><span class="role-preview-label">What they fear</span><ul class="role-preview-cares">${persona.fears.map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul></div>`
    : '';
  const languageHtml = persona.language && persona.language.length
    ? `<div><span class="role-preview-label">Language to use</span><div class="language-pills">${persona.language.map(l => `<span class="pill-tag">${escapeHtml(l)}</span>`).join("")}</div></div>`
    : '';
  const hookHtml = persona.hook
    ? `<div class="role-preview-hook"><span class="role-preview-label">Opening hook guidance</span><p class="persona-hook-text">${escapeHtml(persona.hook)}</p></div>`
    : '';

  previewEl.innerHTML = `
    <div class="role-preview-inner">
      <div class="role-preview-top">
        <div>
          <p class="eyebrow">Persona mapped</p>
          <strong class="role-preview-name">${escapeHtml(persona.persona)}</strong>
          ${persona.title ? `<p class="source-list" style="margin-top:2px;color:var(--text-lo);">${escapeHtml(persona.title)}</p>` : ''}
        </div>
        <button class="primary compact" id="generateRoleStrategyBtn" type="button">Generate for this role ›</button>
      </div>
      <div class="role-preview-grid">
        <div>
          <span class="role-preview-label">What they care about</span>
          <ul class="role-preview-cares">${persona.cares.map(c => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
        </div>
        <div>
          <span class="role-preview-label">Recommended CTA</span>
          <p class="role-cta-text">&ldquo;…${escapeHtml(persona.cta)}&rdquo;</p>
        </div>
        ${fearsHtml}
        ${languageHtml}
      </div>
      ${hookHtml}
    </div>
  `;
  previewEl.classList.remove("hidden");
}

function renderVerticalAccounts() {
  const panel = accountFocusPanel();
  if (!panel) return;
  panel.innerHTML = verticalAccountFocusCard(collectFormData());
  renderRolePreview();
}

function money(value) {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${Math.round(value / 1000)}K`;
  return `$${Math.round(value)}`;
}

function units(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return `${value}`;
}

function rangeText(range, formatter) {
  return `${formatter(range[0])} - ${formatter(range[1])}`;
}

function avg(range) {
  return (range[0] + range[1]) / 2;
}

function productOpportunities(bench) {
  const unitMultipliers = [1.3, 0.85, 0.45];
  const retailMultipliers = [1.15, 0.8, 0.55];
  return bench.products.slice(0, 3).map((name, index) => {
    const retail = [
      bench.retail[0] * retailMultipliers[index],
      bench.retail[1] * retailMultipliers[index]
    ];
    const annualUnits = [
      Math.round(bench.annualUnits[0] * unitMultipliers[index]),
      Math.round(bench.annualUnits[1] * unitMultipliers[index]),
      Math.round(bench.annualUnits[2] * unitMultipliers[index])
    ];
    const avgRetail = avg(retail);
    const costRange = [
      avgRetail * bench.manufacturingCostPct[0],
      avgRetail * bench.manufacturingCostPct[1]
    ];
    return {
      name,
      retail,
      annualUnits,
      costRange,
      reviewChallenges: bench.reviewChallenges.slice(index, index + 4).concat(bench.reviewChallenges).slice(0, 4)
    };
  });
}

function dfmSuggestions(productName, vertical, bench) {
  const product = productName.toLowerCase();
  const base = [
    "Run early DFM/DFA to reduce screw count, manual handling and assembly tolerance stack-up before tooling freeze.",
    "Define production test coverage at PCBA and FATP level, including traceability for critical functional failures.",
    "Review enclosure material, wall thickness, ribs, clips and cosmetic surfaces before hard tooling commitment.",
    "Build EVT/DVT/PVT gate criteria so review complaints map to measurable validation and yield controls.",
    "Conduct BOM risk review: identify single-source components, long lead-time parts and alternative supplier qualification.",
    "Define IPC standards for PCBA, soldering, conformal coating and cleanliness before production handover.",
    "Align EMC/RF pre-compliance testing plan before DVT to avoid re-spins from shielding, layout or cable routing."
  ];
  const verticalSpecific = {
    "Air purification & home appliances": [
      "Validate airflow path, gasket sealing, filter fit, motor vibration, acoustic leakage and sensor placement before tooling commit.",
      "Design serviceable filter access and regional plug/SKU variants without multiplying tooling complexity.",
      "Include HEPA bypass leakage, PM2.5 sensor calibration drift and motor brush life in DVT validation protocol."
    ],
    "Medical & health devices": [
      "Lock cleaning, ingress, biocompatibility-adjacent material choices and traceability requirements before DVT.",
      "Separate regulated critical-to-quality tests from cosmetic or packaging checks in the production flow.",
      "Document DHF alignment with manufacturing process; establish PFMEA, control plans and inspection records at PVT."
    ],
    "Automotive & e-mobility": [
      "Stress connector retention, thermal cycling, vibration, EMC shielding and potting/adhesive choices before PVT.",
      "Align fixture design and end-of-line test data with PPAP-style evidence expectations.",
      "Apply DFMEA on safety-critical signal paths; define functional safety requirements (ISO 26262 reference) before DVT architecture freeze."
    ],
    "Audio, gaming & consumer electronics": [
      "Validate acoustic cavity consistency, battery swelling clearance, microphone mesh, button feel and cosmetic yield.",
      "Use golden sample audio profiles and automated acoustic test fixtures before ramp.",
      "Control adhesive bond line for speaker membrane, define acoustic foam cut tolerance and include TWS sync reliability in DVT criteria."
    ],
    "AgriTech / rugged IoT": [
      "Prioritise gasket compression, ultrasonic welding or overmoulding, antenna position and battery access strategy.",
      "Test drop, mud, humidity, UV, temperature and field-service workflows before final enclosure tooling.",
      "Validate LoRa/cellular antenna performance under field-typical RF environments; include isolation from battery and metal chassis in layout review."
    ],
    "Water purification": [
      "Design for leak paths, pump isolation, food-contact plastics, filter alignment and consumer replacement errors.",
      "Use pressure and leak test fixtures and packaging drop tests before full retail launch.",
      "Validate NSF/FDA-adjacent material declarations for all water-contact polymers, tubing, adhesives and coatings before BOM freeze."
    ],
    "Robotics / industrial automation": [
      "Review thermal paths, cable strain relief, connector access, calibration fixtures and service module replacement strategy.",
      "Plan sensor calibration and firmware flashing as controlled, logged production steps — not manual bench work.",
      "Define safety-rated E-stop, IP rating and cable management strategy before enclosure tooling; late changes carry high NRE risk."
    ],
    "Smart home / connected devices": [
      "Validate RF antenna keep-out, pairing button access, thermal drift, low-power modes and certification lab readiness.",
      "Design firmware flashing, MAC/serial labelling and app-pairing checks into the FATP station sequence.",
      "Run FCC/CE/UKCA pre-scan on near-final EVT hardware to catch RF emissions, harmonics and ESD vulnerabilities before DVT freeze."
    ],
  };
  const productSpecific = [];
  if (product.includes("pcba") || product.includes("controller") || product.includes("gateway") || product.includes("sensor")) {
    productSpecific.push("Separate high-risk PCBA functions into boundary scan, programming, RF/calibration and final system tests.");
    productSpecific.push("Use ICT and flying-probe bare-board coverage before populated-board assembly to reduce rework cost.");
  }
  if (product.includes("purifier") || product.includes("fan") || product.includes("humidifier")) {
    productSpecific.push("Model airflow, water ingress, noise and motor isolation as DVT acceptance tests, not post-launch quality fixes.");
    productSpecific.push("Use acoustic chamber measurements and automated airflow bench to create golden-unit profiles for production line audit.");
  }
  if (product.includes("headset") || product.includes("earbuds") || product.includes("speaker")) {
    productSpecific.push("Control acoustic mesh, adhesive process, battery placement and cosmetic tolerance as critical-to-quality items.");
    productSpecific.push("Include TWS sync reliability, Bluetooth re-pairing time and charging case contact force in DVT acceptance criteria.");
  }
  if (product.includes("robot") || product.includes("automation") || product.includes("vision")) {
    productSpecific.push("Define calibration target, jig accuracy and drift specification for vision/sensor systems as part of FATP test plan.");
  }
  return [...productSpecific, ...(verticalSpecific[vertical] || []), ...base].slice(0, 7);
}

function accountRevenueEstimate(item, bench) {
  const baseUnits = bench.annualUnits[1];
  const fullRange = [baseUnits * bench.fatpPerUnit.full[0], baseUnits * bench.fatpPerUnit.full[1]];
  const multiplier = item.segment.includes("Enterprise") ? 1.35 : item.segment.includes("Upper") ? 0.82 : 0.38;
  return {
    annual: [fullRange[0] * multiplier, fullRange[1] * multiplier],
    growth: item.segment.includes("Enterprise")
      ? "Portfolio expansion, regionalisation and lifecycle cost-down across multiple product families."
      : item.segment.includes("Upper")
        ? "New SKU launches, supplier diversification and faster NPI-to-ramp conversion."
        : "Scale-up support, DFM discipline and early manufacturing partnership before incumbent lock-in."
  };
}

function productImage(productName, vertical) {
  const label = productName.split(" ").map(word => word[0]).join("").slice(0, 3).toUpperCase();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#eef5f0"/>
          <stop offset="1" stop-color="#dce9e2"/>
        </linearGradient>
      </defs>
      <rect width="640" height="360" rx="28" fill="url(#bg)"/>
      <rect x="50" y="54" width="540" height="252" rx="22" fill="#ffffff" opacity="0.72"/>
      <circle cx="144" cy="180" r="64" fill="#143c31"/>
      <text x="144" y="193" text-anchor="middle" font-family="Arial" font-size="34" font-weight="700" fill="#ffffff">${label}</text>
      <text x="238" y="154" font-family="Arial" font-size="30" font-weight="700" fill="#172022">${escapeHtml(productName)}</text>
      <text x="238" y="192" font-family="Arial" font-size="18" fill="#657277">${escapeHtml(vertical)}</text>
      <text x="238" y="232" font-family="Arial" font-size="16" fill="#246b52">Product opportunity placeholder - validate exact SKU image</text>
    </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function opportunityRows(bench, baseUnits) {
  return [
    ["Early engineering / NPI", "Feasibility, DFM/DFA, architecture review, EVT/DVT planning, BOM risk and prototype support", [45000, 220000], "Project", [1, 1]],
    ["PCBA only", "SMT, PCBA sourcing, test coverage, yield improvement and electronics assembly", [6, 28], "Unit", null],
    ["Plastics injection moulding", "Tooling review, mould fabrication, injection moulding, finishing and cosmetic yield improvement", [4, 22], "Unit", null],
    ["Tooling / fixtures / NRE", "Soft/hard tooling, test jigs, fixtures, NRE and validation support", [35000, 350000], "Project", [1, 1]],
    ["Production test systems", "Functional test, reliability screening, traceability and ITTS-style line test systems", [3, 18], "Unit", null],
    ["Automation / line optimisation", "Semi or full automation, yield improvement, cycle-time reduction and line balancing", [75000, 650000], "Project", [1, 1]],
    ["Regional FATP", "Final assembly, testing, packaging, localisation, labelling and market access support", bench.fatpPerUnit.regional, "Unit", null],
    ["Full FATP", "Assembly, testing, packaging, quality controls, launch support and lifecycle optimisation", bench.fatpPerUnit.full, "Unit", null]
  ].map(([level, scope, value, basis, fixedVolume]) => {
    const volume = fixedVolume || [bench.annualUnits[0], bench.annualUnits[2]];
    const annualLow = value[0] * volume[0];
    const annualHigh = value[1] * volume[1];
    const baseLow = value[0] * (fixedVolume ? 1 : baseUnits);
    const baseHigh = value[1] * (fixedVolume ? 1 : baseUnits);
    return `
      <tr>
        <td>${level}</td>
        <td>${scope}</td>
        <td>${basis}</td>
        <td>${rangeText(value, money)}</td>
        <td>${rangeText([baseLow, baseHigh], money)}</td>
        <td>${rangeText([annualLow, annualHigh], money)}</td>
      </tr>
    `;
  }).join("");
}

function productMatchCard(data) {
  const bench = productBenchmarks[data.vertical] || productBenchmarks["Smart home / connected devices"];
  const retailBase = avg(bench.retail);
  const costLow = retailBase * bench.manufacturingCostPct[0];
  const costHigh = retailBase * bench.manufacturingCostPct[1];
  const baseUnits = bench.annualUnits[1];
  const fullLow = baseUnits * bench.fatpPerUnit.full[0];
  const fullHigh = baseUnits * bench.fatpPerUnit.full[1];
  const account = data.accountName;
  const topProducts = productOpportunities(bench);
  const selectedProduct = topProducts[0].name;
  const reviewQuery = `${account} ${selectedProduct} reviews problems reliability teardown`;
  const manufacturerQuery = `${account} ${selectedProduct} manufacturer factory supplier ImportYeti`;
  const topProductsQuery = `${account} top selling products ${data.vertical}`;

  const topProductCards = topProducts.map((product, index) => `
    ${(() => {
      const queries = productQueries(account, product.name, data.vertical);
      return `
    <article class="product-card">
      <img class="product-image" src="${productImage(product.name, data.vertical)}" alt="${escapeHtml(product.name)} product opportunity visual">
      <div class="product-card-head">
        <span>0${index + 1}</span>
        <strong>${escapeHtml(product.name)}</strong>
      </div>
      <div class="assumption-grid compact-assumptions">
        <span><strong>${rangeText(product.retail, money)}</strong>Retail price</span>
        <span><strong>${rangeText(product.costRange, money)}</strong>Current mfg cost est.</span>
        <span><strong>${units(product.annualUnits[0])} / ${units(product.annualUnits[1])} / ${units(product.annualUnits[2])}</strong>Low / base / high units</span>
        <span><strong>${rangeText([product.annualUnits[1] * bench.fatpPerUnit.full[0], product.annualUnits[1] * bench.fatpPerUnit.full[1]], money)}</strong>Base full FATP rev.</span>
      </div>
      <h4>Potential hardware issues</h4>
      ${list(product.reviewChallenges.map(item => `${item}: verify through review mining, support forums, teardown notes and discovery.`))}
      <h4>DFM / technical suggestions</h4>
      ${list(dfmSuggestions(product.name, data.vertical, bench))}
      <h4>Reference searches</h4>
      <div class="reference-grid compact-reference-grid">
        ${referenceSearchCard("Review pain", queries.reviews, "Find recurring customer review themes and product reliability complaints.")}
        ${referenceSearchCard("Manufacturer clues", queries.manufacturer, "Look for OEM/ODM, factory, made-in, supplier or contract manufacturer references.")}
        ${referenceSearchCard("Teardown / FCC", queries.teardown, "Validate electronics, PCBA, internal photos, chipset and design clues.")}
      </div>
      <div class="source-link-row">
        <a href="${webSearchUrl(queries.image)}" target="_blank" rel="noreferrer">Image/source</a>
        <a href="${webSearchUrl(queries.complaints)}" target="_blank" rel="noreferrer">Complaints</a>
        <a href="${webSearchUrl(queries.retail)}" target="_blank" rel="noreferrer">Retail</a>
        <a href="${webSearchUrl(queries.importyeti)}" target="_blank" rel="noreferrer">ImportYeti</a>
      </div>
    </article>
      `;
    })()}
  `).join("");

  const scenarioRows = opportunityRows(bench, baseUnits);

  return `
    <section class="product-grid">
      <article class="card product-hero">
        <div>
          <p class="eyebrow">Product match</p>
          <h3>${escapeHtml(account)} hardware opportunity map</h3>
          <p class="source-list">Estimates below are SDR planning ranges. Validate top products, manufacturer, factory location and costs through customer reviews, teardown/FCC filings, ImportYeti, HubSpot, distributor data and direct discovery.</p>
        </div>
        <div class="source-link-row">
          <a href="${webSearchUrl(`${quoted(account)} ${quoted(data.vertical)} ("top selling" OR bestseller OR "best products" OR "product range")`)}" target="_blank" rel="noreferrer">Top products</a>
          <a href="${webSearchUrl(`${quoted(account)} ${quoted(selectedProduct)} (reviews OR complaints OR defects OR reliability)`)}" target="_blank" rel="noreferrer">Reviews / issues</a>
          <a href="${webSearchUrl(`${quoted(account)} ${quoted(selectedProduct)} (manufacturer OR supplier OR factory OR ImportYeti OR "FCC ID")`)}" target="_blank" rel="noreferrer">Manufacturer clues</a>
        </div>
      </article>

      <article class="card">
        <h3>Top three product opportunities</h3>
        <p class="source-list">Use these as category-level candidates until live product ranking is validated for ${escapeHtml(account)}. Replace with confirmed top-selling SKUs from ecommerce rankings, distributor data, HubSpot notes, customer discovery or market reports.</p>
      </article>

      <section class="top-products product-wide">${topProductCards}</section>

      <article class="card">
        <h3>Potential hardware challenges from review themes</h3>
        ${list(bench.reviewChallenges.map(item => `${item}: use reviews to confirm frequency, severity and whether it maps to design, test, quality or FATP.`))}
      </article>

      <article class="card">
        <h3>Commercial assumptions</h3>
        <div class="assumption-grid">
          <span><strong>${rangeText(bench.retail, money)}</strong>Retail price band</span>
          <span><strong>${rangeText([costLow, costHigh], money)}</strong>Estimated current manufacturing cost / unit</span>
          <span><strong>${units(bench.annualUnits[0])} / ${units(baseUnits)} / ${units(bench.annualUnits[2])}</strong>Low / base / high annual units</span>
          <span><strong>${rangeText([fullLow, fullHigh], money)}</strong>Base annual full FATP revenue</span>
        </div>
      </article>

      <article class="card product-wide">
        <h3>Opportunity revenue by ${escapeHtml(getCompanyName())} role</h3>
        <table class="revenue-table">
          <thead>
            <tr>
              <th>Opportunity row</th>
              <th>What ${escapeHtml(getCompanyName())} could own</th>
              <th>Basis</th>
              <th>Revenue range</th>
              <th>Base case annual</th>
              <th>Low-high annual</th>
            </tr>
          </thead>
          <tbody>${scenarioRows}</tbody>
        </table>
      </article>

      <article class="card">
        <h3>Manufacturer and location evidence</h3>
        ${list([
          `Current manufacturer: unknown until verified. Search ImportYeti, shipment data, FCC IDs, teardown articles and supplier markings for ${account}.`,
          `Likely manufacturing footprint: ${bench.likelyRegions}`,
          "Ask discovery question: who owns PCBA, plastics/tooling, FATP, test fixtures and packaging today?",
          "Check if the pain is design/manufacturing upstream or regional FATP/logistics downstream."
        ])}
      </article>

      <article class="card">
        <h3>Discovery prompts for product match</h3>
        ${list([
          "Which product family has the biggest review, quality, supply or cost issue?",
          "What is annual volume by SKU and region?",
          "What is current landed cost and which process step is most painful?",
          "Are you seeking OEM, ODM, JDM, full FATP or regional FATP only?",
          "Where is the product currently assembled, tested and packed?"
        ])}
      </article>
    </section>
  `;
}

function newsCard(data, output) {
  const queries = newsQueries(data.accountName, data.vertical);
  const accountQuery = queries.account;
  const industryQuery = queries.industry;
  const productQuery = queries.product;
  const defaultKeywords = `${data.accountName}, ${data.vertical}, product launch, supplier, manufacturing, partnership, funding`;
  const fallbackNews = [
    ["Account product news", accountQuery, "Use this to find account launches, supplier moves, factory updates and leadership changes."],
    ["Industry trend news", industryQuery, "Use this to connect outreach to category pressures, market growth and new compliance requirements."],
    ["Product review signal", productQuery, "Use this to identify recurring hardware complaints that can become value-led outreach."]
  ];
  return `
    ${card("Recent news and value signals", `
      <p class="source-list">This panel uses Google News keyword searches through a Netlify Function when hosted. Results are shown with source links and should be reviewed before being used in outreach.</p>
      <div class="inline-form">
        <label class="full">Google news keywords<input id="newsKeywords" value="${escapeHtml(defaultKeywords)}" placeholder="account, product line, industry, trigger words"></label>
      </div>
      <div class="actions">
        <button class="primary" id="fetchNews" type="button">Fetch recent news</button>
        <a class="secondary compact" href="${searchUrl(accountQuery)}" target="_blank" rel="noreferrer">Account news</a>
        <a class="secondary compact" href="${searchUrl(industryQuery)}" target="_blank" rel="noreferrer">Industry news</a>
      </div>
      <div id="newsStatus" class="status-text"></div>
      <div id="newsResults" class="news-list">
        ${fallbackNews.map(([title, query, angle]) => referenceSearchCard(title, query, angle, "news")).join("")}
      </div>
    `)}
    ${card("How to use as value", list(output.newsAngles))}
    ${copyBlock("Value-add message prompt", `Using recent news about ${data.accountName} or the ${data.vertical} market, draft a short value-add message for ${output.persona.persona}.\n\nStructure:\n1. Mention the news in one sentence.\n2. Explain why it may matter to their role.\n3. Connect it to ${output.cap.capabilities.slice(0, 2).join(" and ")}.\n4. Offer ${output.article} as a useful resource.\n5. End with a soft CTA.`)}
  `;
}

function render(data, output) {
  lastData = data;
  lastOutput = output;
  const otEl = outputTitle();
  const baEl = briefAccount();
  const bmEl = briefMeta();
  const bpEl = briefPersona();
  const bsEl = briefSignal();
  const boEl = briefObjective();
  const esEl = emptyState();
  const resEl = results();
  if (otEl) otEl.textContent = `${data.accountName}: ${output.persona.persona}`;
  if (baEl) baEl.textContent = data.accountName;
  if (bmEl) bmEl.textContent = `${data.vertical} | ${data.role} | ${data.prospectName}`;
  if (bpEl) bpEl.textContent = output.persona.persona;
  if (bsEl) bsEl.textContent = data.signal;
  if (boEl) boEl.textContent = data.objective;
  if (esEl) esEl.classList.add("hidden");
  if (resEl) resEl.classList.remove("hidden");

  // Reset to strategy tab
  document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  const strategyPanel = document.getElementById("strategy");
  const strategyTab = document.querySelector('.tab[data-tab="strategy"]');
  if (strategyPanel) strategyPanel.classList.add("active");
  if (strategyTab) strategyTab.classList.add("active");
  updateNavAccount();

  // Show AI loading banner at the top of the strategy tab
  const aiLoading = aiEnrichLoadingBanner(data.accountName);

  document.getElementById("strategy").innerHTML = `
    ${aiLoading}
    ${premiumSummary(data, output)}
    <div class="grid-2">
      ${card("Account fit", `<div class="pill-row"><span class="pill blue">${escapeHtml(data.vertical)}</span><span class="pill amber">${escapeHtml(data.signal)}</span><span class="pill violet">${escapeHtml(data.objective)}</span></div>${list(output.cap.pains.map(p => `Likely pain: ${p}`))}`)}
      ${card("Capability match", `<div class="pill-row">${output.cap.capabilities.map((c, i) => `<span class="pill ${["blue", "amber", "coral", "violet"][i]}">${escapeHtml(c)}</span>`).join("")}</div><p class="source-list">${escapeHtml(output.cap.proof)}</p>`)}
    </div>
    ${card("GTM strategy", list(output.strategy.plays))}
    ${knowledgePanel(data, output)}
    ${timeline(output)}
    <div class="grid-2">
      ${card("Risks to manage", list(output.strategy.risks))}
      ${card("Next actions", list(output.strategy.nextSteps))}
    </div>
  `;

  document.getElementById("accounts").innerHTML = accountSuggestionsCard(data);
  document.getElementById("news").innerHTML = newsCard(data, output);
  document.getElementById("product").innerHTML = productMatchCard(data);

  document.getElementById("outreach").innerHTML = [
    copyBlock("LinkedIn connection request", output.messages.linkedinConnect),
    copyBlock("LinkedIn follow-up", output.messages.linkedinFollow),
    copyBlock("Email 1", output.messages.emailOne),
    copyBlock("Email 2", output.messages.emailTwo),
    copyBlock("Break-up / final check", output.messages.breakup)
  ].join("");

  const personaFearsCallHtml = output.persona.fears && output.persona.fears.length
    ? card('Persona fears to address in discovery', list(output.persona.fears.map(f => `Watch for: ${f}`)))
    : '';
  const personaDQCallHtml = output.persona.discoveryQuestions && output.persona.discoveryQuestions.length
    ? card('Persona discovery questions · ' + escapeHtml(output.persona.title || output.persona.persona), list(output.persona.discoveryQuestions))
    : '';
  const personaLanguageCallHtml = output.persona.language && output.persona.language.length
    ? `<article class="card"><h3>Language that resonates with this persona</h3><div class="language-pills">${output.persona.language.map(l => `<span class="pill-tag">${escapeHtml(l)}</span>`).join('')}</div></article>`
    : '';

  document.getElementById("call").innerHTML = `
    ${copyBlock("Fact-finding call script", output.messages.callScript)}
    ${copyBlock("Handbook qualification add-on", output.messages.handbookDiscovery)}
    ${personaDQCallHtml}
    ${personaFearsCallHtml}
    ${personaLanguageCallHtml}
    ${card("Meeting qualification notes", list(output.persona.cares.map(c => `Listen for ${c}.`).concat([
      "If qualified, capture product line, timeline, decision process, technical challenge and next internal owner.",
      "If not qualified, ask for the right fact-finding contact and log the outcome in HubSpot.",
      "Use the Sales Kick-Off lifecycle lens: EVT reduces feasibility risk, DVT reduces design/compliance risk, PVT reduces scale/yield risk."
    ])))}
  `;

  document.getElementById("research").innerHTML = `
    ${card("Research hypotheses", list(output.research))}
    ${card("Handbook and kick-off knowledge now applied", list([
      `Use Ahmed's Handbook decision tree to decide whether there is a real ${getCompanyName()} opportunity or just a weak supplier conversation.`,
      "Use RFX qualification fields before pushing technical or commercial teams into proposal work.",
      "Use Sales Kick-Off lifecycle language to anchor discovery around EVT, DVT, PVT, RFQ readiness, NRE, tooling and FATP location.",
      "Use EE/ME/TPM collaboration logic to identify the right stakeholders and avoid single-threaded outreach.",
      "Use HubSpot and ImportYeti discipline to turn CRM and supply-chain facts into personalised outreach hypotheses."
    ]))}
    ${copyBlock("Article or value-add prompt", `Create a concise article or briefing for ${data.accountName} on: ${output.article}\n\nMake it practical, role-specific for ${output.persona.persona}, and end with a soft CTA to compare notes or review a checklist.`)}
    ${card("Material used", `<p class="source-list">${sourceDocs.map(escapeHtml).join("<br>")}</p>`)}
  `;

  // New tabs
  const competitorEl = document.getElementById("competitor");
  if (competitorEl) competitorEl.innerHTML = renderCompetitorTab(data);
  const awardsEl = document.getElementById("awards");
  if (awardsEl) awardsEl.innerHTML = renderAwardsTab(data);
  const swotEl = document.getElementById("swot");
  if (swotEl) swotEl.innerHTML = renderSwotTab(data, output);
  const evaluationEl = document.getElementById("evaluation");
  if (evaluationEl) {
    evaluationEl.innerHTML = renderEvaluationTab(data);
    initRfxScoring();
  }
  const playbookEl = document.getElementById("playbook");
  if (playbookEl) playbookEl.innerHTML = renderPlaybookTab(data, output);

  // Trigger AI enrichment asynchronously — injects into tabs when ready
  callAiEnrich(data).then(enriched => injectAiEnrichment(enriched, data));

  lastOutputText = [
    `Account: ${data.accountName}`,
    `Persona: ${output.persona.persona}`,
    `Vertical: ${data.vertical}`,
    `Product match estimate: ${(productBenchmarks[data.vertical] || productBenchmarks["Smart home / connected devices"]).products.join(", ")}`,
    "",
    "GTM Strategy:",
    ...output.strategy.plays.map(item => `- ${item}`),
    "",
    "LinkedIn Connection:",
    output.messages.linkedinConnect,
    "",
    "LinkedIn Follow-up:",
    output.messages.linkedinFollow,
    "",
    "Email 1:",
    output.messages.emailOne,
    "",
    "Email 2:",
    output.messages.emailTwo,
    "",
    "Call Script:",
    output.messages.callScript
  ].join("\n");
}

/* ── Competitor intelligence ── */
function buildCompetitorIntel(data) {
  const vertCompetitors = {
    "Air purification & home appliances": [
      { name: "Foxconn / Hon Hai", type: "Tier-1 EMS", regions: "CN, MX, CZ", strength: "Scale & Apple relationships", weakness: "Min. order thresholds, limited DFM advisory", edge: `${getCompanyName()} offers FATP flex in HU & MY with smaller MOQ and dedicated NPI engineering support — ideal for 50K–500K runs.` },
      { name: "Flex Ltd", type: "Global EMS", regions: "Global 30+ sites", strength: "Global footprint, end-to-end", weakness: "Premium cost, slow mid-market responsiveness", edge: `${getCompanyName()}'s EU-based FATP (Hungary) provides comparable EU/US compliance at lower total landed cost with a dedicated engineering liaison.` },
      { name: "Jabil Inc.", type: "Tier-1 EMS", regions: "US, CN, MY, MX", strength: "Vertically integrated, strong medical/industrial", weakness: "Requires large volume commitments", edge: `${getCompanyName()}'s agile NPI-to-volume pathway (EVT→DVT→PVT→FATP) competes on timeline flexibility and DFM/DFA depth.` }
    ],
    "Medical & health devices": [
      { name: "Integer Holdings", type: "Medical CM", regions: "US, Ireland, Malaysia", strength: "Deep medical regulatory expertise", weakness: "Focused on implantables, limited CE/PCBA scope", edge: `${getCompanyName()} holds ISO 13485-ready processes with PCBA and plastics under one roof — reducing supply chain risk.` },
      { name: "Celestica", type: "Tier-1 EMS", regions: "CN, MY, EU, Americas", strength: "Strong complex board capabilities", weakness: "High overhead, slow NPI cycles", edge: `${getCompanyName()} offers co-development DFM review from concept stage, reducing re-spin cost and accelerating market entry.` },
      { name: "Sanmina Corporation", type: "EMS / CM", regions: "US, EU, Asia", strength: "Advanced PCB + assembly integration", weakness: "Limited ODM capability", edge: `${getCompanyName()} provides JDM/ODM options enabling product co-development, not just manufacturing hand-off.` }
    ],
    "Automotive & e-mobility": [
      { name: "Continental AG (mfg arm)", type: "Tier-1 Auto", regions: "DE, CN, US", strength: "Deep IATF16949 / ISO 26262 experience", weakness: "Captive production focus, little external CM", edge: `${getCompanyName()} delivers e-bike and EV ancillary electronics with IATF-adjacent quality controls, at a fraction of Tier-1 overhead.` },
      { name: "Magna International", type: "Tier-1 Auto CM", regions: "CA, EU, CN", strength: "Full vehicle systems, large capacity", weakness: "Not suited for sub-100K volumes or PCBA-first projects", edge: `${getCompanyName()}'s FATP in HU fills the EU e-mobility gap for sub-Tier-1 brands seeking EU-manufactured credentials.` },
      { name: "Bosch Manufacturing Services", type: "Internal CM", regions: "DE, CN, IN", strength: "Bosch ecosystem integration", weakness: "Captive; external OEMs excluded", edge: `${getCompanyName()} is an approved independent CM for brands unable to access Bosch or seeking supply chain independence.` }
    ],
    "Audio, gaming & consumer electronics": [
      { name: "Venture Corporation", type: "CM / EMS", regions: "SG, MY, CN, EU", strength: "Strong audio/consumer electronics history", weakness: "Malaysia-centric, limited EU FATP", edge: `${getCompanyName()}'s HU facility provides EU-origin advantage for tariff/compliance-sensitive audio brands targeting EU/US retail.` },
      { name: "BYD Electronics", type: "EMS", regions: "CN, HU, IN", strength: "Cost leadership, scale", weakness: "Primarily serves captive BYD/Apple volumes", edge: `${getCompanyName()} provides comparable CN+HU manufacturing with full ODM/JDM flexibility and brand-neutral IP handling.` },
      { name: "Luxshare Precision", type: "EMS / CM", regions: "CN, VN", strength: "Apple supply chain depth, fast ramp", weakness: "Limited EU presence, IP sensitivity concerns", edge: `${getCompanyName()}'s non-captive, IP-protected CM model with EU FATP is safer for brands wary of supply chain concentration.` }
    ]
  };
  const defaults = [
    { name: "Venture Corporation", type: "EMS / CM", regions: "SG, MY, CN, EU", strength: "Diversified CM with strong consumer focus", weakness: "Malaysia-centric production, limited EU FATP", edge: `${getCompanyName()}'s HU facility provides EU-origin advantage with comparable quality and more responsive NPI teams.` },
    { name: "Flex Ltd", type: "Global EMS", regions: "Global 30+ sites", strength: "End-to-end global CM with broad vertical coverage", weakness: "High minimum volumes, slow mid-market responsiveness", edge: `${getCompanyName()}'s agile 50K–500K FATP model and dedicated engineering liaison outcompete Flex for mid-market accounts.` },
    { name: "Jabil Inc.", type: "Tier-1 EMS", regions: "US, CN, MY, MX", strength: "Large-scale vertically integrated production", weakness: "Volume commitments exclude SME and growth brands", edge: `${getCompanyName()} provides full NPI-to-volume with DFM advisory from EVT stage — without volume lock-in.` }
  ];
  return (vertCompetitors[data.vertical] || defaults);
}

function renderCompetitorTab(data) {
  const competitors = buildCompetitorIntel(data);
  const cardsHtml = competitors.map(c => `
    <div class="competitor-card">
      <div class="competitor-name">${escapeHtml(c.name)}</div>
      <div class="competitor-type">${escapeHtml(c.type)}</div>
      <div class="competitor-row"><span class="competitor-label">Regions</span><span class="competitor-val">${escapeHtml(c.regions)}</span></div>
      <div class="competitor-row"><span class="competitor-label">Their strength</span><span class="competitor-val">${escapeHtml(c.strength)}</span></div>
      <div class="competitor-row"><span class="competitor-label">Their weakness</span><span class="competitor-val">${escapeHtml(c.weakness)}</span></div>
      <div class="intretech-edge"><strong style="display:block;font-size:9px;letter-spacing:.07em;text-transform:uppercase;color:var(--brand-hi);margin-bottom:5px;">${escapeHtml(getCompanyName())} edge</strong>${escapeHtml(c.edge)}</div>
    </div>
  `).join('');
  return `
    <div class="card" style="margin-bottom:12px;">
      <h3>Competitive landscape — ${escapeHtml(data.vertical)}</h3>
      <p class="source-list">Key EMS/CM competitors likely pitching ${escapeHtml(data.accountName || 'this account')}. Use these angles to position ${escapeHtml(getCompanyName())}'s differentiation in outreach and discovery calls.</p>
    </div>
    <div class="competitor-grid">${cardsHtml}</div>
    <div class="card" style="margin-top:12px;">
      <h3>Positioning summary</h3>
      <p class="source-list">${escapeHtml(getCompanyName())}'s primary differentiators vs. all EMS competitors: <strong>EU-based FATP (Hungary)</strong> for EU/US compliance advantage · <strong>Agile NPI-to-volume</strong> (50K–500K) without Tier-1 minimums · <strong>ODM/JDM co-development</strong> from EVT stage · <strong>Multi-site resilience</strong> (CN + MY + HU + MX) · <strong>IP-protected, non-captive</strong> manufacturing model.</p>
    </div>
  `;
}

/* ── Awards & signals ── */
function buildAwards(data) {
  const vertAwards = {
    "Air purification & home appliances": [
      { badge: "🏆", name: "CES Innovation Award", year: "2023–2024", org: "Consumer Technology Association", angle: `Reference their CES recognition when pitching connected/smart product development — position ${getCompanyName()}'s IoT PCBA and app-connectivity capabilities as a co-innovation asset.` },
      { badge: "🌿", name: "Red Dot Design Award", year: "Ongoing applicant", org: "Design Zentrum NRW", angle: `Red Dot winners prioritise DFM early to protect form — open with a ${getCompanyName()} DFM review offering to protect their award-winning aesthetics at scale.` },
      { badge: "♻️", name: "EU Ecodesign Compliance", year: "2024 mandate", org: "EU Commission", angle: `Ecodesign regulation creates urgency for supply chain restructuring — reference ${getCompanyName()}'s HU FATP as the EU-origin solution for compliance.` }
    ],
    "Audio, gaming & consumer electronics": [
      { badge: "🎮", name: "CES Best of Innovation", year: "2023–2024", org: "CTA", angle: `Lead with ${getCompanyName()}'s gaming-grade PCBA reliability and thermal management experience for award-winning product lines.` },
      { badge: "🏅", name: "iF Design Award", year: "Ongoing", org: "iF International Forum Design", angle: `iF winners need CM partners who protect form integrity — ${getCompanyName()}'s plastic tooling and surface finish capabilities are the angle.` },
      { badge: "📊", name: "Deloitte Tech Fast 50", year: "Recent", org: "Deloitte", angle: `Fast-growth signal — this account is scaling. Lead with ${getCompanyName()}'s ramp-ready FATP capacity to match their growth trajectory.` }
    ],
    "Medical & health devices": [
      { badge: "🏥", name: "MDR Compliance Certification", year: "2024", org: "EU Medical Device Regulation", angle: `MDR compliance requires CM partners with documented QMS — position ${getCompanyName()}'s ISO-ready processes and audit trail as de-risking the regulatory path.` },
      { badge: "🌡️", name: "FDA 510(k) / CE Mark holder", year: "Ongoing", org: "FDA / EU Notified Body", angle: `Reference ${getCompanyName()}'s experience supporting regulatory submissions through controlled CM processes — not just manufacturing.` },
      { badge: "🔬", name: "Medtech Innovator Award", year: "2023", org: "Medtech Innovator", angle: `Innovation award signals R&D investment — open with ${getCompanyName()}'s prototype-to-NPI engineering support to accelerate next product cycle.` }
    ]
  };
  const defaults = [
    { badge: "🏆", name: "Industry Recognition Award", year: "Recent", org: "Sector Association", angle: "Reference their recognition when opening outreach — shows you have done research and understand their market position." },
    { badge: "🌿", name: "Sustainability Commitment", year: "2024", org: "Corporate ESG report", angle: `ESG commitments require supply chain transparency — position ${getCompanyName()}'s multi-site FATP with audit-ready production controls as a sustainability-aligned CM.` },
    { badge: "📈", name: "Growth / Scale Milestone", year: "Recent", org: "Trade press / investor release", angle: `Growth signals scaling need — lead with ${getCompanyName()}'s ramp capacity and ability to move from pilot to high-volume without changing CM partner.` }
  ];
  return (vertAwards[data.vertical] || defaults);
}

function renderAwardsTab(data) {
  const awards = buildAwards(data);
  const cardsHtml = awards.map(a => `
    <div class="award-card">
      <div class="award-badge">${a.badge}</div>
      <div class="award-name">${escapeHtml(a.name)}</div>
      <div class="award-year">${escapeHtml(a.year)}</div>
      <div class="award-org">${escapeHtml(a.org)}</div>
      <div class="award-outreach-angle">${escapeHtml(a.angle)}</div>
    </div>
  `).join('');
  return `
    <div class="card" style="margin-bottom:12px;">
      <h3>Awards, signals &amp; outreach leverage — ${escapeHtml(data.accountName || 'Account')}</h3>
      <p class="source-list">Use these recognition signals as personalised outreach hooks. Referencing specific awards or certifications demonstrates research depth and creates a relevance bridge to ${escapeHtml(getCompanyName())} capabilities.</p>
    </div>
    <div class="awards-grid">${cardsHtml}</div>
    <div class="card" style="margin-top:12px;">
      <h3>Research prompt</h3>
      <p class="source-list">Verify current awards for <strong>${escapeHtml(data.accountName || 'this account')}</strong>:<br>
      Search: <code style="background:rgba(255,122,24,0.08);padding:2px 7px;border-radius:4px;font-size:11px;">"${escapeHtml(data.accountName || 'company name')}" award OR recognition OR certification 2023 OR 2024</code><br>
      Check: LinkedIn company page › Posts · Press releases · CES/Red Dot/iF/Computex exhibitor lists · Company sustainability report.</p>
    </div>
  `;
}

/* ── SWOT analysis ── */
function buildSwot(data, output) {
  const vertical = data.vertical || '';
  const signal = data.signal || '';

  const strengths = [
    `Multi-site FATP capability across China, Malaysia, Hungary and Mexico — enables EU/US compliance and supply chain resilience in a single CM partner`,
    `In-house PCBA, plastics tooling, assembly and test under one roof — reduces NPI handoff risk and accelerates time to market`,
    `Agile for 50K–500K annual volumes — fills the gap between Tier-1 EMS minimums and smaller boutique CMs`,
    `JDM/ODM co-development from EVT stage — ${getCompanyName()} engineers engage before design freeze, not just at production handoff`
  ];
  const weaknesses = [
    `Less global brand recognition than Tier-1 EMS (Foxconn, Flex, Jabil) — requires more education and proof-of-concept investment from the prospect`,
    `Smaller total capacity than Tier-1 EMS — may not suit 1M+ unit single-factory requirements without multi-site planning`,
    `Sales cycle can be longer where procurement teams default to known EMS incumbents — champion-building is essential`
  ];
  const opportunities = [
    `${signal} is a high-priority trigger — accounts in this mode are actively evaluating CM partners and are more open to new introductions`,
    `EU Ecodesign / supply chain compliance mandates are forcing brands to restructure FATP — ${getCompanyName()}'s HU site is a timely solution`,
    `${vertical} is experiencing regionalisation pressure — brands need EU or MX FATP to satisfy tariff and lead time requirements`,
    `AI-driven product features are increasing PCBA complexity — ${getCompanyName()}'s engineering-led NPI supports this shift in product complexity`
  ];
  const threats = [
    `Incumbent CM relationships are sticky — if the prospect has a working CM, switching costs (tooling, validation, qualification) are a real objection`,
    `Macroeconomic softness can delay NPI decisions and RFQ timelines — follow-up cadence must account for budget cycles`,
    `Tier-1 EMS incumbents may respond to losing a mid-market account by offering temporary concessions — prepare ${getCompanyName()} value case for this scenario`
  ];
  return { strengths, weaknesses, opportunities, threats };
}

function renderSwotTab(data, output) {
  const swot = buildSwot(data, output);
  const swotCell = (cls, label, items) => `
    <div class="swot-cell ${cls}">
      <div class="swot-label">${label}</div>
      ${list(items)}
    </div>
  `;
  return `
    <div class="card" style="margin-bottom:12px;">
      <h3>SWOT analysis — ${escapeHtml(getCompanyName())} vs. ${escapeHtml(data.accountName || 'account')} opportunity</h3>
      <p class="source-list">${escapeHtml(getCompanyName())}'s position in this specific pursuit. Use the Strengths and Opportunities in outreach messaging; prepare for Weaknesses and Threats in discovery and qualification conversations.</p>
    </div>
    <div class="swot-grid">
      ${swotCell('strength', '✦ Strengths', swot.strengths)}
      ${swotCell('weakness', '▼ Weaknesses', swot.weaknesses)}
      ${swotCell('opportunity', '◆ Opportunities', swot.opportunities)}
      ${swotCell('threat', '⚠ Threats', swot.threats)}
    </div>
    <div class="card" style="margin-top:12px;">
      <h3>Outreach angle from SWOT</h3>
      <p class="source-list">Lead with Strengths framed against the account's signal (<strong>${escapeHtml(data.signal)}</strong>). Acknowledge Weaknesses proactively in discovery ("we're not the biggest, but for 50K–500K runs we are the most agile"). Convert Opportunities into urgency triggers in email subject lines. Pre-empt Threats by building multi-threaded champion relationships before incumbent response.</p>
    </div>
  `;
}

/* ── RFX Evaluation tab HTML ── */
function renderEvaluationTab(data) {
  const companyScale = ["< 500 employees (Small)", "500–5,000 employees (Mid)", "> 5,000 employees (Large/Enterprise)"];
  const businessModel = ["OEM", "ODM", "JDM", "OEM + ODM"];
  const productStatus = ["Concept / Early Design", "Under Design (EVT)", "DVT / PVT Stage", "Current product — ECN / Transfer", "New Generation"];
  const subsidiaries = ["Ihastek", "iGlory", "UMS", "Insut", "Hank", "Multiple / TBD"];
  const scoreOpts = [1,2,3,4,5].map(n => `<option value="${n}">${n}</option>`).join('');
  const textSel = (id, opts) => `<select id="${id}">${opts.map(o=>`<option>${o}</option>`).join('')}</select>`;

  return `
  <div class="card" style="margin-bottom:12px;">
    <h3>RFX Customer &amp; Project Evaluation</h3>
    <p class="source-list">Based on ${escapeHtml(getCompanyName())}'s internal UMD RFX evaluation framework. Score each criterion 1–5. The tool auto-calculates Customer Level, Project Level and final Business Score in real time.</p>
  </div>
  <div class="rfx-eval-layout">
    <!-- Customer Background -->
    <div class="rfx-section full">
      <div class="rfx-section-title">Background Research</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;">
        <div class="rfx-field"><label>Customer / Country / Founded</label><input id="rfx-customer" placeholder="e.g. Blueair / Sweden / 1996" value="${escapeHtml(data.accountName||'')}"></div>
        <div class="rfx-field"><label>Annual Revenue (USD)</label><input id="rfx-revenue" placeholder="e.g. $500M"></div>
        <div class="rfx-field"><label>Category</label><select id="rfx-category"><option>Category A (AR ≥ $500M)</option><option>Category B ($50M–$500M)</option><option>Category C (< $50M)</option></select></div>
        <div class="rfx-field"><label>Product Name / Type</label><input id="rfx-product" placeholder="e.g. Connected air purifier"></div>
        <div class="rfx-field"><label>Business Model</label>${textSel('rfx-bizmodel', businessModel)}</div>
        <div class="rfx-field"><label>Main Market</label><input id="rfx-market" placeholder="e.g. EU, US, APAC"></div>
        <div class="rfx-field"><label>Annual Volume (units)</label><input id="rfx-volume" placeholder="e.g. 250,000 pcs/yr"></div>
        <div class="rfx-field"><label>Target Price (USD)</label><input id="rfx-price" placeholder="e.g. $85–$120"></div>
        <div class="rfx-field"><label>Product Status</label>${textSel('rfx-prodstatus', productStatus)}</div>
        <div class="rfx-field"><label>Company Scale</label>${textSel('rfx-scale', companyScale)}</div>
        <div class="rfx-field"><label>Manufacturing Base Required</label><select id="rfx-mfgbase"><option>China (CN)</option><option>Malaysia (MY)</option><option>Hungary (HU)</option><option>Mexico (MX)</option><option>Multi-site</option></select></div>
        <div class="rfx-field"><label>Subsidiary Match</label>${textSel('rfx-subsidiary', subsidiaries)}</div>
      </div>
      <div class="rfx-field" style="margin-top:10px;"><label>Opportunity Description</label><textarea id="rfx-opportunity" rows="3" placeholder="${getCompanyName()}'s opportunity (whole product, PCBA, plastics, FW, FATP...)"></textarea></div>
    </div>

    <!-- Customer Level Assessment -->
    <div class="rfx-section">
      <div class="rfx-section-title">Customer Level Assessment</div>
      <table class="rfx-score-table">
        <thead><tr><th>Criterion</th><th>Sub-criterion</th><th>Score (1–5)</th><th>Weight</th></tr></thead>
        <tbody>
          <tr class="rfx-category-header"><td colspan="4">Leading (Popularity &amp; Influence)</td></tr>
          <tr><td>Popularity &amp; Influence</td><td>World top 100 / recognized market leader</td><td><select class="rfx-score-select" data-weight="0.15" data-group="customer" id="c-s1">${scoreOpts}</select></td><td>15%</td></tr>
          <tr class="rfx-category-header"><td colspan="4">Sustainability</td></tr>
          <tr><td>Revenue &amp; Profit</td><td>Revenue and profit growth trajectory</td><td><select class="rfx-score-select" data-weight="0.20" data-group="customer" id="c-s2">${scoreOpts}</select></td><td>20%</td></tr>
          <tr><td>Sustainability Plan</td><td>Has customized ESG / sustainability plan</td><td><select class="rfx-score-select" data-weight="0.10" data-group="customer" id="c-s3">${scoreOpts}</select></td><td>10%</td></tr>
          <tr><td>Development Potential</td><td>Has product roadmap with market influence</td><td><select class="rfx-score-select" data-weight="0.15" data-group="customer" id="c-s4">${scoreOpts}</select></td><td>15%</td></tr>
          <tr class="rfx-category-header"><td colspan="4">Matching</td></tr>
          <tr><td>Strategic Alignment</td><td>Customer strategy aligns with ${getCompanyName()}'s direction</td><td><select class="rfx-score-select" data-weight="0.10" data-group="customer" id="c-s5">${scoreOpts}</select></td><td>10%</td></tr>
          <tr><td>R&amp;D Tech Direction</td><td>Technical roadmap aligned with ${getCompanyName()}'s capabilities</td><td><select class="rfx-score-select" data-weight="0.15" data-group="customer" id="c-s6">${scoreOpts}</select></td><td>15%</td></tr>
          <tr class="rfx-category-header"><td colspan="4">Risk</td></tr>
          <tr><td>Credit Security</td><td>Credit worthiness and default risk</td><td><select class="rfx-score-select" data-weight="0.05" data-group="customer" id="c-s7">${scoreOpts}</select></td><td>5%</td></tr>
          <tr><td>Competitive Environment</td><td>Number of competitors for this account</td><td><select class="rfx-score-select" data-weight="0.10" data-group="customer" id="c-s8">${scoreOpts}</select></td><td>10%</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Project Level Assessment -->
    <div class="rfx-section">
      <div class="rfx-section-title">Project Level Assessment</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:14px;">
        <div class="rfx-field"><label>Project Name</label><input id="rfx-projname" placeholder="e.g. AirMax Gen4"></div>
        <div class="rfx-field"><label>Annual Project Value (USD)</label><input id="rfx-projvalue" placeholder="e.g. $8M"></div>
        <div class="rfx-field"><label>Project Type</label><select id="rfx-projtype"><option>New Product</option><option>Transfer / City Migration</option><option>Next Generation</option><option>ECN / Upgrade</option></select></div>
        <div class="rfx-field"><label>Product Category</label><input id="rfx-projcat" placeholder="e.g. Air purification" value="${escapeHtml(data.vertical||'')}"></div>
      </div>
      <table class="rfx-score-table">
        <thead><tr><th>Criterion</th><th>Sub-criterion</th><th>Score (1–5)</th><th>Weight</th></tr></thead>
        <tbody>
          <tr class="rfx-category-header"><td colspan="4">Profitability (65%)</td></tr>
          <tr><td>Annual Revenue</td><td>Project annual value: 1=&lt;$2M, 5=≥$20M</td><td><select class="rfx-score-select" data-weight="0.25" data-group="project" id="p-s1">${scoreOpts}</select></td><td>25%</td></tr>
          <tr><td>Gross Margin</td><td>Estimated gross margin band</td><td><select class="rfx-score-select" data-weight="0.15" data-group="project" id="p-s2">${scoreOpts}</select></td><td>15%</td></tr>
          <tr><td>Annual Volume</td><td>Units/yr: 1=&lt;10K, 5=&gt;200K</td><td><select class="rfx-score-select" data-weight="0.20" data-group="project" id="p-s3">${scoreOpts}</select></td><td>20%</td></tr>
          <tr><td>Industry Life Cycle</td><td>Market maturity: 1=Decline, 5=Growth</td><td><select class="rfx-score-select" data-weight="0.15" data-group="project" id="p-s4">${scoreOpts}</select></td><td>15%</td></tr>
          <tr class="rfx-category-header"><td colspan="4">Feasibility (25%)</td></tr>
          <tr><td>Customer Requirements</td><td>Clarity and completeness of requirements</td><td><select class="rfx-score-select" data-weight="0.03" data-group="project" id="p-s5">${scoreOpts}</select></td><td>3%</td></tr>
          <tr><td>R&amp;D Tech Match</td><td>Engineering capability match</td><td><select class="rfx-score-select" data-weight="0.03" data-group="project" id="p-s6">${scoreOpts}</select></td><td>3%</td></tr>
          <tr><td>Process Tech Match</td><td>Manufacturing process capability match</td><td><select class="rfx-score-select" data-weight="0.03" data-group="project" id="p-s7">${scoreOpts}</select></td><td>3%</td></tr>
          <tr><td>Supply Chain Match</td><td>Existing supply chain coverage</td><td><select class="rfx-score-select" data-weight="0.03" data-group="project" id="p-s8">${scoreOpts}</select></td><td>3%</td></tr>
          <tr class="rfx-category-header"><td colspan="4">Risk (10%)</td></tr>
          <tr><td>Market Risk (PES)</td><td>Political, economic, social risk factors</td><td><select class="rfx-score-select" data-weight="0.05" data-group="project" id="p-s9">${scoreOpts}</select></td><td>5%</td></tr>
          <tr><td>Competitive Risk</td><td>CM competition intensity for this project</td><td><select class="rfx-score-select" data-weight="0.05" data-group="project" id="p-s10">${scoreOpts}</select></td><td>5%</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Results -->
    <div class="rfx-section full">
      <div class="rfx-section-title">Evaluation Results</div>
      <div class="rfx-result-bar">
        <div class="rfx-result-cell">
          <div class="result-score" id="rfx-customer-score">—</div>
          <div class="result-label">Customer Score</div>
          <div class="result-grade" id="rfx-customer-grade">Enter scores above</div>
        </div>
        <div class="rfx-result-cell">
          <div class="result-score" id="rfx-project-score">—</div>
          <div class="result-label">Project Score</div>
          <div class="result-grade" id="rfx-project-grade">Enter scores above</div>
        </div>
        <div class="rfx-result-cell" style="border:1px solid var(--brand);background:rgba(255,122,24,0.05);">
          <div class="result-score" id="rfx-business-score">—</div>
          <div class="result-label">Business Score (80/20)</div>
          <div class="result-grade" id="rfx-business-grade">Customer × 80% + Project × 20%</div>
        </div>
      </div>
      <div id="rfx-notes" style="margin-top:14px;padding:14px;border:1px solid var(--b1);border-radius:var(--r-md);background:rgba(255,255,255,0.02);color:var(--text-lo);font-size:12px;line-height:1.6;">
        Score all criteria above to see results. Business Grade: <strong>S ≥ 4.5</strong> (Deep Strategic) · <strong>A ≥ 4.0</strong> (Key Strategic) · <strong>B ≥ 3.0</strong> (Potential / Pipeline) · <strong>C &lt; 3.0</strong> (Monitor only)
      </div>
    </div>
  </div>`;
}

/* ── Account Playbook tab ── */
function renderPlaybookTab(data, output) {
  const persona = getPersona(data.role);
  const acctName = data.accountName || 'the account';
  const vertical = data.vertical || '';

  const giftMap = {
    "Book discovery call": "Premium notebook + pen set (neutral branding), or a relevant industry report — shows research investment before the call.",
    "Build internal champion": "A personalised CoalitionX capability summary doc with their name on it — makes them look good when sharing internally.",
    "Send relevant technical content": `DFM guide or NPI white paper branded with their product category — positions ${getCompanyName()} as a technical thought leader.`,
    "Qualify RFQ potential": "Invite to a virtual factory tour or send a facility capability deck — demonstrates FATP readiness before they commit to an RFQ.",
    "Re-engage quiet account": "Relevant trade show summary or vertical innovation report — provides value without appearing desperate. Follow with a warm call."
  };
  const giftSuggestion = giftMap[data.objective] || "Personalised capability summary or industry insight report tailored to their product vertical.";

  const phases = [
    {
      num: "0", title: "Research & Discovery",
      items: [
        { label: "Account & Vertical Events to attend", detail: `Research upcoming trade shows for ${vertical}: identify 1–2 events where ${acctName} or their competitors exhibit. Attend or use as outreach hook.` },
        { label: "Patents search & innovation trends", detail: `Search ${acctName} patents on Google Patents / Espacenet. Identify NPI signals: new form factors, new materials, new connectivity features. Cross-reference with ${getCompanyName()} capabilities.` },
        { label: "Design agencies & engineering partners", detail: `Identify ${acctName}'s known design partners (ID agencies, EE consultancies, FW developers). These contacts can be leveraged as warm introductions or parallel outreach channels.` },
        { label: "LinkedIn & HubSpot signal review", detail: `Review company LinkedIn page for job postings (engineering hires = NPI signal), product announcements, and leadership changes. Cross-check HubSpot history.` }
      ],
      strategy: `Phase 0 goal: build a research dossier before first contact. Do not reach out until you have account name, key persona, current product line, 1 pain trigger, and a warm angle. Use this data to personalise Phase 1 outreach.`
    },
    {
      num: "1", title: "Qualification & Engagement",
      items: [
        { label: "Lead Qualification (BANT+)", detail: `Budget: Is there a confirmed engineering or sourcing budget? Authority: Is ${persona.persona} the decision maker or influencer? Need: Does the signal (${data.signal}) confirm an active project? Timeline: Is there an EVT/DVT milestone in the next 12 months?` },
        { label: "Deal Qualification (MEDDIC)", detail: `Metrics: What KPIs does ${acctName} use to evaluate a CM (cost, quality, speed, compliance)? Economic Buyer: Who signs off on CM selection? Decision Criteria: RFQ scoring criteria? Identify: champion, process, competition.` },
        { label: "NDA Strategy", detail: `Propose a mutual NDA before sharing ${getCompanyName()} capability details or DFM recommendations. Frame it as 'protecting both sides' — reduces risk objection when sharing technical IP during early engagement.` },
        { label: "Value Add Stages", detail: `Stage 1: Share insight (award angle, vertical trend). Stage 2: Offer free DFM review or factory deck. Stage 3: Propose a technical workshop. Each stage adds value before asking for the meeting or RFQ.` }
      ],
      strategy: `Phase 1 goal: qualify the opportunity (BANT/MEDDIC), establish an internal champion at ${acctName}, and progress to a defined next step — discovery call, NDA, or technical content exchange.`
    },
    {
      num: "2", title: "Deep Engagement & RFX",
      items: [
        { label: "F2F Meeting Strategy", detail: `First F2F should be at a trade show or their office (not ${getCompanyName()} HQ) — reduces commitment friction. Agenda: 30% listening to their challenges, 40% capability mapping, 30% next steps. Bring a DFM example relevant to their product.` },
        { label: "Factory Visit Strategy", detail: `Invite ${acctName} for a facility visit after the first F2F. Show the most relevant capability line (PCBA, plastics, FATP). Assign a dedicated host engineer. Prepare a visit dossier tailored to their product category. Follow up within 48h.` },
        { label: "RFX Strategy — RFQ Requested Stage", detail: `Once an RFQ is requested: confirm scope (whole product vs. PCBA/plastics), volume assumptions, target price, certification needs, and timeline. Assign internal project owner. Acknowledge receipt within 24h.` },
        { label: "RFX Strategy — RFQ Feedback Stage", detail: `During feedback: schedule a technical clarification call. Use this to build the champion relationship. Share a preliminary BOM/cost breakdown directionally before the formal submission — reduces surprise at submission stage.` },
        { label: "RFX Strategy — RFQ Submission Stage", detail: `Submission: include executive cover letter, capability proof points specific to their product, FATP site recommendation, NPI timeline estimate, and reference contacts if approved. Follow up with a call within 3 business days.` },
        { label: "Engagement Stage Upload & Gifting", detail: `Upload the current engagement stage into HubSpot. Select persona (${persona.persona}) and any recent change (new role, new product launch, event). The system will suggest an updated strategy and personalised gifting approach.` }
      ],
      strategy: `Phase 2 goal: convert qualification into an active RFQ pipeline. Maintain multi-threaded champion contacts (R&D, procurement, NPI). Use factory visit as the key trust-building milestone before RFX submission.`
    }
  ];

  const phasesHtml = phases.map(p => `
    <div class="playbook-phase">
      <div class="playbook-phase-header">
        <div class="phase-badge">${p.num}</div>
        <div class="phase-title">Phase ${p.num}: ${escapeHtml(p.title)}</div>
      </div>
      ${p.items.map(item => `
        <div class="playbook-item">
          <input type="checkbox" class="playbook-check">
          <div class="playbook-item-text"><strong style="display:block;color:var(--text-hi);margin-bottom:2px;">${escapeHtml(item.label)}</strong>${escapeHtml(item.detail)}</div>
        </div>
      `).join('')}
      <div class="playbook-strategy"><strong>Phase strategy</strong>${escapeHtml(p.strategy)}</div>
    </div>
  `).join('');

  return `
    <div class="card" style="margin-bottom:12px;">
      <h3>Account Playbook — ${escapeHtml(acctName)}</h3>
      <p class="source-list">Phase-by-phase action framework for this pursuit. Check off items as completed. Each phase has a strategic goal and recommended approach tailored to the account signal and persona.</p>
    </div>
    <div class="playbook-phases">${phasesHtml}</div>
    <div class="card" style="margin-top:12px;">
      <h3>Gifting &amp; engagement suggestion — ${escapeHtml(data.objective)}</h3>
      <div class="gifting-suggestion">
        <strong>Recommended gifting angle</strong>
        <p style="margin:0;color:var(--text-md);font-size:13px;line-height:1.55;">${escapeHtml(giftSuggestion)}</p>
      </div>
      <div class="engagement-stage-select" style="margin-top:12px;">
        <label style="font-size:11px;font-weight:600;color:var(--text-lo);display:block;margin-bottom:6px;">Current engagement stage</label>
        <select id="engagementStage" style="width:100%;padding:9px 11px;border:1px solid rgba(255,122,24,0.2);border-radius:var(--r-sm);background:rgba(14,13,11,0.92);color:var(--text-hi);font-size:13px;">
          <option>Awareness — no contact yet</option>
          <option>Connected — LinkedIn / first email sent</option>
          <option>Engaged — responded to outreach</option>
          <option>Discovery call booked</option>
          <option>Discovery call completed</option>
          <option>NDA signed</option>
          <option>Technical workshop / F2F meeting</option>
          <option>Factory visit scheduled</option>
          <option>RFQ received</option>
          <option>RFQ submitted</option>
          <option>Negotiation stage</option>
          <option>Won / active project</option>
        </select>
      </div>
    </div>
  `;
}

/* ── RFX scoring engine ── */
function initRfxScoring() {
  function calcScores() {
    let customerScore = 0, projectScore = 0;
    document.querySelectorAll('.rfx-score-select[data-group="customer"]').forEach(sel => {
      customerScore += parseFloat(sel.value) * parseFloat(sel.dataset.weight);
    });
    document.querySelectorAll('.rfx-score-select[data-group="project"]').forEach(sel => {
      projectScore += parseFloat(sel.value) * parseFloat(sel.dataset.weight);
    });
    const businessScore = customerScore * 0.8 + projectScore * 0.2;
    const gradeLabel = score => score >= 4.5 ? ['S', 'Deep Strategic Partner', 'rfx-grade-S'] : score >= 4.0 ? ['A', 'Key Strategic Account', 'rfx-grade-A'] : score >= 3.0 ? ['B', 'Potential / Pipeline', 'rfx-grade-B'] : ['C', 'Monitor Only', 'rfx-grade-C'];

    const [cGrade, cLabel, cClass] = gradeLabel(customerScore);
    const [pGrade, pLabel, pClass] = gradeLabel(projectScore);
    const [bGrade, bLabel, bClass] = gradeLabel(businessScore);

    const csEl = document.getElementById('rfx-customer-score');
    const psEl = document.getElementById('rfx-project-score');
    const bsEl = document.getElementById('rfx-business-score');
    if (csEl) { csEl.textContent = customerScore.toFixed(2); csEl.className = `result-score ${cClass}`; }
    if (psEl) { psEl.textContent = projectScore.toFixed(2); psEl.className = `result-score ${pClass}`; }
    if (bsEl) { bsEl.textContent = businessScore.toFixed(2); bsEl.className = `result-score ${bClass}`; }
    const cgEl = document.getElementById('rfx-customer-grade');
    const pgEl = document.getElementById('rfx-project-grade');
    const bgEl = document.getElementById('rfx-business-grade');
    if (cgEl) cgEl.textContent = `Grade ${cGrade} — ${cLabel}`;
    if (pgEl) pgEl.textContent = `Grade ${pGrade} — ${pLabel}`;
    if (bgEl) bgEl.textContent = `Grade ${bGrade} — ${bLabel}`;
  }
  document.querySelectorAll('.rfx-score-select').forEach(sel => sel.addEventListener('change', calcScores));
  calcScores();
}

document.addEventListener("submit", event => {
  const f = form();
  if (event.target !== f) return;
  event.preventDefault();
  const data = collectFormData();
  const output = buildPlan(data);
  render(data, output);
});

document.getElementById("generateAndIntel")?.addEventListener("click", () => {
  const data = collectFormData();
  const output = buildPlan(data);
  render(data, output);
  const ice = document.getElementById("intelContactEmail");
  if (ice) ice.value = data.prospectEmail || "";
  fetchHubspotIntel();
});

document.getElementById("clearForm")?.addEventListener("click", () => {
  const f = form();
  if (f) f.reset();
  renderVerticalAccounts();
  renderRolePreview();
  const res = results();
  const es = emptyState();
  const ot = outputTitle();
  const ba = briefAccount();
  const bm = briefMeta();
  const bp = briefPersona();
  const bsig = briefSignal();
  const bo = briefObjective();
  if (res) res.classList.add("hidden");
  if (es) es.classList.remove("hidden");
  if (ot) ot.textContent = "Ready for account input";
  if (ba) ba.textContent = "No account selected";
  if (bm) bm.textContent = "Add a target account to activate strategy, news, outreach and CRM intelligence.";
  if (bp) bp.textContent = "-";
  if (bsig) bsig.textContent = "-";
  if (bo) bo.textContent = "-";
  lastOutputText = "";
  lastData = null;
  lastOutput = null;
  const hs = document.getElementById("hubspotStatus");
  const hi = document.getElementById("hubspotIntel");
  if (hs) hs.textContent = "Set account/contact details, then pull intelligence.";
  if (hi) hi.innerHTML = `<article class="intel-empty"><strong>No CRM intelligence loaded yet.</strong><span>Use this before writing outreach so SDRs can avoid duplicating conversations and can reference known context.</span></article>`;
});

document.getElementById("loadExample")?.addEventListener("click", () => {
  document.getElementById("accountName").value = "Blueair";
  document.getElementById("prospectName").value = "Alex Morgan";
  document.getElementById("role").value = "Director of Product Engineering";
  document.getElementById("linkedin").value = "LinkedIn notes: product engineering leader focused on connected air treatment and global appliance launches.";
  document.getElementById("vertical").value = "Air purification & home appliances";
  document.getElementById("signal").value = "New product development or refresh";
  document.getElementById("objective").value = "Book discovery call";
  document.getElementById("tone").value = "Consultative";
  document.getElementById("notes").value = "Blueair is a strategic enterprise air purification account. Focus on prototype kits, pilot lines in Hungary/Mexico, IoT differentiation, and RFQ-to-NPI conversion.";
  document.getElementById("intelContactEmail").value = "";
});

async function fetchAccountNews() {
  if (!lastData) return;
  const status = document.getElementById("newsStatus");
  const container = document.getElementById("newsResults");
  status.textContent = "Fetching recent account and industry signals...";
  container.innerHTML = "";
  try {
    requireHostedApi("Live news lookup");
    const params = new URLSearchParams({
      account: lastData.accountName,
      vertical: lastData.vertical,
      keywords: document.getElementById("newsKeywords")?.value || ""
    });
    const response = await authFetch(`/api/account-news?${params.toString()}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "News lookup failed.");
    if (!payload.items.length) {
      status.textContent = "No live items returned. Use the search links and value angles above.";
      return;
    }
    status.textContent = `Found ${payload.items.length} recent signals. Review before using in outreach.`;
    container.innerHTML = payload.items.map(item => `
      <article class="news-item">
        <a href="${escapeHtml(item.link)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>
        <div class="news-meta">${escapeHtml(item.source || "News")} ${item.pubDate ? `- ${escapeHtml(item.pubDate)}` : ""}</div>
        <p class="source-list">${escapeHtml(item.angle)}</p>
      </article>
    `).join("");
  } catch (error) {
    status.textContent = `${error.message} Showing clickable Google News searches in the feed.`;
    const queries = newsQueries(lastData.accountName, lastData.vertical);
    const fallback = [
      [`${lastData.accountName} account news`, queries.account, "Open this to review current account-specific news, launches, supplier updates and quality signals."],
      [`${lastData.vertical} industry news`, queries.industry, "Open this to review market and category developments that can create value-led outreach."],
      [`${lastData.accountName} product reviews`, queries.product, "Open this to find review-led hardware pain points and potential product match clues."]
    ];
    container.innerHTML = fallback.map(([title, query, angle]) => referenceSearchCard(title, query, angle, "news")).join("");
  }
}

function renderIntelSection(title, items) {
  if (!items || !items.length) return "";
  return `
    <article class="news-item">
      <h3>${escapeHtml(title)}</h3>
      <ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </article>
  `;
}

async function fetchHubspotIntel() {
  const currentData = lastData || collectFormData();
  lastData = currentData;
  const status = document.getElementById("hubspotStatus");
  const container = document.getElementById("hubspotIntel");
  status.textContent = "Pulling HubSpot intelligence...";
  container.innerHTML = "";
  const params = new URLSearchParams({
    account: currentData.accountName,
    contactEmail: document.getElementById("intelContactEmail").value.trim() || currentData.prospectEmail || "",
    contactId: document.getElementById("intelContactId").value.trim(),
    companyId: document.getElementById("intelCompanyId").value.trim(),
    prospectName: currentData.prospectName || ""
  });
  try {
    requireHostedApi("HubSpot intelligence");
    const response = await fetch(`/api/hubspot-intelligence?${params.toString()}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "HubSpot intelligence lookup failed.");
    status.textContent = result.message;
    const company = result.company ? [
      `Company: ${result.company.name || "Unknown"}${result.company.domain ? ` (${result.company.domain})` : ""}`,
      `Lifecycle stage: ${result.company.lifecyclestage || "Unknown"}`,
      `Industry: ${result.company.industry || "Unknown"}`,
      `Owner ID: ${result.company.hubspot_owner_id || "Unknown"}`
    ] : [];
    const contact = result.contact ? [
      `Contact: ${[result.contact.firstname, result.contact.lastname].filter(Boolean).join(" ") || "Unknown"}`,
      `Email: ${result.contact.email || "Unknown"}`,
      `Job title: ${result.contact.jobtitle || "Unknown"}`,
      `Lifecycle stage: ${result.contact.lifecyclestage || "Unknown"}`
    ] : [];
    const intelligence = [
      renderIntelSection("Matched company", company),
      renderIntelSection("Matched contact", contact),
      renderIntelSection("Recent CRM notes", result.notes || []),
      renderIntelSection("Recent CRM tasks", result.tasks || []),
      renderIntelSection("Strategy-critical prompts", result.prompts || [])
    ].join("");
    container.innerHTML = intelligence || `<article class="news-item"><p class="source-list">No matching HubSpot intelligence was found for this account/contact.</p></article>`;
  } catch (error) {
    status.textContent = `${error.message} Check Netlify env vars and HubSpot Private App scopes.`;
  }
}

async function sendHubspot(action) {
  if (!lastData || !lastOutput) {
    const data = collectFormData();
    const output = buildPlan(data);
    render(data, output);
  }
  const status = document.getElementById("hubspotStatus");
  status.textContent = action === "task" ? "Creating HubSpot follow-up task..." : "Logging HubSpot note...";
  const payload = {
    action,
    accountName: lastData.accountName,
    prospectName: lastData.prospectName,
    contactEmail: document.getElementById("intelContactEmail").value.trim() || lastData.prospectEmail || "",
    contactId: document.getElementById("intelContactId").value.trim(),
    companyId: document.getElementById("intelCompanyId").value.trim(),
    dueDate: document.getElementById("intelDueDate").value,
    note: lastOutputText || `Generated SDR strategy for ${lastData.accountName}`,
    taskTitle: `Follow up with ${lastData.accountName} on ${lastData.vertical}`
  };
  try {
    requireHostedApi("HubSpot logging");
    const response = await fetch("/api/hubspot-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "HubSpot request failed.");
    status.textContent = result.message;
  } catch (error) {
    status.textContent = `${error.message} Check Netlify env vars and HubSpot Private App scopes.`;
  }
}

document.addEventListener("click", event => {
  // ── Admin portal open/close ───────────────────────────────
  if (event.target.id === "navAdmin") {
    AdminPortal.open(); return;
  }
  if (event.target.id === "closeAdmin" || (event.target.id === "adminPortal" && event.target === document.getElementById('adminPortal'))) {
    AdminPortal.close(); return;
  }
  if (event.target.id === "navLogout" || event.target.id === "adminSignOut") {
    cxLogout(); return;
  }

  // ── Use-account button (from account suggestions cards) ──
  if (event.target.matches(".use-account")) {
    const an = document.getElementById("accountName");
    const roleEl = document.getElementById("role");
    const notesEl = document.getElementById("notes");
    if (an) an.value = event.target.dataset.account || "";
    if (roleEl && event.target.dataset.role) roleEl.value = event.target.dataset.role;
    if (notesEl) notesEl.value = event.target.dataset.notes || notesEl.value;
    const data = collectFormData();
    const output = buildPlan(data);
    render(data, output);
    document.getElementById("strategy")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (event.target.matches(".copy-button")) {
    copyText(decodeURIComponent(event.target.dataset.copy)).then(() => {
      event.target.textContent = "Copied";
      setTimeout(() => {
        event.target.textContent = "Copy";
      }, 1200);
    });
  }

  // ── Admin portal card buttons ─────────────────────────────
  if (event.target.id === "hsSave") {
    AdminPortal.saveConfig({ hsToken: document.getElementById('hsToken').value.trim(), hsPortalId: document.getElementById('hsPortalId').value.trim() });
    AdminPortal.setStatus('hsDot','hsStatusLabel',true,'Token saved');
    AdminPortal.result('hsResult','HubSpot token saved. Pull intelligence from the CRM panel.',true);
    AdminPortal.updateStatusBar(); return;
  }
  if (event.target.id === "hsTest") {
    const tok = document.getElementById('hsToken').value.trim();
    if (!tok) { AdminPortal.result('hsResult','Enter a Private App Token first.',false); return; }
    AdminPortal.result('hsResult','Testing connection…',true);
    fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1',{headers:{Authorization:`Bearer ${tok}`}})
      .then(r=>{ if(r.ok){AdminPortal.setStatus('hsDot','hsStatusLabel',true,'Connected ✓');AdminPortal.result('hsResult','✓ HubSpot connected.',true);AdminPortal.saveConfig({hsToken:tok});AdminPortal.updateStatusBar();}else{AdminPortal.result('hsResult',`✗ Auth failed (${r.status}). Check token and scopes.`,false);} })
      .catch(()=>AdminPortal.result('hsResult','✗ Network error — use Netlify-hosted app for live calls.',false));
    return;
  }
  // aiTest is handled via DOMContentLoaded addEventListener above
  if (event.target.id === "apSave") {
    AdminPortal.saveConfig({ apKey: document.getElementById('apKey').value.trim() });
    AdminPortal.setStatus('apDot','apStatusLabel',true,'Key saved');
    AdminPortal.result('apResult','Apollo key saved. Contact enrichment activates via Netlify.',true);
    AdminPortal.updateStatusBar(); return;
  }
  if (event.target.id === "apTest") {
    const k=document.getElementById('apKey').value.trim();
    if(!k){AdminPortal.result('apResult','Enter Apollo API key first.',false);return;}
    AdminPortal.saveConfig({apKey:k});AdminPortal.setStatus('apDot','apStatusLabel',true,'Key saved');
    AdminPortal.result('apResult','Apollo connection test requires server-side proxy. Key saved for hosted use.',true);
    AdminPortal.updateStatusBar(); return;
  }
  if (event.target.id === "adminSavePrefs") {
    AdminPortal.savePrefs({ name:document.getElementById('adminName').value.trim(), team:document.getElementById('adminTeam').value.trim(), vertical:document.getElementById('adminDefaultVertical').value, tone:document.getElementById('adminDefaultTone').value });
    document.getElementById('adminPrefsResult').textContent='✓ Preferences saved.';
    document.getElementById('adminPrefsResult').className='admin-result ok';
    setTimeout(()=>{document.getElementById('adminPrefsResult').textContent='';},2000); return;
  }
  if (event.target.matches('.admin-toggle-vis')) {
    const t=document.getElementById(event.target.dataset.target);
    if(t) t.type=t.type==='password'?'text':'password'; return;
  }

  if (event.target.id === "fetchNews") {
    fetchAccountNews();
  }

  if (event.target.id === "fetchHubspotIntel") {
    fetchHubspotIntel();
  }

  if (event.target.id === "logHubspotNote") {
    sendHubspot("note");
  }

  if (event.target.id === "createHubspotTask") {
    sendHubspot("task");
  }

  if (event.target.id === "generateRoleStrategyBtn") {
    const data = collectFormData();
    const output = buildPlan(data);
    render(data, output);
    // render() already calls exitPageMode and sets strategy active
  }

  // removed: quick-action / page-nav-btn enterPageMode (old architecture)
});

document.getElementById("vertical")?.addEventListener("change", renderVerticalAccounts);
document.getElementById("role")?.addEventListener("change", () => {
  renderVerticalAccounts();
  renderRolePreview();
});

// Delegated copy-all, save-draft, export-brief, export-pdf (buttons exist inside modules)
document.addEventListener("click", e => {
  if (e.target.id === "copyAll") {
    if (!lastOutputText) return;
    copyText(lastOutputText).then(() => {
      e.target.textContent = "Copied";
      setTimeout(() => { e.target.textContent = "Copy all"; }, 1200);
    });
    return;
  }
  if (e.target.id === "exportPdf") { window.print(); return; }
  if (e.target.id === "saveDraft") {
    const data = collectFormData();
    localStorage.setItem("intretechSdrDraft", JSON.stringify(data));
    e.target.textContent = "Saved";
    setTimeout(() => { e.target.textContent = "Save draft"; }, 1200);
    return;
  }
  if (e.target.id === "exportBrief") {
    if (!lastOutputText) {
      const data = collectFormData();
      const output = buildPlan(data);
      render(data, output);
    }
    const name = (lastData?.accountName || "account").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    downloadText(`${name || "account"}-gtm-brief.txt`, lastOutputText);
    return;
  }
});

// Draft restore runs after module navigation has rendered the form
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem("intretechSdrDraft");
  if (!saved) return;
  try {
    const data = JSON.parse(saved);
    const f = form();
    if (!f) return;
    Object.entries(data).forEach(([key, value]) => {
      const field = f.elements[key];
      if (field) field.value = value;
    });
  } catch {
    localStorage.removeItem("intretechSdrDraft");
  }
});

/* ══════════════════════════════════════════════════════════════
   MODULE NAVIGATION WIRING
══════════════════════════════════════════════════════════════ */
document.addEventListener('click', e => {
  // Hub pillar cards
  const pillarCard = e.target.closest('.pillar-card[data-cx-module]');
  if (pillarCard) {
    showModule(pillarCard.dataset.cxModule);
    return;
  }
  // Module back buttons
  const backBtn = e.target.closest('.module-back-btn[data-cx-module]');
  if (backBtn) {
    showModule(backBtn.dataset.cxModule);
    return;
  }
  // Accordion triggers
  const accTrigger = e.target.closest('.accordion-trigger');
  if (accTrigger) {
    const item = accTrigger.closest('.accordion-item');
    if (!item) return;
    const body = item.querySelector('.accordion-body');
    const chevron = accTrigger.querySelector('.accordion-chevron');
    if (!body) return;
    const isOpen = getComputedStyle(body).display !== 'none';
    body.style.display = isOpen ? 'none' : 'block';
    if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
    return;
  }
});

// Keyboard activation for pillar cards
document.querySelectorAll('.pillar-card[data-cx-module]').forEach(card => {
  card.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      showModule(card.dataset.cxModule);
    }
  });
});

/* ══════════════════════════════════════════════════════════════
   PROSPECTING MODULE — Section Toggle
══════════════════════════════════════════════════════════════ */
function showProSection(id) {
  document.querySelectorAll('.pro-section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('.module-nav-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  const btn = document.querySelector(`[data-pro-section="${id.replace('pro', '').toLowerCase()}"]`);
  // map section IDs to data attributes
  const sectionMap = { proTracker: 'tracker', proResearch: 'research', proStrategy: 'strategy', proPersona: 'persona' };
  const attr = sectionMap[id];
  const activeBtn = document.querySelector(`[data-pro-section="${attr}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  // Populate account focus panel and role preview when entering Research
  if (id === 'proResearch') {
    try { renderVerticalAccounts(); } catch(e) {}
    try { renderRolePreview(); } catch(e) {}
  }
}

document.querySelectorAll('[data-pro-section]').forEach(btn => {
  btn.addEventListener('click', () => {
    const sectionKey = btn.dataset.proSection;
    const map = { tracker: 'proTracker', research: 'proResearch', strategy: 'proStrategy', persona: 'proPersona' };
    if (map[sectionKey]) showProSection(map[sectionKey]);
  });
});

/* ══════════════════════════════════════════════════════════════
   OPPORTUNITY MODULE — Section Toggle
══════════════════════════════════════════════════════════════ */
function showOppSection(id) {
  document.querySelectorAll('.opp-section').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('[data-opp-section]').forEach(b => b.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  const map = { oppLead: 'lead', oppDeal: 'deal', oppRfxStage: 'rfxstage' };
  const attr = map[id];
  const activeBtn = document.querySelector(`[data-opp-section="${attr}"]`);
  if (activeBtn) activeBtn.classList.add('active');
}

document.querySelectorAll('[data-opp-section]').forEach(btn => {
  btn.addEventListener('click', () => {
    const sectionKey = btn.dataset.oppSection;
    const map = { lead: 'oppLead', deal: 'oppDeal', rfxstage: 'oppRfxStage' };
    if (map[sectionKey]) showOppSection(map[sectionKey]);
  });
});

/* ══════════════════════════════════════════════════════════════
   RFX EVALUATOR MODULE — Section Toggle
══════════════════════════════════════════════════════════════ */
function showRfxSection(id) {
  document.querySelectorAll('.rfx-section-panel').forEach(s => s.classList.add('hidden'));
  document.querySelectorAll('[data-rfx-section]').forEach(b => b.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  const map = { rfxEvaluation: 'evaluation', rfxStages: 'stages', rfxTactics: 'tactics' };
  const attr = map[id];
  const activeBtn = document.querySelector(`[data-rfx-section="${attr}"]`);
  if (activeBtn) activeBtn.classList.add('active');
}

document.querySelectorAll('[data-rfx-section]').forEach(btn => {
  btn.addEventListener('click', () => {
    const sectionKey = btn.dataset.rfxSection;
    const map = { evaluation: 'rfxEvaluation', stages: 'rfxStages', tactics: 'rfxTactics' };
    if (map[sectionKey]) showRfxSection(map[sectionKey]);
  });
});

/* ══════════════════════════════════════════════════════════════
   ACCOUNT TRACKER — localStorage CRUD
══════════════════════════════════════════════════════════════ */
const AccountTracker = {
  STORAGE_KEY: 'cx_accounts',

  getAll() {
    try { return JSON.parse(localStorage.getItem(this.STORAGE_KEY) || '[]'); } catch { return []; }
  },

  save(accounts) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(accounts));
  },

  add(account) {
    const accounts = this.getAll();
    account.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    account.createdAt = new Date().toISOString();
    accounts.push(account);
    this.save(accounts);
    return account;
  },

  update(id, patch) {
    const accounts = this.getAll().map(a => a.id === id ? { ...a, ...patch } : a);
    this.save(accounts);
  },

  delete(id) {
    this.save(this.getAll().filter(a => a.id !== id));
  },

  getById(id) {
    return this.getAll().find(a => a.id === id);
  }
};

const STAGE_COLORS = {
  'Researching':   { bg: 'rgba(120,120,120,0.18)', color: '#aaa', border: 'rgba(120,120,120,0.3)' },
  'Engaged':       { bg: 'rgba(59,130,246,0.18)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
  'Qualified':     { bg: 'rgba(245,158,11,0.18)', color: '#fbbf24', border: 'rgba(245,158,11,0.3)' },
  'Proposal / RFX':{ bg: 'rgba(255,122,24,0.18)', color: '#ff7a18', border: 'rgba(255,122,24,0.35)' },
  'Won':           { bg: 'rgba(34,197,94,0.18)', color: '#4ade80', border: 'rgba(34,197,94,0.3)' },
  'Paused':        { bg: 'rgba(100,100,100,0.12)', color: '#666', border: 'rgba(100,100,100,0.2)' }
};

function stageBadgeStyle(stage) {
  const s = STAGE_COLORS[stage] || STAGE_COLORS['Researching'];
  return `background:${s.bg};color:${s.color};border:1px solid ${s.border};`;
}

function renderAccountCards(filterVertical = '') {
  const container = document.getElementById('accountCardList');
  if (!container) return;
  let accounts = AccountTracker.getAll();
  if (filterVertical) accounts = accounts.filter(a => a.vertical === filterVertical);

  if (!accounts.length) {
    container.innerHTML = `
      <div class="tracker-empty">
        <div class="empty-mark">CX</div>
        <h3>No target accounts yet.</h3>
        <p>Click "+ Add Account" to add your first target account to the tracker.</p>
        <button class="primary" id="emptyAddAccountBtn">+ Add your first target account</button>
      </div>
    `;
    document.getElementById('emptyAddAccountBtn')?.addEventListener('click', () => openAccountModal());
    return;
  }

  container.innerHTML = accounts.map(account => {
    const champions = (account.champions || []).map(c =>
      `<div class="champion-row"><span class="champion-name">${escapeHtml(c.name)}</span><span class="champion-role">${escapeHtml(c.role)}</span></div>`
    ).join('');
    return `
      <div class="account-card" data-account-id="${escapeHtml(account.id)}">
        <div class="account-card-header">
          <div class="account-card-name-row">
            <h3 class="account-card-name">${escapeHtml(account.name)}</h3>
            <span class="stage-badge" style="${stageBadgeStyle(account.stage)}">${escapeHtml(account.stage)}</span>
          </div>
          <span class="account-vertical-tag">${escapeHtml(account.vertical)}</span>
        </div>
        ${champions ? `<div class="account-champions"><div class="account-champions-label">Key Champions</div>${champions}</div>` : ''}
        <div class="account-card-meta">
          ${account.lastContact ? `<span class="account-meta-item">Last contact: ${escapeHtml(account.lastContact)}</span>` : ''}
          ${account.notes ? `<p class="account-notes-snippet">${escapeHtml(account.notes.slice(0, 120))}${account.notes.length > 120 ? '…' : ''}</p>` : ''}
        </div>
        <div class="account-card-actions">
          <button class="primary compact account-open-strategy" data-account-id="${escapeHtml(account.id)}">Open Strategy</button>
          <button class="secondary compact account-edit-btn" data-account-id="${escapeHtml(account.id)}">Edit</button>
          <button class="secondary compact danger account-delete-btn" data-account-id="${escapeHtml(account.id)}">Delete</button>
        </div>
      </div>
    `;
  }).join('');
}

// Account modal state
let modalEditId = null;
let modalChampions = [];

function openAccountModal(editId = null) {
  modalEditId = editId;
  modalChampions = [];
  const modal = document.getElementById('accountModal');
  const titleEl = document.getElementById('modalTitle');
  if (!modal) return;

  if (editId) {
    const account = AccountTracker.getById(editId);
    if (!account) return;
    titleEl.textContent = 'Edit Account';
    document.getElementById('modalAccountName').value = account.name || '';
    document.getElementById('modalVertical').value = account.vertical || '';
    document.getElementById('modalStage').value = account.stage || 'Researching';
    document.getElementById('modalLastContact').value = account.lastContact || '';
    document.getElementById('modalWebsite').value = account.website || '';
    document.getElementById('modalNotes').value = account.notes || '';
    modalChampions = JSON.parse(JSON.stringify(account.champions || []));
  } else {
    titleEl.textContent = 'Add Target Account';
    document.getElementById('modalAccountName').value = '';
    document.getElementById('modalVertical').value = '';
    document.getElementById('modalStage').value = 'Researching';
    document.getElementById('modalLastContact').value = '';
    document.getElementById('modalWebsite').value = '';
    document.getElementById('modalNotes').value = '';
    modalChampions = [];
  }
  renderModalChampions();
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeAccountModal() {
  const modal = document.getElementById('accountModal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
  modalEditId = null;
  modalChampions = [];
}

function renderModalChampions() {
  const container = document.getElementById('championsList');
  if (!container) return;
  if (!modalChampions.length) {
    container.innerHTML = '<p class="source-list" style="color:var(--text-lo);font-size:11px;">No champions added yet.</p>';
    return;
  }
  container.innerHTML = modalChampions.map((c, i) => `
    <div class="champion-row-edit">
      <input class="champion-name-input" data-idx="${i}" placeholder="Name" value="${escapeHtml(c.name)}">
      <input class="champion-role-input" data-idx="${i}" placeholder="Role" value="${escapeHtml(c.role)}">
      <button class="champion-remove-btn" data-idx="${i}">✕</button>
    </div>
  `).join('');
  // Bind change handlers
  container.querySelectorAll('.champion-name-input').forEach(inp => {
    inp.addEventListener('input', () => { modalChampions[+inp.dataset.idx].name = inp.value; });
  });
  container.querySelectorAll('.champion-role-input').forEach(inp => {
    inp.addEventListener('input', () => { modalChampions[+inp.dataset.idx].role = inp.value; });
  });
  container.querySelectorAll('.champion-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modalChampions.splice(+btn.dataset.idx, 1);
      renderModalChampions();
    });
  });
}

document.getElementById('addAccountBtn')?.addEventListener('click', () => openAccountModal());
document.getElementById('modalClose')?.addEventListener('click', closeAccountModal);
document.getElementById('modalCancel')?.addEventListener('click', closeAccountModal);
document.getElementById('accountModal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('accountModal')) closeAccountModal();
});

document.getElementById('addChampionBtn')?.addEventListener('click', () => {
  modalChampions.push({ name: '', role: '' });
  renderModalChampions();
});

document.getElementById('modalSave')?.addEventListener('click', () => {
  const name = document.getElementById('modalAccountName').value.trim();
  if (!name) { alert('Please enter an account name.'); return; }
  const accountData = {
    name,
    vertical:    document.getElementById('modalVertical').value,
    stage:       document.getElementById('modalStage').value,
    lastContact: document.getElementById('modalLastContact').value,
    website:     document.getElementById('modalWebsite').value.trim(),
    notes:       document.getElementById('modalNotes').value.trim(),
    champions:   modalChampions.filter(c => c.name.trim())
  };
  if (modalEditId) {
    AccountTracker.update(modalEditId, accountData);
  } else {
    AccountTracker.add(accountData);
  }
  closeAccountModal();
  const filterVertical = document.getElementById('trackerFilterVertical')?.value || '';
  renderAccountCards(filterVertical);
});

document.getElementById('trackerFilterVertical')?.addEventListener('change', function() {
  renderAccountCards(this.value);
});

// Delegate account card actions
document.addEventListener('click', e => {
  const filterVertical = document.getElementById('trackerFilterVertical')?.value || '';
  if (e.target.matches('.account-open-strategy')) {
    const id = e.target.dataset.accountId;
    const account = AccountTracker.getById(id);
    if (!account) return;
    // Switch to Account Research and pre-populate
    showModule('prospecting');
    showProSection('proResearch');
    // Populate the strategy form
    const an = document.getElementById('accountName');
    const vt = document.getElementById('vertical');
    const nt = document.getElementById('notes');
    if (an) an.value = account.name;
    if (vt && account.vertical) vt.value = account.vertical;
    if (nt && account.notes) nt.value = account.notes;
    renderVerticalAccounts();
    renderRolePreview();
    return;
  }
  if (e.target.matches('.account-edit-btn')) {
    openAccountModal(e.target.dataset.accountId);
    return;
  }
  if (e.target.matches('.account-delete-btn')) {
    if (!confirm('Delete this account from the tracker?')) return;
    AccountTracker.delete(e.target.dataset.accountId);
    renderAccountCards(filterVertical);
    return;
  }
});

// Initial render of account cards
renderAccountCards();

/* ══════════════════════════════════════════════════════════════
   PROSPECTING STRATEGY GENERATOR
══════════════════════════════════════════════════════════════ */
document.getElementById('generateStrategyBtn')?.addEventListener('click', () => {
  const data = {
    accountName:  document.getElementById('psAccountName').value.trim() || 'Target account',
    prospectName: document.getElementById('psProspectName').value.trim() || 'there',
    role:         document.getElementById('psRole').value.trim() || 'Director of Product Engineering',
    vertical:     document.getElementById('psVertical').value,
    signal:       document.getElementById('psSignal').value,
    tone:         document.getElementById('psTone').value,
    objective:    document.getElementById('psObjective').value,
    notes:        document.getElementById('psNotes').value.trim(),
    linkedin:     '',
    prospectEmail: ''
  };
  const output = buildPlan(data);
  const container = document.getElementById('psOutput');
  if (!container) return;
  container.innerHTML = buildProspectingStrategyOutput(data, output);
});

function buildProspectingStrategyOutput(data, output) {
  const cap = capabilityMap[data.vertical] || capabilityMap['Smart home / connected devices'];
  const tone = toneGuidance[data.tone] || toneGuidance.Consultative;
  const signal = signalGuidance[data.signal] || signalGuidance['New product development or refresh'];
  const persona = output.persona;
  return `
    ${premiumSummary(data, output)}
    <div class="grid-2">
      ${card('Account fit', `<div class="pill-row"><span class="pill blue">${escapeHtml(data.vertical)}</span><span class="pill amber">${escapeHtml(data.signal)}</span><span class="pill violet">${escapeHtml(data.objective)}</span></div>${list(cap.pains.map(p => `Likely pain: ${p}`))}`)}
      ${card('Capability match', `<div class="pill-row">${cap.capabilities.map((c, i) => `<span class="pill ${['blue','amber','coral','violet'][i]}">${escapeHtml(c)}</span>`).join('')}</div><p class="source-list">${escapeHtml(cap.proof)}</p>`)}
    </div>
    ${card('GTM Strategy', list(output.strategy.plays))}
    ${knowledgePanel(data, output)}
    ${timeline(output)}
    <div class="grid-2">
      ${card('Risks to manage', list(output.strategy.risks))}
      ${card('Next actions', list(output.strategy.nextSteps))}
    </div>
    <h3 style="margin:20px 0 10px;color:var(--brand-hi);">Outreach Sequence</h3>
    ${copyBlock('LinkedIn connection request', output.messages.linkedinConnect)}
    ${copyBlock('LinkedIn follow-up', output.messages.linkedinFollow)}
    ${copyBlock('Email 1', output.messages.emailOne)}
    ${copyBlock('Email 2', output.messages.emailTwo)}
    ${copyBlock('Break-up / final check', output.messages.breakup)}
    <h3 style="margin:20px 0 10px;color:var(--brand-hi);">Competitor Intel</h3>
    ${renderCompetitorTab(data)}
    <h3 style="margin:20px 0 10px;color:var(--brand-hi);">SWOT Analysis</h3>
    ${renderSwotTab(data, output)}
    <h3 style="margin:20px 0 10px;color:var(--brand-hi);">Account Playbook</h3>
    ${renderPlaybookTab(data, output)}
  `;
}

/* ══════════════════════════════════════════════════════════════
   PERSONA STRATEGY GENERATOR
══════════════════════════════════════════════════════════════ */
document.getElementById('generatePersonaBtn')?.addEventListener('click', () => {
  const data = {
    accountName:  document.getElementById('ppAccountName').value.trim() || 'Target account',
    prospectName: document.getElementById('ppProspectName').value.trim() || 'there',
    role:         document.getElementById('ppRole').value,
    vertical:     document.getElementById('ppVertical').value,
    notes:        document.getElementById('ppNotes').value.trim(),
    signal:       'New product development or refresh',
    tone:         'Consultative',
    objective:    'Book discovery call',
    linkedin:     '',
    prospectEmail: ''
  };
  const output = buildPlan(data);
  const container = document.getElementById('ppOutput');
  if (!container) return;
  container.innerHTML = buildPersonaBriefOutput(data, output);
  // Trigger AI enrichment for discovery questions
  callAiEnrich(data).then(enriched => {
    if (!enriched) return;
    const dqSection = container.querySelector('.ai-dq-placeholder');
    if (dqSection && enriched.discoveryQuestions) {
      dqSection.innerHTML = aiInsightCard('AI-tailored discovery questions · ' + data.accountName, enriched.discoveryQuestions);
    }
  });
});

function buildPersonaBriefOutput(data, output) {
  const persona = output.persona;
  const cap = capabilityMap[data.vertical] || capabilityMap['Smart home / connected devices'];
  const awards = buildAwards(data);
  const tone = toneGuidance[data.tone] || toneGuidance.Consultative;
  const name = firstName(data.prospectName);
  const account = data.accountName;

  const messagingFramework = [
    `Opening: "${tone.opener} I'm reaching out because ${account}'s work in ${data.vertical.toLowerCase()} aligns with where ${getCompanyName()} can add the most value."`,
    `Pain bridge: "For ${persona.persona} leaders, the pressure is typically around ${persona.cares.slice(0, 2).join(' and ')}."`,
    `Capability hook: "${getCompanyName()} can support this through ${cap.capabilities[0]} and ${cap.capabilities[1]}."`,
    `Proof: "${cap.proof}"`,
    `CTA: "Would you be open to 20 minutes to ${persona.cta}?"`
  ];

  const callScript = `Opening:
Hi ${name}, it's [Your name] from ${getCompanyName()}. I'm reaching out because ${account}'s work in ${data.vertical.toLowerCase()} looks relevant to what our team supports.

Positioning:
We work with ${persona.persona.toLowerCase()} teams to address challenges around ${persona.cares[0]} and ${persona.cares[1]}. I wanted to see if any of those are active for your team right now.

Discovery questions:
1. Which product line is your team most focused on for the next 12 months?
2. Are you currently working with a CM partner, and what's working or not working?
3. What lifecycle stage is your current priority product: EVT, DVT, PVT or production ramp?
4. Who else owns decisions on manufacturing partner selection — R&D, procurement, quality?

Close:
Based on what you share, I can put together a short ${getCompanyName()} note tailored to your product area, then we can decide if a 20-minute technical review is worthwhile.`;

  const fearsSection = persona.fears && persona.fears.length
    ? card('What this persona fears', list(persona.fears))
    : '';
  const languageSection = persona.language && persona.language.length
    ? `<article class="card persona-language-card"><h3>Language to use</h3><div class="language-pills">${persona.language.map(l => `<span class="pill-tag">${escapeHtml(l)}</span>`).join('')}</div></article>`
    : '';
  const hookSection = persona.hook
    ? `<article class="card persona-hook-card"><h3>Opening hook guidance</h3><p class="persona-hook-text">${escapeHtml(persona.hook)}</p></article>`
    : '';
  const roleDiscoveryQuestions = persona.discoveryQuestions && persona.discoveryQuestions.length
    ? card('Persona discovery questions · ' + escapeHtml(data.role), list(persona.discoveryQuestions))
    : '';

  return `
    <div class="persona-brief">
      <article class="card persona-hero">
        <div class="persona-hero-inner">
          <div>
            <p class="eyebrow">Persona mapped · ${escapeHtml(data.vertical)}</p>
            <h2>${escapeHtml(persona.persona)}</h2>
            ${persona.title ? `<p class="source-list" style="color:var(--text-lo);">${escapeHtml(persona.title)}</p>` : ''}
            <p class="source-list">Role: ${escapeHtml(data.role)} · Account: ${escapeHtml(account)}</p>
          </div>
          <div class="persona-cta-box">
            <span class="eyebrow">Recommended CTA</span>
            <p>"…${escapeHtml(persona.cta)}"</p>
          </div>
        </div>
      </article>
      ${card('What this persona cares about', list(persona.cares.map(c => c)))}
      ${fearsSection}
      ${languageSection}
      ${hookSection}
      ${card('Role-specific pain points · ' + data.vertical, list(cap.pains))}
      ${roleDiscoveryQuestions}
      <div class="ai-dq-placeholder"></div>
      ${card('Messaging framework', list(messagingFramework))}
      ${copyBlock('Call script for ' + data.role, callScript)}
      <article class="card">
        <h3>Awards &amp; signals for outreach hooks</h3>
        <div class="awards-grid">
          ${awards.map(a => `
            <div class="award-card">
              <div class="award-badge">${a.badge}</div>
              <div class="award-name">${escapeHtml(a.name)}</div>
              <div class="award-year">${escapeHtml(a.year)}</div>
              <div class="award-org">${escapeHtml(a.org)}</div>
              <div class="award-outreach-angle">${escapeHtml(a.angle)}</div>
            </div>
          `).join('')}
        </div>
      </article>
    </div>
  `;
}

/* ══════════════════════════════════════════════════════════════
   LEAD QUALIFICATION GENERATOR
══════════════════════════════════════════════════════════════ */
document.getElementById('qualifyLeadBtn')?.addEventListener('click', () => {
  const data = {
    account:   document.getElementById('lqAccount').value.trim() || 'Target account',
    prospect:  document.getElementById('lqProspect').value.trim() || 'there',
    role:      document.getElementById('lqRole').value.trim() || 'Business owner',
    vertical:  document.getElementById('lqVertical').value,
    signal:    document.getElementById('lqSignal').value,
    notes:     document.getElementById('lqNotes').value.trim()
  };
  const container = document.getElementById('lqOutput');
  if (!container) return;
  container.innerHTML = buildLeadQualification(data);
});

function buildLeadQualification(data) {
  const cap = capabilityMap[data.vertical] || capabilityMap['Smart home / connected devices'];
  const signal = signalGuidance[data.signal] || signalGuidance['New product development or refresh'];
  const persona = getPersona(data.role);
  const notes = data.notes.toLowerCase();

  // ICP Fit Score calculation
  let score = 30;
  const verticals = Object.keys(capabilityMap);
  if (verticals.includes(data.vertical)) score += 20;
  const seniorRoles = ['director', 'vp', 'cto', 'coo', 'head of', 'chief', 'manager'];
  if (seniorRoles.some(r => data.role.toLowerCase().includes(r))) score += 15;
  const strongSignals = ['rfq', 'rfi', 'new product', 'scaling', 'supplier', 'localisation'];
  if (strongSignals.some(s => data.signal.toLowerCase().includes(s))) score += 15;
  if (notes.length > 80) score += 10;
  if (notes.includes('budget') || notes.includes('timeline') || notes.includes('meeting')) score += 10;
  score = Math.min(score, 100);

  const scoreBand = score >= 70 ? { label: 'High Fit', action: 'Book a discovery call this week', color: '#4ade80' }
    : score >= 50 ? { label: 'Medium Fit', action: 'Engage with targeted vertical content first', color: '#fbbf24' }
    : { label: 'Low Fit', action: 'Research more and nurture before direct outreach', color: '#9ca3af' };

  const bantChecklist = [
    {
      criterion: 'Budget',
      question: 'Is there budget or RFQ intent indicated?',
      status: (notes.includes('budget') || notes.includes('rfq') || notes.includes('investment')) ? 'confirmed' : 'unknown',
      guidance: `Look for RFQ language, capital expenditure signals, or NPI project approval in notes. Signal: "${data.signal}" suggests ${signal.lifecycle} stage.`
    },
    {
      criterion: 'Authority',
      question: 'Is this a decision-maker or influencer?',
      status: seniorRoles.some(r => data.role.toLowerCase().includes(r)) ? 'confirmed' : 'partial',
      guidance: `Role "${data.role}" maps to persona: ${persona.persona}. Recommended next step: ${persona.cta}.`
    },
    {
      criterion: 'Need',
      question: `Which pain from ${getCompanyName()}'s capability map matches?`,
      status: 'confirmed',
      guidance: `Vertical: ${data.vertical}. Top pains: ${cap.pains.slice(0, 2).join(', ')}.`
    },
    {
      criterion: 'Timeline',
      question: 'What lifecycle stage: EVT / DVT / PVT / FATP?',
      status: (notes.includes('evt') || notes.includes('dvt') || notes.includes('pvt') || notes.includes('fatp') || notes.includes('launch')) ? 'confirmed' : 'unknown',
      guidance: `Signal "${data.signal}" suggests: ${signal.lifecycle}. Ask directly in discovery call.`
    },
    {
      criterion: 'Fit',
      question: 'OEM / ODM / JDM classification',
      status: (notes.includes('oem') || notes.includes('odm') || notes.includes('jdm')) ? 'confirmed' : 'unknown',
      guidance: 'Confirm business model in first discovery call — this determines the commercial model and NRE scope.'
    }
  ];

  const championMap = [
    { contact: '1. Primary Champion', role: `${persona.persona} lead`, action: `Direct outreach with signal: "${data.signal}"` },
    { contact: '2. Technical Stakeholder', role: 'Adjacent R&D or NPI owner', action: 'Reach via LinkedIn or warm intro from primary champion' },
    { contact: '3. Procurement / Sourcing', role: 'Commercial decision support', action: 'Engage once technical interest confirmed' },
    { contact: '4. NPI / Quality Owner', role: 'Validation and supplier qualification', action: 'Include in discovery call for technical depth' },
    { contact: '5. Senior Sponsor', role: 'Executive / GM / VP', action: 'Engage via executive sponsorship once champion engagement is confirmed' }
  ];

  const statusIcon = s => s === 'confirmed' ? '<span style="color:#4ade80;">✓</span>' : s === 'partial' ? '<span style="color:#fbbf24;">~</span>' : '<span style="color:#9ca3af;">?</span>';

  return `
    <article class="card score-summary-card">
      <div class="score-ring-row">
        <div class="score-ring" style="--score:${score * 3.6}deg"><span>${score}</span></div>
        <div>
          <p class="eyebrow">ICP Fit Score</p>
          <h3 style="color:${scoreBand.color};">${scoreBand.label}</h3>
          <p class="source-list">${escapeHtml(data.account)} · ${escapeHtml(data.vertical)}</p>
          <div class="recommendation-box" style="border-left:3px solid ${scoreBand.color};padding:8px 12px;margin-top:10px;background:rgba(255,255,255,0.03);border-radius:0 var(--r-sm) var(--r-sm) 0;">
            <strong style="display:block;font-size:11px;color:var(--text-lo);letter-spacing:0.07em;text-transform:uppercase;margin-bottom:3px;">Recommended next action</strong>
            <p style="margin:0;color:var(--text-hi);">${escapeHtml(scoreBand.action)}</p>
          </div>
        </div>
      </div>
    </article>
    <article class="card">
      <h3>BANT+ Qualification Checklist</h3>
      <p class="source-list">CoalitionX qualification framework adapted for manufacturing sales. Confirm each criterion in discovery.</p>
      <table class="bant-table">
        <thead><tr><th>Criterion</th><th>Question</th><th>Status</th><th>Guidance</th></tr></thead>
        <tbody>
          ${bantChecklist.map(b => `
            <tr>
              <td><strong>${escapeHtml(b.criterion)}</strong></td>
              <td>${escapeHtml(b.question)}</td>
              <td style="text-align:center;font-size:16px;">${statusIcon(b.status)}</td>
              <td class="source-list">${escapeHtml(b.guidance)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </article>
    <article class="card">
      <h3>5-Contact Champion Map Strategy</h3>
      <p class="source-list">Build multi-threaded coverage across ${escapeHtml(data.account)} before pushing to RFQ. Single-contact strategies are high risk.</p>
      <div class="champion-map">
        ${championMap.map(c => `
          <div class="champion-map-row">
            <div class="champion-map-contact">${escapeHtml(c.contact)}</div>
            <div class="champion-map-role">${escapeHtml(c.role)}</div>
            <div class="champion-map-action">${escapeHtml(c.action)}</div>
          </div>
        `).join('')}
      </div>
    </article>
    ${card('Vertical capability match', `${list(cap.capabilities)}<p class="source-list" style="margin-top:8px;">${escapeHtml(cap.proof)}</p>`)}
  `;
}

/* ══════════════════════════════════════════════════════════════
   DEAL QUALIFICATION GENERATOR
══════════════════════════════════════════════════════════════ */
document.getElementById('qualifyDealBtn')?.addEventListener('click', () => {
  const data = {
    account:   document.getElementById('dqAccount').value.trim() || 'Target account',
    prospect:  document.getElementById('dqProspect').value.trim() || 'Contact',
    stage:     document.getElementById('dqStage').value,
    vertical:  document.getElementById('dqVertical').value,
    value:     document.getElementById('dqValue').value.trim(),
    notes:     document.getElementById('dqNotes').value.trim()
  };
  const container = document.getElementById('dqOutput');
  if (!container) return;
  container.innerHTML = buildDealQualification(data);
});

function buildDealQualification(data) {
  const cap = capabilityMap[data.vertical] || capabilityMap['Smart home / connected devices'];
  const notes = data.notes.toLowerCase();

  // Deal health score
  let score = 25;
  if (data.account && data.account !== 'Target account') score += 15;
  if (['RFQ Prep', 'Proposal', 'Negotiation'].includes(data.stage)) score += 20;
  else if (data.stage === 'Technical Review') score += 12;
  if (data.value && data.value.trim()) score += 10;
  if (notes.includes('champion') || notes.includes('contact') || notes.includes('engineer')) score += 10;
  if (notes.includes('timeline') || notes.includes('deadline') || notes.includes('quarter')) score += 10;
  if (notes.length > 100) score += 10;
  score = Math.min(score, 100);

  const scoreBand = score >= 70 ? { label: 'Healthy', color: '#4ade80' }
    : score >= 45 ? { label: 'Developing', color: '#fbbf24' }
    : { label: 'Early Stage', color: '#9ca3af' };

  const stageActions = {
    'Discovery':        ['Qualify BANT and confirm product line, volume and timeline', 'Identify key stakeholders: EE, ME, TPM, procurement, quality', 'Propose DFM review or factory visit as next step'],
    'Technical Review': ['Share vertical-specific capability proof and case studies', 'Run DFM review and document findings', 'Confirm decision criteria and evaluation scorecard'],
    'RFQ Prep':         ['Confirm all RFQ inputs: BOM, volume, target price, certifications', 'Assign project manager and engineering lead', 'Prepare preliminary cost model to de-risk submission'],
    'Proposal':         ['Submit RFP with executive cover letter and tailored capability proof', 'Propose factory visit and executive sponsor meeting', `Coach champion on internal business case for ${getCompanyName()}`],
    'Negotiation':      ['Prepare final commercial terms with VA/VE savings highlighted', 'Escalate to executive sponsor for strategic account closure', 'Propose pilot programme or phased LOI to reduce switch risk']
  };

  const meddic = [
    { criterion: 'Metrics', question: 'What measurable outcome does the customer need?', guidance: `Typical for ${data.vertical}: cost reduction, faster NPI, compliance readiness, supply chain resilience, yield improvement.` },
    { criterion: 'Economic Buyer', question: 'Who controls the budget decision?', guidance: 'Typically VP Engineering, CPO, COO or Procurement Director. Confirm who signs off on CM selection.' },
    { criterion: 'Decision Criteria', question: 'What does the customer evaluate on?', guidance: 'Manufacturing capability, FATP location, quality certifications, NPI support, cost, lead times, engineering responsiveness.' },
    { criterion: 'Decision Process', question: 'What is the typical RFQ/RFP/supplier-selection process?', guidance: `At ${data.stage} stage: ${(stageActions[data.stage] || stageActions['Discovery'])[0]}.` },
    { criterion: 'Identify Pain', question: 'Which capability pain is active?', guidance: cap.pains.slice(0, 3).join(' · ') },
    { criterion: 'Champion', question: `Who is internally advocating for ${getCompanyName()}?`, guidance: 'Map 5 contacts: engineering lead, NPI/quality, procurement, adjacent technical, executive sponsor.' }
  ];

  const stakeholderMap = [
    { role: 'EE (Electronics Engineering)', stage: 'Discovery → Technical Review', action: 'PCBA, firmware, RF, sensor design and validation questions' },
    { role: 'ME (Mechanical Engineering)', stage: 'Discovery → RFQ Prep', action: 'Enclosure, tooling, thermal, DFM/DFA and cosmetic yield' },
    { role: 'TPM (Technical Programme Mgr)', stage: 'All stages', action: 'Schedule, dependencies, gate criteria, cross-functional coordination' },
    { role: 'Procurement / Sourcing', stage: 'RFQ Prep → Negotiation', action: 'Commercial terms, supplier qualification, payment and incoterms' },
    { role: 'Quality / Compliance', stage: 'Technical Review → RFQ', action: 'Certifications, quality plan, IPC standards, traceability' },
    { role: 'Executive / GM', stage: 'Proposal → Negotiation', action: 'Strategic alignment, executive sponsorship, LOI / contract' }
  ];

  const riskFlags = [
    !notes.includes('champion') ? 'No named champion identified — single-threaded outreach is high risk.' : null,
    data.stage === 'Discovery' && !notes.includes('timeline') ? 'No timeline confirmed — risk of deal stalling indefinitely without urgency trigger.' : null,
    !data.value ? 'Deal value not estimated — qualify annual volume and target price before investing heavily.' : null,
    notes.includes('incumbent') || notes.includes('existing cm') || notes.includes('current cm') ? 'Incumbent CM detected in notes — prepare competitive defence strategy.' : null,
    cap.pains.some(p => notes.includes(p.toLowerCase().slice(0, 10))) ? null : 'No active pain signal from capability map — confirm fit before proceeding to RFX.'
  ].filter(Boolean).slice(0, 4);

  if (!riskFlags.length) riskFlags.push('No critical risk flags identified based on inputs — continue qualification process.');

  return `
    <article class="card score-summary-card">
      <div class="score-ring-row">
        <div class="score-ring" style="--score:${score * 3.6}deg"><span>${score}</span></div>
        <div>
          <p class="eyebrow">Deal Health Score</p>
          <h3 style="color:${scoreBand.color};">${scoreBand.label}</h3>
          <p class="source-list">${escapeHtml(data.account)} · ${escapeHtml(data.stage)} stage${data.value ? ' · ' + escapeHtml(data.value) : ''}</p>
        </div>
      </div>
    </article>
    <article class="card">
      <h3>MEDDIC Qualification · Manufacturing Sales Adapted</h3>
      <p class="source-list">Confirm each criterion to build a complete picture of deal health and identify gaps before investing in proposal work.</p>
      <div class="meddic-grid">
        ${meddic.map(m => `
          <div class="meddic-cell">
            <div class="meddic-criterion">${escapeHtml(m.criterion)}</div>
            <div class="meddic-question">${escapeHtml(m.question)}</div>
            <div class="meddic-guidance source-list">${escapeHtml(m.guidance)}</div>
          </div>
        `).join('')}
      </div>
    </article>
    <article class="card">
      <h3>Stakeholder Engagement Map</h3>
      <p class="source-list">Who to engage at each stage of the deal cycle — based on ${escapeHtml(getCompanyName())}'s EE/ME/TPM collaboration model.</p>
      <div class="stakeholder-map">
        ${stakeholderMap.map(s => `
          <div class="stakeholder-row">
            <div class="stakeholder-role">${escapeHtml(s.role)}</div>
            <div class="stakeholder-stage">${escapeHtml(s.stage)}</div>
            <div class="stakeholder-action source-list">${escapeHtml(s.action)}</div>
          </div>
        `).join('')}
      </div>
    </article>
    ${card('Risk flags', list(riskFlags))}
    ${card(`Recommended next steps · ${escapeHtml(data.stage)} stage`, list(stageActions[data.stage] || stageActions['Discovery']))}
  `;
}

/* ══════════════════════════════════════════════════════════════
   RFX STAGE STRATEGY GENERATOR
══════════════════════════════════════════════════════════════ */
document.getElementById('buildRfxStrategyBtn')?.addEventListener('click', () => {
  const data = {
    account:  document.getElementById('rqAccount').value.trim() || 'Target account',
    prospect: document.getElementById('rqProspect').value.trim() || 'Contact',
    rfxType:  document.getElementById('rqType').value,
    vertical: document.getElementById('rqVertical').value,
    product:  document.getElementById('rqProduct').value.trim(),
    volume:   document.getElementById('rqVolume').value.trim(),
    timeline: document.getElementById('rqTimeline').value.trim(),
    notes:    document.getElementById('rqNotes').value.trim()
  };
  const container = document.getElementById('rqOutput');
  if (!container) return;
  container.innerHTML = buildRfxStrategy(data);
});

function buildRfxStrategy(data) {
  const cap = capabilityMap[data.vertical] || capabilityMap['Smart home / connected devices'];

  const readinessChecklist = {
    'RFI': [
      'Company capability overview prepared and tailored to this vertical',
      'Relevant case studies (anonymised if required) available',
      'Footprint map (site locations, headcount, certifications) ready to share',
      'Named technical contact assigned to this RFI',
      'Response reviewed for vertical-specific relevance before submission',
      'No pricing included — RFI is a credibility and information-gathering stage'
    ],
    'RFQ': [
      'BOM received and reviewed for cost assumptions',
      'Volume, target price and annual unit forecast confirmed',
      'FATP site requirements confirmed (CN, MY, HU, MX)',
      'NRE scope defined: tooling, fixtures, test jigs, pilot build',
      'Certification requirements confirmed (CE, FCC, UKCA, ISO)',
      'Payment terms and incoterms discussed in advance',
      'Internal project manager assigned before submission',
      'VA/VE suggestions prepared to accompany the cost response'
    ],
    'RFP': [
      'Executive sponsor assigned and briefed for strategic account',
      'Champion inside the customer organisation identified and coached',
      'Factory visit offered and scheduled or proposed',
      'Quality plan, programme plan and risk mitigation sections completed',
      'Reference contacts approved and notified',
      'Pilot NRE or phased LOI proposal prepared as a close option',
      'Competitive defence strategy prepared for incumbent CM scenario'
    ]
  };

  const capabilityMatchItems = cap.capabilities.map((c, i) => {
    const reqMapping = {
      0: 'FATP and regional manufacturing requirements',
      1: 'Smart manufacturing and quality system requirements',
      2: 'Product category and application experience requirements',
      3: 'In-house integration capability requirements'
    };
    return `${getCompanyName()}: ${c} → Addresses: ${reqMapping[i] || 'General manufacturing requirements'}`;
  });

  const keyQuestions = {
    'RFI': [
      `What is the target product category and annual volume for this ${data.rfxType}?`,
      'What certifications and compliance standards are required?',
      'What is the current lifecycle stage: concept, EVT, DVT?',
      'Are you evaluating OEM, ODM or JDM models?',
      'Which FATP regions are preferred or mandated?',
      'What is the evaluation timeline and shortlisting criteria?',
      'Who are the key technical and commercial stakeholders for this process?',
      'Is there an incumbent CM being evaluated alongside new suppliers?'
    ],
    'RFQ': [
      'Is the BOM fully defined, or are there open items?',
      `What is the target landed cost per unit for ${data.product || 'the product'}?`,
      'What certifications are in scope: CE, FCC, UKCA, ISO13485?',
      'Is tooling in scope or being transferred from the current supplier?',
      'What are the preferred payment terms and incoterms?',
      'Are there preferred component vendors or approved supplier lists?',
      `What is the annual volume ramp plan: ${data.volume ? data.volume + ', and how does it scale?' : 'Year 1, Year 2, Year 3?'}`,
      'Are there VA/VE or cost-down requirements included in the RFQ scope?',
      'What test coverage and traceability are required at FATP?',
      'What is the submission format and evaluation criteria weighting?'
    ],
    'RFP': [
      'What are the executive-level success criteria for this partnership?',
      'Who is the economic buyer and what does their decision process look like?',
      'What will the incumbent CM offer to retain this business?',
      'Is a pilot programme or NRE project acceptable as a first step?',
      'What factory visit schedule fits the customer\'s evaluation timeline?',
      'Are there IP or co-development provisions in the contract scope?',
      'What is the contract term expectation: 1 year, 3 years, lifecycle?',
      'Are there executive-level relationships at the customer we should engage?'
    ]
  };

  const competitivePositioning = [
    `vs. Tier-1 EMS (Foxconn, Flex, Jabil): ${getCompanyName()} offers comparable capability with smaller MOQ (50K–500K), dedicated NPI engineering and faster turnaround.`,
    `vs. Single-site China CM: ${getCompanyName()}'s multi-site FATP (CN + MY + HU + MX) provides supply chain resilience, EU/US compliance credentials and localisation options.`,
    `vs. Local EU CM: ${getCompanyName()} combines EU-based FATP (Hungary) with full in-house R&D, PCBA, plastics and automation — not just assembly.`,
    `Key differentiators to lead with: OEM/ODM/JDM flexibility, engineering co-development from EVT stage, IP-protected non-captive model, and vertical-specific manufacturing experience.`
  ];

  return `
    <article class="card">
      <div style="display:flex;gap:14px;align-items:flex-start;">
        <div style="flex:1;">
          <p class="eyebrow">RFX Strategy · ${escapeHtml(data.rfxType)}</p>
          <h2>${escapeHtml(data.account)}${data.product ? ' — ' + escapeHtml(data.product) : ''}</h2>
          <p class="source-list">${escapeHtml(data.vertical)}${data.volume ? ' · ' + escapeHtml(data.volume) : ''}${data.timeline ? ' · ' + escapeHtml(data.timeline) : ''}</p>
        </div>
        <span class="accordion-stage-badge" style="font-size:16px;padding:8px 16px;">${escapeHtml(data.rfxType)}</span>
      </div>
    </article>
    ${card(`${escapeHtml(data.rfxType)} Readiness Checklist`, `<p class="source-list">Confirm these before submitting your ${data.rfxType} response to maximise success rate.</p>${list(readinessChecklist[data.rfxType] || readinessChecklist['RFI'])}`)}
    ${card('Capability Match · ' + escapeHtml(data.vertical), list(capabilityMatchItems))}
    ${card(`Key questions to ask the customer before ${data.rfxType === 'RFI' ? 'responding' : 'pricing'}`, list(keyQuestions[data.rfxType] || keyQuestions['RFI']))}
    ${card('Competitive positioning', list(competitivePositioning))}
    <article class="card">
      <h3>Suggested ${escapeHtml(data.rfxType)} response structure</h3>
      ${data.rfxType === 'RFI' ? list([`1. Executive introduction — ${getCompanyName()} Group overview and strategic vision`, '2. Capability summary — R&D, PCBA, plastics/tooling, FATP, automation, test', '3. Multi-site footprint map — China, Malaysia, Hungary, Mexico', '4. Vertical-specific experience — relevant to ' + escapeHtml(data.vertical), '5. OEM / ODM / JDM model explanation', '6. Quality and compliance credentials', '7. Relevant case studies (anonymised)', '8. Proposed next steps — DFM review, technical workshop, or factory visit invitation']) : ''}
      ${data.rfxType === 'RFQ' ? list([`1. Cover letter — account context and ${getCompanyName()} engagement history`, '2. BOM cost breakdown — materials, PCBA, assembly, test, overhead', '3. NRE and tooling plan — soft-to-hard tooling path, lead times', '4. Volume pricing tiers and MOQ', '5. Lead times — EVT samples, DVT build, PVT ramp, FATP steady state', '6. Regional FATP options and landed-cost model', '7. VA/VE suggestions — DFM improvements with estimated cost impact', '8. Quality plan — IPC standards, yield targets, test coverage', '9. Payment terms and incoterms', '10. Appendices — site certifications, org chart, reference contacts']) : ''}
      ${data.rfxType === 'RFP' ? list([`1. Executive summary — strategic case for ${getCompanyName()} partnership`, '2. Capability proof — specific to ' + escapeHtml(data.vertical) + ' and product category', '3. Programme plan — NPI timeline, EVT/DVT/PVT gates, ramp plan', '4. Quality plan — PFMEA, control plans, yield targets, IPC standards', '5. Cost model — BOM, NRE, tooling, volume tiers, landed-cost comparison', '6. Risk mitigation — supply chain, technical, compliance, capacity', '7. Team structure — project manager, engineering lead, quality lead', '8. Reference contacts — approved existing customers in relevant vertical', '9. Proposed next steps — NDA, pilot programme, factory visit, LOI', '10. Appendices — site certifications, financial references, insurance']) : ''}
    </article>
  `;
}

/* ══════════════════════════════════════════════════════════════
   RFX EVALUATOR — Evaluate RFX
══════════════════════════════════════════════════════════════ */
document.getElementById('evaluateRfxBtn')?.addEventListener('click', () => {
  const data = {
    account:      document.getElementById('reAccount').value.trim() || 'Target account',
    rfxType:      document.getElementById('reType').value,
    vertical:     document.getElementById('reVertical').value,
    requirements: document.getElementById('reRequirements').value.trim(),
    stage:        document.getElementById('reStage').value.trim()
  };
  const container = document.getElementById('reOutput');
  if (!container) return;
  container.innerHTML = buildRfxEvaluation(data);
});

function buildRfxEvaluation(data) {
  const cap = capabilityMap[data.vertical] || capabilityMap['Smart home / connected devices'];
  const reqLines = data.requirements
    ? data.requirements.split(/\n|[;,]/).map(r => r.trim()).filter(Boolean)
    : ['Quality and reliability standards', 'FATP capability and regional presence', 'NPI and engineering support', 'Certifications and compliance', 'Cost and lead times'];

  // Build capability matrix
  const capabilityMatrix = reqLines.slice(0, 8).map((req, i) => {
    const reqLower = req.toLowerCase();
    let capMatch = 'General manufacturing and FATP capability';
    let confidence = 'Medium';
    if (reqLower.includes('quality') || reqLower.includes('iso') || reqLower.includes('compliance')) {
      capMatch = 'Smart manufacturing systems, ISO13485-ready processes, in-house test and traceability';
      confidence = 'High';
    } else if (reqLower.includes('fatp') || reqLower.includes('assembly') || reqLower.includes('regional')) {
      capMatch = 'FATP in China, Malaysia, Hungary and Mexico';
      confidence = 'High';
    } else if (reqLower.includes('npi') || reqLower.includes('engineering') || reqLower.includes('design')) {
      capMatch = 'In-house R&D, DFM/DFA, EVT/DVT/PVT NPI engineering support';
      confidence = 'High';
    } else if (reqLower.includes('cost') || reqLower.includes('price') || reqLower.includes('commercial')) {
      capMatch = 'Competitive costing with VA/VE, total cost of ownership framing';
      confidence = 'Medium';
    } else if (reqLower.includes('pcba') || reqLower.includes('electronics') || reqLower.includes('rf')) {
      capMatch = 'In-house SMT, PCBA, electronics and RF assembly';
      confidence = 'High';
    } else if (reqLower.includes('tool') || reqLower.includes('plastic') || reqLower.includes('mould')) {
      capMatch = 'In-house tooling, injection moulding, plastics and surface finishing';
      confidence = 'High';
    } else if (reqLower.includes('automat') || reqLower.includes('smart') || reqLower.includes('industry 4')) {
      capMatch = 'UMS smart manufacturing systems, 500+ automation engineers, AI/CV capability';
      confidence = 'High';
    }
    const confClass = confidence === 'High' ? 'conf-high' : confidence === 'Medium' ? 'conf-medium' : 'conf-gap';
    return { req, capMatch, confidence, confClass };
  });

  const gaps = capabilityMatrix.filter(r => r.confidence === 'Gap').map(r => r.req);
  const gapItems = gaps.length
    ? gaps.map(g => `Requirement gap identified: "${g}" — address proactively in the RFX response with a plan or mitigation.`)
    : ['No critical capability gaps identified based on inputs — validate with full BOM and requirements review.', 'Run a DFM review before submitting to identify any technical risk areas not captured in the requirements.'];

  const winThemes = [
    `Engineering co-development: ${getCompanyName()} engages from EVT stage, not just at production handoff — reducing re-spin and compliance risk for ${escapeHtml(data.vertical)} products.`,
    `Multi-site FATP resilience: CN + MY + HU + MX provides EU/US compliance credentials and supply chain optionality that single-site CMs cannot match.`,
    `In-house integration: R&D, PCBA, plastics/tooling, automation, test systems and FATP under one roof — reducing NPI handoff risk and accelerating time to market.`,
    `Agile for 50K–500K: ${getCompanyName()} fills the gap between Tier-1 EMS minimum volumes and boutique CM limited scale — with dedicated engineering and project management.`
  ];

  const riskAssessment = [
    { type: 'Commercial', risk: 'Incumbent CM price concessions may narrow the cost advantage at RFP stage', mitigation: 'Lead with total cost of ownership framing and VA/VE savings — not unit cost alone.' },
    { type: 'Technical', risk: 'Requirements may evolve post-RFQ, creating scope creep risk', mitigation: 'Confirm BOM, certifications and FATP scope in writing before committing to commercial terms.' },
    { type: 'Timeline', risk: 'Tooling lead times and EVT build slots may conflict with customer\'s NPI timeline', mitigation: 'Surface tooling and sample lead times early — propose a preliminary timeline before RFQ submission.' },
    { type: 'Relationship', risk: 'Procurement-led evaluation may reduce technical differentiation weight in scoring', mitigation: 'Build engineering champion before RFQ submission to ensure technical criteria are weighted appropriately.' }
  ];

  return `
    <article class="card">
      <p class="eyebrow">RFX Evaluation · ${escapeHtml(data.rfxType)}</p>
      <h2>${escapeHtml(data.account)}</h2>
      <p class="source-list">${escapeHtml(data.vertical)}${data.stage ? ' · Stage: ' + escapeHtml(data.stage) : ''}</p>
    </article>
    <article class="card">
      <h3>Capability vs Requirements Matrix</h3>
      <p class="source-list">Customer requirements mapped to ${getCompanyName()} capabilities. Confidence: High = strong match, Medium = addressable, Gap = needs a response plan.</p>
      <table class="capability-matrix-table">
        <thead><tr><th>Customer requirement</th><th>${getCompanyName()} capability match</th><th>Confidence</th></tr></thead>
        <tbody>
          ${capabilityMatrix.map(r => `
            <tr>
              <td>${escapeHtml(r.req)}</td>
              <td class="source-list">${escapeHtml(r.capMatch)}</td>
              <td><span class="conf-badge ${r.confClass}">${escapeHtml(r.confidence)}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </article>
    ${card('Gaps to address', list(gapItems))}
    ${card('Win themes · Key differentiators to lead with', list(winThemes))}
    <article class="card">
      <h3>Risk assessment</h3>
      <div class="risk-grid">
        ${riskAssessment.map(r => `
          <div class="risk-card">
            <div class="risk-type">${escapeHtml(r.type)} risk</div>
            <div class="risk-detail">${escapeHtml(r.risk)}</div>
            <div class="risk-mitigation"><strong>Mitigation:</strong> ${escapeHtml(r.mitigation)}</div>
          </div>
        `).join('')}
      </div>
    </article>
  `;
}

/* ══════════════════════════════════════════════════════════════
   LEGACY RFX SCORING TOOL MOUNT
   The old renderEvaluationTab is now embedded in the RFX Evaluator
   module's Evaluation section alongside the new evaluator
══════════════════════════════════════════════════════════════ */
function mountLegacyRfxScoring() {
  const mount = document.getElementById('rfxLegacyScoringMount');
  if (!mount) return;
  const dummyData = { accountName: '', vertical: 'Air purification & home appliances' };
  mount.innerHTML = renderEvaluationTab(dummyData);
  initRfxScoring();
}

/* ══════════════════════════════════════════════════════════════
   TAB CLICK HANDLER (inside Prospecting Research section)
══════════════════════════════════════════════════════════════ */
document.addEventListener('click', e => {
  if (e.target.matches('.tab')) {
    const tabId = e.target.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    const panel = document.getElementById(tabId);
    if (panel) panel.classList.add('active');
  }
});
