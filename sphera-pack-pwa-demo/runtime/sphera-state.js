(function (root, factory) {
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.SpheraState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const RUNTIME_VERSION = "0.1.0";
  const EVENT_SCHEMA = "sphera.event/1";
  const JOURNAL_SCHEMA = "sphera.journal/1";
  const PRIMITIVE_SCHEMA = "sphera.primitive-state/1";
  const SESSION_SCHEMA = "sphera.session/1";
  const MODES = new Set(["pipeline", "concurrent", "host", "adapter", "infrastructure"]);

  class ContractError extends Error {
    constructor(message, details) {
      super(message);
      this.name = "ContractError";
      this.details = details || null;
    }
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  function base64ToBytes(value) {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(value, "base64"));
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function toPortable(value, seen) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return { $type: "Number", value: String(value) };
      return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value === "bigint") return { $type: "BigInt", value: value.toString() };
    if (typeof value === "undefined") return { $type: "Undefined" };
    if (typeof value === "function" || typeof value === "symbol") {
      throw new ContractError(`State contains a non-portable ${typeof value}.`);
    }

    const active = seen || new WeakSet();
    if (active.has(value)) throw new ContractError("State contains a circular reference.");
    active.add(value);
    let result;

    if (value instanceof Date) {
      result = { $type: "Date", value: value.toISOString() };
    } else if (value instanceof ArrayBuffer) {
      result = { $type: "ArrayBuffer", encoding: "base64", data: bytesToBase64(new Uint8Array(value)) };
    } else if (ArrayBuffer.isView(value)) {
      const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      result = { $type: value.constructor.name, encoding: "base64", data: bytesToBase64(bytes) };
    } else if (value instanceof Map) {
      result = {
        $type: "Map",
        entries: [...value.entries()]
          .map(([key, item]) => [toPortable(key, active), toPortable(item, active)])
          .sort((a, b) => JSON.stringify(a[0]).localeCompare(JSON.stringify(b[0])))
      };
    } else if (value instanceof Set) {
      result = { $type: "Set", values: [...value].map(item => toPortable(item, active)) };
    } else if (Array.isArray(value)) {
      result = value.map(item => toPortable(item, active));
    } else {
      result = {};
      Object.keys(value).sort().forEach(key => {
        result[key] = toPortable(value[key], active);
      });
    }

    active.delete(value);
    return result;
  }

  function fromPortable(value) {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(fromPortable);
    if (value.$type === "Undefined") return undefined;
    if (value.$type === "BigInt") return BigInt(value.value);
    if (value.$type === "Number") return Number(value.value);
    if (value.$type === "Date") return new Date(value.value);
    if (value.$type === "Map") return new Map(value.entries.map(([key, item]) => [fromPortable(key), fromPortable(item)]));
    if (value.$type === "Set") return new Set(value.values.map(fromPortable));
    if (value.encoding === "base64" && value.$type) {
      const bytes = base64ToBytes(value.data);
      if (value.$type === "ArrayBuffer") return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const Constructor = root[value.$type];
      if (typeof Constructor === "function" && Constructor.BYTES_PER_ELEMENT) {
        const aligned = bytes.byteOffset % Constructor.BYTES_PER_ELEMENT === 0
          ? bytes
          : new Uint8Array(bytes);
        return new Constructor(aligned.buffer.slice(aligned.byteOffset, aligned.byteOffset + aligned.byteLength));
      }
    }
    const result = {};
    Object.keys(value).forEach(key => { result[key] = fromPortable(value[key]); });
    return result;
  }

  function clone(value) {
    return fromPortable(toPortable(value));
  }

  function stableStringify(value, space) {
    return JSON.stringify(toPortable(value), null, space || 0);
  }

  function textBytes(value) {
    return new TextEncoder().encode(typeof value === "string" ? value : stableStringify(value));
  }

  function fallbackHash(bytes) {
    let hash = 0xcbf29ce484222325n;
    const prime = 0x100000001b3n;
    for (const byte of bytes) {
      hash ^= BigInt(byte);
      hash = BigInt.asUintN(64, hash * prime);
    }
    return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
  }

  async function digest(value) {
    const bytes = textBytes(value);
    if (root.crypto && root.crypto.subtle) {
      const buffer = await root.crypto.subtle.digest("SHA-256", bytes);
      return `sha256:${[...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
    }
    return fallbackHash(bytes);
  }

  function makeId(prefix) {
    const bytes = new Uint8Array(10);
    if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(bytes);
    else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return `${prefix}_${[...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  function seedUint32(seed, channel) {
    const text = `${String(seed)}|${String(channel || "root")}`;
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededUnit(seed, channel) {
    return seedUint32(seed, channel) / 0xffffffff;
  }

  function normalizeQuaternion(value) {
    if (!Array.isArray(value) && !ArrayBuffer.isView(value)) throw new ContractError("Quaternion must contain four numbers.");
    const q = Array.from(value, Number);
    if (q.length !== 4 || q.some(component => !Number.isFinite(component))) throw new ContractError("Quaternion must contain four finite numbers.");
    const magnitude = Math.hypot(q[0], q[1], q[2], q[3]);
    if (magnitude < 1e-12) return [0, 0, 0, 1];
    return q.map(component => component / magnitude);
  }

  function multiplyQuaternions(left, right) {
    const [ax, ay, az, aw] = normalizeQuaternion(left);
    const [bx, by, bz, bw] = normalizeQuaternion(right);
    return normalizeQuaternion([
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz
    ]);
  }

  function quaternionFromAxisAngle(axis, angle) {
    const vector = Array.from(axis || [], Number);
    if (vector.length !== 3 || vector.some(component => !Number.isFinite(component)) || !Number.isFinite(angle)) {
      throw new ContractError("Axis-angle rotation requires three finite axis components and a finite angle.");
    }
    const magnitude = Math.hypot(vector[0], vector[1], vector[2]);
    if (magnitude < 1e-12) return [0, 0, 0, 1];
    const half = angle / 2;
    const scale = Math.sin(half) / magnitude;
    return normalizeQuaternion([vector[0] * scale, vector[1] * scale, vector[2] * scale, Math.cos(half)]);
  }

  function rotateVectorByQuaternion(quaternion, vector) {
    const [x, y, z, w] = normalizeQuaternion(quaternion);
    const [vx, vy, vz] = Array.from(vector || [], Number);
    if (![vx, vy, vz].every(Number.isFinite)) throw new ContractError("Quaternion rotation requires a three-component vector.");
    const tx = 2 * (y * vz - z * vy);
    const ty = 2 * (z * vx - x * vz);
    const tz = 2 * (x * vy - y * vx);
    return [
      vx + w * tx + (y * tz - z * ty),
      vy + w * ty + (z * tx - x * tz),
      vz + w * tz + (x * ty - y * tx)
    ];
  }

  function quaternionFromSeed(seed) {
    const axis = [
      seededUnit(seed, "quaternion-x") * 2 - 1,
      seededUnit(seed, "quaternion-y") * 2 - 1,
      seededUnit(seed, "quaternion-z") * 2 - 1
    ];
    const angle = seededUnit(seed, "quaternion-angle") * Math.PI * 2;
    return quaternionFromAxisAngle(axis, angle);
  }

  function validateEvent(event) {
    if (!event || event.schema !== EVENT_SCHEMA) throw new ContractError("Not a sphera.event/1 event.");
    if (!Number.isInteger(event.sequence) || event.sequence < 1) throw new ContractError("Event sequence must be a positive integer.");
    if (!event.id || !event.source || !event.type || !event.hash) throw new ContractError("Event is missing identity fields.");
    if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) throw new ContractError("Event payload must be an object.");
    return true;
  }

  function validatePrimitiveEntry(entry) {
    if (!entry || entry.schema !== PRIMITIVE_SCHEMA) throw new ContractError("Invalid primitive state envelope.");
    if (!entry.id || !entry.version || !entry.role || !entry.digest) throw new ContractError("Primitive state is missing identity fields.");
    if (!Array.isArray(entry.mode) || !entry.mode.length || entry.mode.some(mode => !MODES.has(mode))) {
      throw new ContractError(`Primitive ${entry.id || "unknown"} has an invalid mode.`);
    }
    return true;
  }

  function validateCapsule(capsule) {
    if (!capsule || capsule.schema !== SESSION_SCHEMA || capsule.version !== 1) throw new ContractError("Not a sphera.session/1 capsule.");
    if (!capsule.id || !capsule.createdAt || !capsule.manifest || !capsule.integrity) throw new ContractError("Capsule is missing manifest fields.");
    if (!capsule.journal || capsule.journal.schema !== JOURNAL_SCHEMA || !Array.isArray(capsule.journal.events)) throw new ContractError("Capsule journal is invalid.");
    if (!Array.isArray(capsule.primitives)) throw new ContractError("Capsule primitive collection is invalid.");
    capsule.primitives.forEach(validatePrimitiveEntry);
    return true;
  }

  class EventJournal {
    constructor(options) {
      this.events = [];
      this.clock = options && options.clock ? options.clock : () => new Date().toISOString();
    }

    get headHash() {
      return this.events.length ? this.events[this.events.length - 1].hash : null;
    }

    async append(input) {
      if (!input || !input.source || !input.type) throw new ContractError("Journal append requires source and type.");
      const body = {
        schema: EVENT_SCHEMA,
        id: input.id || makeId("evt"),
        sequence: this.events.length + 1,
        timestamp: input.timestamp || this.clock(),
        source: input.source,
        type: input.type,
        payload: clone(input.payload || {}),
        previousHash: this.headHash
      };
      const event = { ...body, hash: await digest(body) };
      validateEvent(event);
      this.events.push(event);
      return clone(event);
    }

    snapshot() {
      return { schema: JOURNAL_SCHEMA, events: clone(this.events), headHash: this.headHash };
    }

    async verify(snapshot) {
      const journal = snapshot || this.snapshot();
      let previousHash = null;
      for (let index = 0; index < journal.events.length; index++) {
        const event = journal.events[index];
        validateEvent(event);
        if (event.sequence !== index + 1) throw new ContractError(`Journal sequence breaks at event ${index + 1}.`);
        if (event.previousHash !== previousHash) throw new ContractError(`Journal lineage breaks at event ${event.sequence}.`);
        const { hash, ...body } = event;
        if (await digest(body) !== hash) throw new ContractError(`Journal digest fails at event ${event.sequence}.`);
        previousHash = hash;
      }
      if (journal.headHash !== previousHash) throw new ContractError("Journal head does not match its event chain.");
      return true;
    }

    async restore(snapshot) {
      if (!snapshot || snapshot.schema !== JOURNAL_SCHEMA || !Array.isArray(snapshot.events)) throw new ContractError("Invalid journal snapshot.");
      await this.verify(snapshot);
      this.events = clone(snapshot.events);
      return this.snapshot();
    }

    clear() {
      this.events = [];
    }
  }

  class CapsuleRuntime {
    constructor(options) {
      const config = options || {};
      this.id = config.id || makeId("runtime");
      this.shared = clone(config.shared || {});
      this.journal = new EventJournal({ clock: config.clock });
      this.primitives = new Map();
      this.listeners = new Set();
    }

    register(primitive) {
      if (!primitive || !primitive.id || !primitive.version || !primitive.role) throw new ContractError("Primitive registration requires id, version, and role.");
      if (!Array.isArray(primitive.mode) || primitive.mode.some(mode => !MODES.has(mode))) throw new ContractError(`Primitive ${primitive.id} has an invalid mode.`);
      if (typeof primitive.snapshot !== "function" || typeof primitive.restore !== "function") throw new ContractError(`Primitive ${primitive.id} must implement snapshot() and restore().`);
      if (this.primitives.has(primitive.id)) throw new ContractError(`Primitive ${primitive.id} is already registered.`);
      this.primitives.set(primitive.id, primitive);
      return primitive;
    }

    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }

    notify(message) {
      this.listeners.forEach(listener => listener(message));
    }

    context() {
      return {
        runtime: this,
        shared: this.shared,
        journal: this.journal,
        dispatch: (type, payload, source) => this.dispatch(type, payload, source)
      };
    }

    async dispatch(type, payload, source) {
      const event = await this.journal.append({ source: source || "runtime", type, payload: payload || {} });
      for (const primitive of this.primitives.values()) {
        if (typeof primitive.handle === "function") await primitive.handle(event, this.context());
      }
      this.notify({ kind: "event", event });
      return event;
    }

    update(dt) {
      for (const primitive of this.primitives.values()) {
        if (typeof primitive.update === "function") primitive.update(dt, this.context());
      }
    }

    async primitiveSnapshots() {
      const snapshots = [];
      for (const primitive of this.primitives.values()) {
        const state = toPortable(await primitive.snapshot(this.context()));
        const identity = { id: primitive.id, version: primitive.version, state };
        snapshots.push({
          schema: PRIMITIVE_SCHEMA,
          id: primitive.id,
          version: primitive.version,
          role: primitive.role,
          mode: [...primitive.mode],
          state,
          digest: await digest(identity),
          metadata: clone(primitive.metadata || {})
        });
      }
      return snapshots;
    }

    async createCapsule(options) {
      const config = options || {};
      const primitives = await this.primitiveSnapshots();
      const capsule = {
        schema: SESSION_SCHEMA,
        version: 1,
        id: config.id || makeId("capsule"),
        createdAt: config.createdAt || new Date().toISOString(),
        label: config.label || "Sphera session",
        manifest: {
          runtimeVersion: RUNTIME_VERSION,
          primitiveOrder: primitives.map(entry => entry.id),
          journalHead: this.journal.headHash,
          notes: config.notes || ""
        },
        shared: toPortable(this.shared),
        journal: this.journal.snapshot(),
        primitives,
        integrity: { algorithm: "pending", digest: "pending" }
      };
      const unsigned = JSON.parse(stableStringify(capsule));
      delete unsigned.integrity;
      const capsuleDigest = await digest(unsigned);
      capsule.integrity = { algorithm: capsuleDigest.split(":")[0], digest: capsuleDigest };
      this.notify({ kind: "capsule", action: "created", capsule });
      return capsule;
    }

    async verifyCapsule(capsule) {
      validateCapsule(capsule);
      const unsigned = JSON.parse(stableStringify(capsule));
      delete unsigned.integrity;
      if (await digest(unsigned) !== capsule.integrity.digest) throw new ContractError("Capsule integrity digest does not match its contents.");
      await this.journal.verify(capsule.journal);
      for (const entry of capsule.primitives) {
        const expected = await digest({ id: entry.id, version: entry.version, state: entry.state });
        if (expected !== entry.digest) throw new ContractError(`Primitive digest failed for ${entry.id}.`);
      }
      return true;
    }

    async restoreCapsule(capsule) {
      const phases = [];
      phases.push({ phase: "validate", status: "running" });
      await this.verifyCapsule(capsule);
      phases[phases.length - 1].status = "complete";

      phases.push({ phase: "shared", status: "running" });
      this.shared = fromPortable(capsule.shared);
      phases[phases.length - 1].status = "complete";

      phases.push({ phase: "journal", status: "running" });
      await this.journal.restore(capsule.journal);
      phases[phases.length - 1].status = "complete";

      const entries = new Map(capsule.primitives.map(entry => [entry.id, entry]));
      const order = capsule.manifest.primitiveOrder || capsule.primitives.map(entry => entry.id);
      for (const id of order) {
        const entry = entries.get(id);
        const primitive = this.primitives.get(id);
        const phase = { phase: `primitive:${id}`, status: "running" };
        phases.push(phase);
        if (!primitive) {
          phase.status = "skipped";
          phase.reason = "not registered";
          continue;
        }
        let state = fromPortable(entry.state);
        if (entry.version !== primitive.version) {
          if (typeof primitive.migrate !== "function") throw new ContractError(`Primitive ${id} needs migration ${entry.version} -> ${primitive.version}.`);
          state = await primitive.migrate(state, entry.version, primitive.version);
          phase.migrated = `${entry.version} -> ${primitive.version}`;
        }
        await primitive.restore(state, this.context());
        phase.status = "complete";
      }

      phases.push({ phase: "resume", status: "complete" });
      this.notify({ kind: "capsule", action: "restored", capsule, phases });
      return phases;
    }

    dispose() {
      for (const primitive of this.primitives.values()) {
        if (typeof primitive.dispose === "function") primitive.dispose();
      }
      this.listeners.clear();
    }
  }

  async function gzip(value) {
    if (typeof root.CompressionStream !== "function") throw new ContractError("GZIP compression is not available in this runtime.");
    const input = value instanceof Uint8Array ? value : textBytes(value);
    const stream = new Blob([input]).stream().pipeThrough(new root.CompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function gunzip(value) {
    if (typeof root.DecompressionStream !== "function") throw new ContractError("GZIP decompression is not available in this runtime.");
    const input = value instanceof Uint8Array ? value : new Uint8Array(value);
    const stream = new Blob([input]).stream().pipeThrough(new root.DecompressionStream("gzip"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function encodeCapsule(capsule, options) {
    validateCapsule(capsule);
    const config = options || {};
    const json = stableStringify(capsule, config.pretty === false ? 0 : 2);
    return config.gzip ? gzip(json) : json;
  }

  async function decodeCapsule(value) {
    if (typeof value === "string") return JSON.parse(value);
    let bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = await gunzip(bytes);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  return {
    RUNTIME_VERSION,
    EVENT_SCHEMA,
    JOURNAL_SCHEMA,
    PRIMITIVE_SCHEMA,
    SESSION_SCHEMA,
    ContractError,
    EventJournal,
    CapsuleRuntime,
    toPortable,
    fromPortable,
    clone,
    stableStringify,
    digest,
    makeId,
    seedUint32,
    seededUnit,
    normalizeQuaternion,
    multiplyQuaternions,
    quaternionFromAxisAngle,
    rotateVectorByQuaternion,
    quaternionFromSeed,
    validateEvent,
    validatePrimitiveEntry,
    validateCapsule,
    gzip,
    gunzip,
    encodeCapsule,
    decodeCapsule
  };
});
