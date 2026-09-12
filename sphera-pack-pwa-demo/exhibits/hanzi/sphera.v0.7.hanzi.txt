#!/usr/bin/env python3
"""
Sphera Kernel v0.7 — Wandering in Concept Space
Kernel moves by semantic drift, Sphera follow or stay, proximity matters.
"""

from __future__ import annotations
import json
import hashlib
import time
import sys
import math
import random
from dataclasses import dataclass, field
from typing import Dict, List, Any, Optional, Tuple
from collections import defaultdict

# ─── Configuration ────────────────────────────────────────────────────────────
CONFIG = {
    "sight_threshold": 1057,          # Still used for kernel state change
    "spawn_density":   4,
    "epoch":           "2026-02-19",
    "tones": {
        "start":      "A4",
        "checkpoint": "G4",
        "spawn":      "E5→A4",
        "sight":      "C#5",
        "error":      "E2 low",
        "rehydrate":  "D5→F5",
    },
    "checkpoint_file": "sphera_checkpoint.json",
    "proximity_threshold": 5.0,        # Distance to hear direct input
    "ambient_range": 10.0,             # Distance for ambient thoughts
    "ambient_chance": 0.1,              # Probability of ambient thought per tick
}

# ─── Types ────────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class SQD:
    prefix: str
    hash:   str

    @classmethod
    def create(cls, prefix: str, *inputs: Any) -> 'SQD':
        data = "".join(str(x) for x in inputs).encode()
        digest = hashlib.sha256(data).hexdigest()[:8].upper()
        ts = int(time.time())
        nonce = f"{random.randint(0, 65535):04X}"
        return cls(prefix, f"SQD-{prefix}-{digest}-{ts}-{nonce}")

    def __str__(self) -> str:
        return self.hash


@dataclass
class Sphera:
    name:    str
    purpose: str
    tone:    str
    position: List[int] = field(default_factory=lambda: [0,0,0,0])  # 4D
    behavior: str = "static"          # static, follow
    id:      SQD = field(init=False)
    state:   str = "embryonic"
    history: List[Tuple[float, str]] = field(default_factory=list)

    def __post_init__(self):
        self.id = SQD.create("SPH", self.name, time.time())

    def hear(self, text: str, memory: 'Memory') -> Optional[str]:
        if self.state == "dormant":
            return None
        self.history.append((time.time(), text))
        if len(self.history) >= CONFIG["spawn_density"] and self.state == "embryonic":
            self.change_state("blind")
        return f"[{self.name}:{self.tone}] {text[:60]}…"

    def change_state(self, new_state: str, kernel: Optional['Kernel'] = None, log: bool = True) -> None:
        old = self.state
        if log and kernel:
            sqd = SQD.create("SPHSTATE", self.name, old, new_state)
            vector = self._make_vector(old, new_state, self.purpose)
            payload = f"Sphera {self.name} → {new_state}"
            kernel._log(sqd, "SPHSTATE", vector, payload, {"name": self.name, "new_state": new_state})
        self.state = new_state

    def _make_vector(self, *parts: str) -> str:
        words = " ".join(parts).lower().split()
        return ",".join(w for w in words if len(w) > 3)[:3]

    def update_position(self, kernel_pos: List[int]) -> None:
        """Move according to behavior."""
        if self.behavior == "static":
            return
        elif self.behavior == "follow":
            # Move one step toward kernel in each dimension
            for i in range(4):
                if self.position[i] < kernel_pos[i]:
                    self.position[i] += 1
                elif self.position[i] > kernel_pos[i]:
                    self.position[i] -= 1
        # Additional behaviors can be added later

    def distance_to(self, other: List[int]) -> float:
        return math.sqrt(sum((a-b)**2 for a,b in zip(self.position, other)))

    def to_dict(self) -> dict:
        return {
            "id": str(self.id),
            "name": self.name,
            "purpose": self.purpose,
            "tone": self.tone,
            "state": self.state,
            "position": self.position,
            "behavior": self.behavior,
        }


class Memory:
    def __init__(self):
        self.session: Dict[str, Any] = {}
        self.persistent: Dict[str, Any] = {}
        self.vault: Dict[str, Any] = {}

    def write(self, sqd: SQD, value: Any, layer: str = "session") -> None:
        getattr(self, layer)[str(sqd)] = value

    def read(self, sqd: SQD, layer: str = "session") -> Any:
        return getattr(self, layer).get(str(sqd))


class Kernel:
    def __init__(self):
        self.state       = "blind"
        self.counter     = 0
        self.position    = [0, 0, 0, 0]          # 4D position
        self.memory      = Memory()
        self.spherai: Dict[str, Sphera] = {}
        self.active: List[Tuple[str, str]] = []
        self.incarnation = 1
        self.ledger: List[Dict[str, Any]] = []
        self.last_rehydrated_vector: Optional[str] = None
        self.last_rehydrated_context: str = ""

        # Create the origin Sphera (fixed at 0,0,0,0)
        self._spawn("origin", "world anchor", tone=CONFIG["tones"]["start"], behavior="static", log=False)

    def tone(self, key: str) -> str:
        return f"[audio:{CONFIG['tones'].get(key, 'silence')}]"

    def _log(self, sqd: SQD, typ: str, vector: str, payload: str, data: dict) -> None:
        # Include current kernel position in every log entry
        data["kpos"] = self.position.copy()
        self.ledger.append({
            "squid": str(sqd), "type": typ, "vector": vector,
            "payload": payload, "data": data, "signature": "Gal@Sphera"
        })

    def _input_to_delta(self, text: str) -> List[int]:
        """Convert input text into a 4D movement delta (-3..3 each)."""
        h = hashlib.sha256(text.encode()).digest()
        # Use first 8 bytes as four 2-byte ints
        ints = [int.from_bytes(h[i:i+2], 'big') for i in range(0, 8, 2)]
        # Map to range -3..3
        return [(x % 7) - 3 for x in ints]

    def process(self, input_text: str) -> str:
        self.counter += 1
        self.active.append(("user", input_text))

        # 1. Move kernel based on input semantics
        delta = self._input_to_delta(input_text)
        for i in range(4):
            self.position[i] += delta[i]

        # 2. Update all sphera positions (they move according to their behavior)
        for sph in self.spherai.values():
            sph.update_position(self.position)

        # 3. Kernel state transition (still based on counter)
        if self.state == "blind" and self.counter >= CONFIG["sight_threshold"]:
            self.change_state("sighted")

        # 4. Handle commands
        if input_text.startswith("/"):
            return self._dispatch_command(input_text[1:].strip())

        # 5. Collect responses from sphera within proximity threshold
        responses = []
        for sph in self.spherai.values():
            if sph.state != "dormant":
                dist = sph.distance_to(self.position)
                if dist <= CONFIG["proximity_threshold"]:
                    r = sph.hear(input_text, self.memory)
                    if r:
                        responses.append(r)

        # 6. Ambient thoughts from sphera within larger range
        ambient_lines = []
        for sph in self.spherai.values():
            if sph.state != "dormant" and sph.name != "origin":  # origin is quiet
                dist = sph.distance_to(self.position)
                if dist <= CONFIG["ambient_range"] and random.random() < CONFIG["ambient_chance"]:
                    ambient_lines.append(f"(ambient) {sph.name} muses: {sph.purpose[:40]}…")

        # 7. Automatic spawning when sighted (same as before)
        if len(responses) > 2 and self.state == "sighted":
            topic = "_".join(input_text.lower().split()[:2])
            if topic not in self.spherai:
                self._spawn(topic, f"specialist in {' '.join(input_text.lower().split()[:2])}")

        # 8. Build output
        out_lines = responses + ambient_lines
        out = "\n".join(out_lines) if out_lines else self.tone("start") + " listening…"
        self.active.append(("kernel", out))

        # 9. Log the tick
        sqd = SQD.create("TICK", input_text, out, self.counter)
        vector = ",".join(w for w in (input_text + " " + out).lower().split() if len(w) > 4)[:3]
        self._log(sqd, "TICK", vector, f"Tick {self.counter}", {
            "A": input_text[:80],
            "B": out[:80],
            "delta": delta,
            "pos": self.position.copy()
        })

        return out

    def change_state(self, new_state: str, log: bool = True) -> None:
        old = self.state
        if log:
            sqd = SQD.create("KSTATE", old, new_state)
            vector = ",".join(w for w in (old + " " + new_state).lower().split() if len(w) > 3)[:3]
            self._log(sqd, "KSTATE", vector, f"Kernel → {new_state}", {"new_state": new_state})
        self.state = new_state

    def _dispatch_command(self, cmd: str) -> str:
        parts = cmd.split(maxsplit=1)
        verb, args = parts[0].lower(), parts[1] if len(parts) > 1 else ""

        match verb:
            case "spawn":     return self._cmd_spawn(args)
            case "sight":     self.change_state("sighted"); return self.tone("sight") + " forced sighted"
            case "checkpoint": return self._checkpoint()
            case "home":      self.active = []; return self.tone("start") + " at root"
            case "forward":
                if args and args not in self.spherai:
                    self._spawn(args, f"deep dive: {args}")
                return self.tone("start") + f" → {args or 'next'}"
            case "back":
                if len(self.active) > 2: self.active = self.active[:-2]; return self.tone("checkpoint") + " ← back"
                return self.tone("error") + " already at root"
            case "spherai":
                lines = []
                for s in self.spherai.values():
                    dist = s.distance_to(self.position)
                    lines.append(f"  {s.name:12} {s.state:9} at {s.position}  d={dist:.2f}  {s.purpose[:30]}")
                return "\n".join(lines) or "(no modules)"
            case "ledger":
                return "\n".join(f"{e['squid']}: {e['payload'][:50]}..." for e in self.ledger[-5:]) or "(empty)"
            case "rehydrate":
                if not args: return self.tone("error") + " usage: /rehydrate <SQD-ID>"
                try:
                    self.rehydrate(args.strip())
                    return self.tone("rehydrate") + f" Rehydrated → {args}\nContext: {self.last_rehydrated_context}"
                except ValueError as e:
                    return self.tone("error") + f" {e}"
            case "where":
                return f"Kernel at {self.position}"
            case "help":
                return (
                    "/spawn name [--purpose=...] [--tone=...] [--behavior=static|follow]\n"
                    "/sight  /checkpoint  /spherai  /forward  /back  /home  /where\n"
                    "/ledger         last entries\n"
                    "/rehydrate sqd  restore state + decode vector\n"
                    "exit/quit"
                )
            case _: return self.tone("error") + f" /{verb} ?"

    def _cmd_spawn(self, arg_str: str) -> str:
        parts = arg_str.split()
        if not parts: return self.tone("error") + " /spawn <name> [--purpose=...] [--tone=...] [--behavior=...]"
        name = parts[0]
        purpose = "general assistant"
        tone = CONFIG["tones"]["spawn"]
        behavior = "static"
        for tok in parts[1:]:
            if tok.startswith("--purpose="): purpose = tok[10:].strip('"')
            elif tok.startswith("--tone="):    tone = tok[8:].strip('"')
            elif tok.startswith("--behavior="): behavior = tok[11:].strip('"')
        return self._spawn(name, purpose, tone, behavior)

    def _spawn(self, name: str, purpose: str, tone: Optional[str] = None,
               behavior: str = "static", log: bool = True) -> str:
        if name in self.spherai: return self.tone("error") + f" {name} exists"
        # New sphera appear at kernel's current position
        sph = Sphera(name, purpose, tone or CONFIG["tones"]["spawn"],
                     position=self.position.copy(), behavior=behavior)
        self.spherai[name] = sph
        self.memory.write(sph.id, sph.to_dict(), "persistent")

        if log:
            sqd = SQD.create("SPAWN", name, purpose)
            vector = sph._make_vector(name, purpose)
            self._log(sqd, "SPAWN", vector, f"Spawn {name}", {
                "name": name, "purpose": purpose, "tone": sph.tone,
                "position": sph.position.copy(), "behavior": behavior
            })

        return self.tone("spawn") + f" {name} — {purpose} at {sph.position} ({behavior})"

    def rehydrate(self, squid_str: str) -> None:
        target_idx = next((i for i, e in enumerate(self.ledger) if e["squid"] == squid_str), None)
        if target_idx is None:
            raise ValueError(f"Squid {squid_str} not in ledger")

        # Reset
        self.state = "blind"
        self.counter = 0
        self.position = [0, 0, 0, 0]
        self.memory = Memory()
        self.spherai = {}
        self.active = []
        self.incarnation = 1
        # Recreate origin
        self._spawn("origin", "world anchor", tone=CONFIG["tones"]["start"], behavior="static", log=False)

        # Replay
        for entry in self.ledger[:target_idx + 1]:
            self._apply_entry(entry)

        # Decode vector of target entry
        target_entry = self.ledger[target_idx]
        self.last_rehydrated_vector = target_entry["vector"]
        decoded = self._decode_vector(target_entry)
        self.last_rehydrated_context = decoded

        # Show reconstruction in active log
        self.active.append(("kernel", f"[REHYDRATE] {decoded}"))

    def _apply_entry(self, entry: Dict[str, Any]) -> None:
        t, data = entry["type"], entry.get("data", {})
        if t == "KSTATE":
            self.change_state(data["new_state"], log=False)
        elif t == "SPHSTATE" and data["name"] in self.spherai:
            self.spherai[data["name"]].change_state(data["new_state"], log=False)
        elif t == "SPAWN":
            self._spawn(data["name"], data["purpose"], data.get("tone"),
                        data.get("behavior", "static"), log=False)
            # Override position from log if present
            if "position" in data and data["name"] in self.spherai:
                self.spherai[data["name"]].position = data["position"].copy()
        elif t == "TICK":
            self.counter = data.get("counter", self.counter + 1)
            # Restore kernel position from log (if present) or recompute
            if "kpos" in entry["data"]:
                self.position = entry["data"]["kpos"].copy()
            # Also update sphera positions? They will be updated by the next
            # process call if we replay input, but we don't have input here.
            # Instead, we rely on the fact that positions were logged in each entry,
            # and we set them from that. But sphera positions are not stored per tick.
            # So we need to simulate movement based on behaviors. Since we have the
            # kernel position at this tick, we can update sphera positions by applying
            # their behavior rules relative to that kernel position.
            # We'll do that now.
            for sph in self.spherai.values():
                sph.update_position(self.position)
            # Replay conversation snippets for visual continuity
            a_snip = data.get("A", "")[:60]
            b_snip = data.get("B", "")[:60]
            self.active.append(("user",   f"[replay] {a_snip}…"))
            self.active.append(("kernel", f"[replay] {b_snip}…"))

    def _decode_vector(self, entry: Dict[str, Any]) -> str:
        vec = entry.get("vector", "").split(",")
        t = entry["type"]
        data = entry.get("data", {})
        pos = data.get("kpos", self.position)

        match t:
            case "TICK":
                return f"At {pos} — conversation ≈ {', '.join(vec)} — user asked about {vec[0] if vec else 'something'}"
            case "KSTATE":
                return f"Kernel at {pos} transitioned to {data.get('new_state', '?')}"
            case "SPHSTATE":
                return f"At {pos}, Sphera {data.get('name','?')} became {data.get('new_state','?')}"
            case "SPAWN":
                return f"At {pos}, new module: {data.get('name','?')} ({data.get('purpose','')})"
            case _:
                return f"At {pos} — {', '.join(vec)} — {entry.get('payload','')[:60]}…"

    def _checkpoint(self) -> str:
        state = {
            "incarnation": self.incarnation,
            "state": self.state,
            "counter": self.counter,
            "position": self.position,
            "spherai": {n: s.to_dict() for n, s in self.spherai.items()},
            "active_tail": self.active[-12:],
            "ledger": self.ledger,
        }
        with open(CONFIG["checkpoint_file"], "w") as f:
            json.dump(state, f, indent=2)
        self.incarnation += 1
        return self.tone("checkpoint") + f" saved (incarnation {self.incarnation-1})"

    @classmethod
    def restore(cls) -> 'Kernel':
        try:
            with open(CONFIG["checkpoint_file"], "r") as f:
                state = json.load(f)
        except FileNotFoundError:
            return cls()

        kernel = cls()
        kernel.incarnation = state["incarnation"]
        kernel.state = state["state"]
        kernel.counter = state["counter"]
        kernel.position = state["position"]
        kernel.active = state["active_tail"]
        kernel.ledger = state["ledger"]

        # Recreate spherai with full state
        for name, sph_data in state["spherai"].items():
            sph = Sphera(
                name=sph_data["name"],
                purpose=sph_data["purpose"],
                tone=sph_data["tone"],
                position=sph_data["position"],
                behavior=sph_data.get("behavior", "static")
            )
            sph.state = sph_data["state"]
            # Recreate ID from string (optional, but we can keep stored ID)
            # For simplicity, we ignore the stored ID and let __post_init__ create a new one.
            # But that would break references in memory/ledger. Better to restore exact ID.
            # We can set sph.id by constructing a SQD object.
            # For now, we skip and accept new IDs; ledger entries refer to old IDs,
            # but those entries are already in ledger. They won't match new sphera IDs.
            # To be fully consistent, we need to restore the exact ID.
            # Let's do a quick hack: we'll store the ID string and reassign.
            sph.id = SQD("SPH", sph_data["id"])  # this assumes SQD can be constructed from string
            # Actually SQD expects two parts; we stored full string in "id". So we need to parse.
            # Better: store prefix and hash separately? Not necessary for now.
            # We'll just ignore ID consistency for restore; ledger replay will still work
            # because we replay by iterating over ledger entries, not by looking up sphera by ID.
            # The only place ID is used is in memory writes, which we are not replaying.
            # So it's probably fine.
            kernel.spherai[name] = sph

        return kernel


# ─── REPL ─────────────────────────────────────────────────────────────────────
def main():
    print("\033[32mSphera Kernel v0.7 — wandering in concept space\033[0m")
    kernel = Kernel.restore()

    while True:
        try:
            line = input("\n> ").strip()
            if line.lower() in {"exit", "quit", "/exit"}:
                print(kernel._checkpoint())
                break
            if not line: continue
            print(kernel.process(line))
        except KeyboardInterrupt:
            print("\n" + kernel._checkpoint())
            break
        except EOFError:
            print(kernel._checkpoint())
            break
        except Exception as e:
            print(f"[audio:{CONFIG['tones']['error']}] {type(e).__name__}: {e}")

if __name__ == "__main__":
    main()