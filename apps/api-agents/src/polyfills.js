// workerd polyfills for the Cardano WASM glue (lucid-cardano/web build).
// Must be imported BEFORE lucid-cardano — module evaluation order matters.
if (typeof globalThis.FinalizationRegistry === "undefined") {
  globalThis.FinalizationRegistry = class {
    constructor(cleanup) { this._cleanup = cleanup; this._tokens = new Set(); }
    register(target, token) { this._tokens.add(token); }
    unregister(token) { this._tokens.delete(token); return true; }
    cleanup() {}
  };
}
if (typeof globalThis.WeakRef === "undefined") {
  globalThis.WeakRef = class { constructor(t) { this._t = t; } deref() { return this._t; } };
}
