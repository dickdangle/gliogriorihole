(() => {
  "use strict";

  const S = window.SpheraState;
  if (!S) throw new Error("Sphera state runtime did not load.");

  const STORAGE_KEY = "sphera.goose-crossing.local.capsule.v1";
  const SOURCE_LAYERS = [
    { id: "do", name: "DO", note: "C", frequency: 261.63, color: "#ff5f62" },
    { id: "re", name: "RE", note: "D", frequency: 293.66, color: "#ffa34f" },
    { id: "mi", name: "MI", note: "E", frequency: 329.63, color: "#e7dc58" },
    { id: "fa", name: "FA", note: "F", frequency: 349.23, color: "#65d477" },
    { id: "sol", name: "SOL", note: "G", frequency: 392.00, color: "#58d5d5" },
    { id: "la", name: "LA", note: "A", frequency: 440.00, color: "#669cff" },
    { id: "ti", name: "TI", note: "B", frequency: 493.88, color: "#ae78ef" },
    { id: "do-prime", name: "DO′", note: "C′", frequency: 523.25, color: "#ee78c0" }
  ];
  const AXES = ["w", "x", "y", "z"];
  const $ = selector => document.querySelector(selector);
  const els = {
    noteGrid: $("#note-grid"), selection: $("#selection-label"), tie: $("#tie-button"), emptyKnot: $("#empty-knot"),
    activeKnot: $("#active-knot"), knotId: $("#knot-id"), knotName: $("#knot-name"), knotPair: $("#knot-pair"),
    knotSeed: $("#knot-seed"), knotPoints: $("#knot-points"), knotCoupling: $("#knot-coupling"), knotAxis: $("#knot-axis"),
    knotTarget: $("#knot-target"), knotLedger: $("#knot-ledger"), openBiome: $("#open-biome"), biomePanel: $("#biome-panel"),
    biomeFrame: $("#biome-frame"), foldBiome: $("#fold-biome"), condensate: $("#condensate"), targetCopy: $("#target-copy"),
    goalRing: $("#goal-ring"), pressure: $("#pressure"), pointCount: $("#point-count"), bonks: $("#bonks"), checkpoint: $("#checkpoint"),
    actionStep: $("#action-step"), receiptStep: $("#receipt-step"), receiptList: $("#receipt-list"), integrity: $("#integrity"),
    capsuleId: $("#capsule-id"), saveLabel: $("#save-label"), saveState: $(".save-state"), exportButton: $("#export-button"),
    importButton: $("#import-button"), importFile: $("#import-file"), resetButton: $("#reset-button"), seedInput: $("#seed-input"),
    seedButton: $("#seed-button"), toast: $("#toast")
  };

  const blankTelemetry = () => ({ points: 0, bonks: 0, meanCondensate: null, meanPressure: null, sliceAxis: "w" });

  class SeedPrimitive {
    constructor() {
      this.id = "goose-crossing.master-seed";
      this.version = "1.0.0";
      this.role = "master seed";
      this.mode = ["infrastructure"];
      this.metadata = { contract: "sphera.seed/1" };
      this.state = { schema: "sphera.seed/1", value: "goose-crossing-local-01", algorithm: "fnv1a32", generation: 0, lastEvent: null };
    }
    handle(event) {
      if (event.type !== "seed.set") return;
      this.state = { schema: "sphera.seed/1", value: String(event.payload.seed), algorithm: "fnv1a32", generation: this.state.generation + 1, lastEvent: event.sequence };
    }
    snapshot() { return this.state; }
    restore(state) { this.state = state; }
  }

  class FieldPrimitive {
    constructor() {
      this.id = "goose-crossing.relations";
      this.version = "1.0.0";
      this.role = "note relation ledger";
      this.mode = ["pipeline"];
      this.metadata = { source: "Spherai Voxel 64 shell layers", adapter: "goose-crossing.local/1" };
      this.state = { schema: "goose.crossing.relations/1", selected: [], knots: [], activeKnotId: null };
    }
    handle(event) {
      if (event.type === "seed.set" || event.type === "world.reset") {
        this.state = { schema: "goose.crossing.relations/1", selected: [], knots: [], activeKnotId: null };
      }
      if (event.type === "note.attended") {
        const id = event.payload.id;
        const selected = this.state.selected.includes(id)
          ? this.state.selected.filter(item => item !== id)
          : [...this.state.selected.slice(-1), id];
        this.state = { ...this.state, selected };
      }
      if (event.type === "relation.tied") {
        this.state = { ...this.state, selected: [], knots: [...this.state.knots, event.payload.knot], activeKnotId: event.payload.knot.id };
      }
      if (event.type === "relation.activated") this.state = { ...this.state, activeKnotId: event.payload.knotId };
    }
    snapshot() { return this.state; }
    restore(state) { this.state = state; }
  }

  class BiomePrimitive {
    constructor() {
      this.id = "goose-crossing.biome";
      this.version = "1.0.0";
      this.role = "S3 biome checkpoint adapter";
      this.mode = ["adapter"];
      this.metadata = { stateSchema: "goose.crossing.biome-state/1", replayClaim: "seeded initialization plus snapshot restoration" };
      this.state = { schema: "goose.crossing.biome/1", knotId: null, telemetry: blankTelemetry(), snapshot: null, snapshotDigest: null, checkpointReason: null, goal: null };
    }
    handle(event) {
      if (event.type === "seed.set" || event.type === "world.reset" || event.type === "relation.tied") {
        this.state = { schema: "goose.crossing.biome/1", knotId: event.payload.knot?.id || null, telemetry: blankTelemetry(), snapshot: null, snapshotDigest: null, checkpointReason: null, goal: null };
      }
      if (event.type === "biome.telemetry") this.state = { ...this.state, knotId: event.payload.knotId, telemetry: event.payload.telemetry };
      if (event.type === "biome.checkpoint") this.state = { ...this.state, knotId: event.payload.knotId, snapshotDigest: event.payload.digest, checkpointReason: event.payload.reason };
      if (event.type === "goal.satisfied") this.state = { ...this.state, goal: { knotId: event.payload.knotId, target: event.payload.target, observed: event.payload.observed, event: event.sequence } };
    }
    snapshot() { return this.state; }
    restore(state) { this.state = state; }
  }

  const runtime = new S.CapsuleRuntime({
    id: "goose-crossing.local",
    shared: {
      integration: {
        packId: "sphera.engine-state.core",
        packRevision: 1,
        packManifestSha256: "c86d7ff395161c5bad50e0704be29f99fbe39a1b87acac277a5b995b0c281016",
        status: "extending"
      }
    }
  });
  const seedPrimitive = runtime.register(new SeedPrimitive());
  const fieldPrimitive = runtime.register(new FieldPrimitive());
  const biomePrimitive = runtime.register(new BiomePrimitive());

  let currentCapsule = null;
  let saveTimer = null;
  let saveChain = Promise.resolve();
  let biomeReady = false;
  let pendingAction = null;
  let lastTelemetryReceipt = 0;
  let lastCheckpointReceipt = 0;

  function say(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    window.setTimeout(() => els.toast.classList.remove("show"), 2400);
  }

  function layer(id) { return SOURCE_LAYERS.find(item => item.id === id); }
  function activeKnot() { return fieldPrimitive.state.knots.find(item => item.id === fieldPrimitive.state.activeKnotId) || null; }

  function deriveKnot(aId, bId) {
    const ordered = [layer(aId), layer(bId)].sort((a, b) => SOURCE_LAYERS.indexOf(a) - SOURCE_LAYERS.indexOf(b));
    const [a, b] = ordered;
    const masterSeed = seedPrimitive.state.value;
    const seed = `${masterSeed}|${a.id}:${b.id}|goose-crossing.local/1`;
    const hash = S.seedUint32(seed, "knot-signal");
    const interval = Math.abs(SOURCE_LAYERS.indexOf(b) - SOURCE_LAYERS.indexOf(a));
    const targetCondensate = +(0.28 + ((SOURCE_LAYERS.indexOf(a) + SOURCE_LAYERS.indexOf(b)) % 8) * 0.055).toFixed(3);
    return {
      id: `K-${String(fieldPrimitive.state.knots.length + 1).padStart(3, "0")}`,
      schema: "goose.crossing.knot/1",
      a: a.id,
      b: b.id,
      name: `${a.name}/${b.name} interval ${interval}`,
      pair: `${a.name} · ${a.note} ↔ ${b.name} · ${b.note}`,
      seed,
      seedTag: hash.toString(16).padStart(8, "0"),
      points: 8 + (hash % 17),
      coupling: +(0.24 + interval * 0.075).toFixed(3),
      axis: AXES[hash % AXES.length],
      color: b.color,
      targetCondensate,
      adapterVersion: "goose-crossing.local/1"
    };
  }

  function scheduleSave(delay = 120) {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveChain = saveChain.then(persistCapsule).catch(error => markSaveError(error));
    }, delay);
  }

  async function persistCapsule() {
    els.saveLabel.textContent = "SAVING LOCAL CAPSULE";
    els.saveState.classList.remove("ok");
    const capsule = await runtime.createCapsule({ label: "Goose Crossing local field", notes: "Sphera Field Station local adapter; no Sites runtime." });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capsule));
    currentCapsule = capsule;
    els.integrity.textContent = `${capsule.integrity.algorithm} verified`;
    els.capsuleId.textContent = `${capsule.id} · ${capsule.integrity.digest}`;
    els.saveLabel.textContent = "LOCAL CAPSULE VERIFIED";
    els.saveState.classList.add("ok");
    return capsule;
  }

  function markSaveError(error) {
    console.error(error);
    els.saveLabel.textContent = "LOCAL SAVE FAILED";
    els.saveState.classList.remove("ok");
    els.integrity.textContent = "save failed";
  }

  runtime.subscribe(message => {
    if (message.kind === "event") {
      render();
      scheduleSave();
    }
  });

  function renderNotes() {
    const selected = fieldPrimitive.state.selected;
    els.noteGrid.innerHTML = SOURCE_LAYERS.map(item => `
      <button class="note ${selected.includes(item.id) ? "selected" : ""}" data-note="${item.id}" style="--note:${item.color}">
        <strong>${item.name}</strong><span>${item.note} · ${item.frequency.toFixed(2)} Hz</span><small>${item.color}</small>
      </button>`).join("");
    els.noteGrid.querySelectorAll("[data-note]").forEach(button => button.addEventListener("click", () => attend(button.dataset.note)));
    const names = selected.map(id => layer(id).name);
    els.selection.textContent = names.length ? names.join(" + ") : "choose two notes";
    els.tie.disabled = selected.length !== 2;
  }

  function renderKnot() {
    const knot = activeKnot();
    els.emptyKnot.hidden = Boolean(knot);
    els.activeKnot.hidden = !knot;
    if (knot) {
      document.documentElement.style.setProperty("--signal", knot.color);
      els.knotId.textContent = knot.id;
      els.knotName.textContent = knot.name;
      els.knotPair.textContent = knot.pair;
      els.knotSeed.textContent = knot.seedTag;
      els.knotPoints.textContent = String(knot.points);
      els.knotCoupling.textContent = knot.coupling.toFixed(3);
      els.knotAxis.textContent = knot.axis;
      els.knotTarget.textContent = `φ ${knot.targetCondensate.toFixed(3)} ± .035`;
      els.targetCopy.textContent = `target ${knot.targetCondensate.toFixed(3)} ± .035`;
    }
    els.knotLedger.innerHTML = fieldPrimitive.state.knots.slice().reverse().map(item => `<li><code>${item.id}</code><b>${item.pair}</b><span>φ ${item.targetCondensate.toFixed(3)}</span></li>`).join("");
  }

  function renderBiome() {
    const knot = activeKnot();
    const telemetry = biomePrimitive.state.telemetry || blankTelemetry();
    els.condensate.textContent = Number.isFinite(telemetry.meanCondensate) ? telemetry.meanCondensate.toFixed(3) : "—";
    els.pressure.textContent = Number.isFinite(telemetry.meanPressure) ? telemetry.meanPressure.toFixed(3) : "—";
    els.pointCount.textContent = telemetry.points || "—";
    els.bonks.textContent = telemetry.bonks ?? "—";
    els.checkpoint.textContent = biomePrimitive.state.snapshotDigest ? `${biomePrimitive.state.checkpointReason || "state"} · ${biomePrimitive.state.snapshotDigest.slice(0, 17)}…` : "waiting";
    const reached = knot && biomePrimitive.state.goal?.knotId === knot.id;
    els.goalRing.classList.toggle("reached", Boolean(reached));
    els.actionStep.className = reached ? "done" : "active";
    els.receiptStep.className = reached ? "active" : "";
    els.receiptStep.textContent = reached ? "3 · GOAL RECEIPT RETURNED" : "3 · RETURN RECEIPT";
  }

  function renderReceipts() {
    const events = runtime.journal.events.slice(-30).reverse();
    els.receiptList.innerHTML = events.length ? events.map((event, index) => {
      const payload = Object.entries(event.payload || {}).filter(([, value]) => typeof value !== "object").map(([key, value]) => `${key} ${value}`).join(" · ");
      return `<div class="receipt ${index === 0 ? "latest" : ""}"><code>${String(event.sequence).padStart(3, "0")}</code><b>${event.type}</b><span>${payload || event.source} · ${event.hash.slice(0, 15)}…</span></div>`;
    }).join("") : "<p>No receipts yet.</p>";
  }

  function render() {
    els.seedInput.value = seedPrimitive.state.value;
    renderNotes();
    renderKnot();
    renderBiome();
    renderReceipts();
    if (currentCapsule) {
      els.integrity.textContent = `${currentCapsule.integrity.algorithm} verified`;
      els.capsuleId.textContent = `${currentCapsule.id} · ${currentCapsule.integrity.digest}`;
    }
  }

  async function attend(id) {
    await runtime.dispatch("note.attended", { id }, "goose-crossing.local");
  }

  async function tieRelation() {
    if (fieldPrimitive.state.selected.length !== 2) return;
    const [a, b] = fieldPrimitive.state.selected;
    const pairKey = [a, b].sort().join(":");
    const existing = fieldPrimitive.state.knots.find(knot => [knot.a, knot.b].sort().join(":") === pairKey);
    if (existing) {
      await runtime.dispatch("relation.activated", { knotId: existing.id }, "goose-crossing.local");
      say(`${existing.id} already holds; activated.`);
      return;
    }
    const knot = deriveKnot(a, b);
    await runtime.dispatch("relation.tied", { knot }, "goose-crossing.local");
    say(`${knot.id} tied from ${knot.pair}.`);
  }

  function postBiome(type, payload) {
    if (!biomeReady || !els.biomeFrame.contentWindow) return;
    els.biomeFrame.contentWindow.postMessage({ schema: "sphera.biome/command.1", type, payload }, location.origin);
  }

  function seedBiome() {
    const knot = activeKnot();
    if (!knot) return;
    const retained = biomePrimitive.state.knotId === knot.id ? biomePrimitive.state.snapshot : null;
    postBiome("seed", {
      seed: knot.seed,
      knots: fieldPrimitive.state.knots.length,
      binding: knot,
      state: retained
    });
  }

  async function openBiome() {
    if (!activeKnot()) return;
    els.biomePanel.hidden = false;
    if (els.biomeFrame.getAttribute("src") === "about:blank") {
      biomeReady = false;
      els.biomeFrame.src = "./bink-bonk-s3-local.html";
    } else if (biomeReady) seedBiome();
    els.biomePanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function requestAction(action) {
    const knot = activeKnot();
    if (!knot || !biomeReady) return;
    const before = biomePrimitive.state.telemetry?.meanCondensate;
    pendingAction = { action, before: Number.isFinite(before) ? before : null, at: performance.now(), knotId: knot.id };
    await runtime.dispatch("biome.action-requested", { action, knotId: knot.id, before: pendingAction.before }, "goose-crossing.local");
    postBiome("action", { action });
  }

  async function receiveBiome(event) {
    if (event.origin !== location.origin || event.source !== els.biomeFrame.contentWindow) return;
    const message = event.data;
    if (!message || message.schema !== "sphera.biome/event.1") return;
    const knot = activeKnot();
    if (message.type === "biome.ready") {
      biomeReady = true;
      seedBiome();
      await runtime.dispatch("biome.ready", { knotId: knot?.id || null, version: message.payload?.version || "unknown" }, "bink-bonk-s3.local");
      return;
    }
    if (message.type === "biome.state" && message.payload?.state) {
      const digest = await S.digest(message.payload.state);
      biomePrimitive.state = { ...biomePrimitive.state, knotId: knot?.id || null, snapshot: message.payload.state, snapshotDigest: digest, checkpointReason: message.payload.reason || "state" };
      const now = Date.now();
      const meaningful = message.payload.reason !== "interval" || now - lastCheckpointReceipt > 12000;
      if (meaningful) {
        lastCheckpointReceipt = now;
        await runtime.dispatch("biome.checkpoint", { knotId: knot?.id || null, reason: message.payload.reason || "state", digest }, "bink-bonk-s3.local");
      } else {
        renderBiome();
        scheduleSave(250);
      }
      return;
    }
    if (message.type === "biome.telemetry") {
      const telemetry = message.payload || blankTelemetry();
      biomePrimitive.state = { ...biomePrimitive.state, knotId: knot?.id || null, telemetry };
      renderBiome();
      const now = Date.now();
      if (now - lastTelemetryReceipt > 5000) {
        lastTelemetryReceipt = now;
        await runtime.dispatch("biome.telemetry", { knotId: knot?.id || null, telemetry }, "bink-bonk-s3.local");
      }
      if (pendingAction && performance.now() - pendingAction.at > 450 && Number.isFinite(telemetry.meanCondensate)) {
        const action = pendingAction;
        pendingAction = null;
        const after = telemetry.meanCondensate;
        await runtime.dispatch("biome.consequence", { action: action.action, knotId: action.knotId, before: action.before, after, delta: action.before === null ? null : +(after - action.before).toFixed(3) }, "bink-bonk-s3.local");
      }
      const actedOnKnot = knot && runtime.journal.events.some(event => event.type === "biome.action-requested" && event.payload.knotId === knot.id);
      if (actedOnKnot && Math.abs(telemetry.meanCondensate - knot.targetCondensate) <= 0.035 && biomePrimitive.state.goal?.knotId !== knot.id) {
        await runtime.dispatch("goal.satisfied", { knotId: knot.id, target: knot.targetCondensate, observed: telemetry.meanCondensate, tolerance: 0.035 }, "goose-crossing.local");
        say(`${knot.id} reached its condensate band.`);
      }
      scheduleSave(500);
      return;
    }
    if (["biome.honk", "biome.cool", "biome.pulse", "biome.ping", "biome.quawaternion", "biome.found"].includes(message.type)) {
      const payload = {};
      Object.entries(message.payload || {}).forEach(([key, value]) => { if (["string", "number", "boolean"].includes(typeof value)) payload[key] = value; });
      await runtime.dispatch(message.type, payload, "bink-bonk-s3.local");
    }
  }

  async function exportCapsule() {
    await persistCapsule();
    const json = await S.encodeCapsule(currentCapsule, { pretty: true });
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `goose-crossing-${seedPrimitive.state.value.replace(/[^a-z0-9_-]+/gi, "-")}.sphera-session.json`;
    link.click();
    URL.revokeObjectURL(url);
    say("Verified local capsule exported.");
  }

  async function importCapsule(file) {
    try {
      const capsule = await S.decodeCapsule(await file.text());
      await runtime.verifyCapsule(capsule);
      await runtime.restoreCapsule(capsule);
      currentCapsule = capsule;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(capsule));
      render();
      if (biomeReady) seedBiome();
      say("Capsule verified and restored.");
    } catch (error) {
      console.error(error);
      say(`Import rejected: ${error.message}`);
    } finally {
      els.importFile.value = "";
    }
  }

  async function setSeed(seed) {
    const value = String(seed || "").trim();
    if (!value) return;
    biomeReady = false;
    els.biomeFrame.src = "about:blank";
    els.biomePanel.hidden = true;
    await runtime.dispatch("seed.set", { seed: value }, "goose-crossing.local");
    say(`New seeded world: ${value}`);
  }

  async function initialize() {
    els.noteGrid.addEventListener("click", event => event.preventDefault());
    els.tie.addEventListener("click", tieRelation);
    els.openBiome.addEventListener("click", openBiome);
    els.foldBiome.addEventListener("click", () => {
      postBiome("action", { action: "checkpoint" });
      window.setTimeout(() => { biomeReady = false; els.biomeFrame.src = "about:blank"; els.biomePanel.hidden = true; }, 250);
    });
    document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => requestAction(button.dataset.action)));
    els.exportButton.addEventListener("click", exportCapsule);
    els.importButton.addEventListener("click", () => els.importFile.click());
    els.importFile.addEventListener("change", () => els.importFile.files?.[0] && importCapsule(els.importFile.files[0]));
    els.seedButton.addEventListener("click", () => setSeed(els.seedInput.value));
    els.resetButton.addEventListener("click", async () => {
      if (!window.confirm("Clear the current local relations and biome checkpoint while preserving an auditable reset receipt?")) return;
      biomeReady = false;
      els.biomeFrame.src = "about:blank";
      els.biomePanel.hidden = true;
      await runtime.dispatch("world.reset", { seed: seedPrimitive.state.value }, "goose-crossing.local");
      say("Local world reset; prior journal receipts remain.");
    });
    window.addEventListener("message", receiveBiome);

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const capsule = JSON.parse(saved);
        await runtime.verifyCapsule(capsule);
        await runtime.restoreCapsule(capsule);
        currentCapsule = capsule;
        els.saveLabel.textContent = "LOCAL CAPSULE VERIFIED";
        els.saveState.classList.add("ok");
      } catch (error) {
        console.error(error);
        els.saveLabel.textContent = "SAVED CAPSULE REJECTED";
        els.integrity.textContent = "stored capsule failed verification";
        await runtime.dispatch("runtime.started", { restored: false, reason: "stored capsule rejected" }, "goose-crossing.local");
      }
    } else {
      await runtime.dispatch("runtime.started", { restored: false, reason: "new local session" }, "goose-crossing.local");
    }
    render();
    await persistCapsule();
  }

  initialize().catch(error => {
    console.error(error);
    markSaveError(error);
  });
})();
