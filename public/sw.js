// Kalori service worker — build dev — generated 2026-05-20T07:18:19.741Z
var g = {
    googleAnalytics: 'googleAnalytics',
    precache: 'precache-v2',
    prefix: 'serwist',
    runtime: 'runtime',
    suffix: typeof registration < 'u' ? registration.scope : '',
  },
  J = (r) => [g.prefix, r, g.suffix].filter((e) => e && e.length > 0).join('-'),
  ze = (r) => {
    for (let e of Object.keys(g)) r(e);
  },
  m = {
    updateDetails: (r) => {
      ze((e) => {
        let t = r[e];
        typeof t == 'string' && (g[e] = t);
      });
    },
    getGoogleAnalyticsName: (r) => r || J(g.googleAnalytics),
    getPrecacheName: (r) => r || J(g.precache),
    getPrefix: () => g.prefix,
    getRuntimeName: (r) => r || J(g.runtime),
    getSuffix: () => g.suffix,
  },
  x;
function ge() {
  if (x === void 0) {
    let r = new Response('');
    if ('body' in r)
      try {
        (new Response(r.body), (x = !0));
      } catch {
        x = !1;
      }
    x = !1;
  }
  return x;
}
var Ye = (r, ...e) => {
  let t = r;
  return (e.length > 0 && (t += ` :: ${JSON.stringify(e)}`), t);
};
var Xe = Ye,
  u = class extends Error {
    details;
    constructor(e, t) {
      let s = Xe(e, t);
      (super(s), (this.name = e), (this.details = t));
    }
  };
var me = (r) =>
  new URL(String(r), location.href).href.replace(new RegExp(`^${location.origin}`), '');
function D(r) {
  return new Promise((e) => setTimeout(e, r));
}
var z = new Set();
function fe(r, e) {
  let t = new URL(r);
  for (let s of e) t.searchParams.delete(s);
  return t.href;
}
async function we(r, e, t, s) {
  let a = fe(e.url, t);
  if (e.url === a) return r.match(e, s);
  let n = { ...s, ignoreSearch: !0 },
    o = await r.keys(e, n);
  for (let i of o) {
    let c = fe(i.url, t);
    if (a === c) return r.match(i, s);
  }
}
var C = class {
    promise;
    resolve;
    reject;
    constructor() {
      this.promise = new Promise((e, t) => {
        ((this.resolve = e), (this.reject = t));
      });
    }
  },
  ye = async () => {
    for (let r of z) await r();
  },
  Ze = '-precache-',
  et = async (r, e = Ze) => {
    let s = (await self.caches.keys()).filter(
      (a) => a.includes(e) && a.includes(self.registration.scope) && a !== r,
    );
    return (await Promise.all(s.map((a) => self.caches.delete(a))), s);
  },
  Ne = (r) => {
    self.addEventListener('activate', (e) => {
      e.waitUntil(et(m.getPrecacheName(r)).then((t) => {}));
    });
  },
  Ee = () => {
    self.addEventListener('activate', () => self.clients.claim());
  },
  Y = (r, e) => {
    let t = e();
    return (r.waitUntil(t), t);
  };
var ee = (r, e) => e.some((t) => r instanceof t),
  _e,
  be;
function tt() {
  return _e || (_e = [IDBDatabase, IDBObjectStore, IDBIndex, IDBCursor, IDBTransaction]);
}
function st() {
  return (
    be ||
    (be = [
      IDBCursor.prototype.advance,
      IDBCursor.prototype.continue,
      IDBCursor.prototype.continuePrimaryKey,
    ])
  );
}
var te = new WeakMap(),
  X = new WeakMap(),
  O = new WeakMap();
function rt(r) {
  let e = new Promise((t, s) => {
    let a = () => {
        (r.removeEventListener('success', n), r.removeEventListener('error', o));
      },
      n = () => {
        (t(_(r.result)), a());
      },
      o = () => {
        (s(r.error), a());
      };
    (r.addEventListener('success', n), r.addEventListener('error', o));
  });
  return (O.set(e, r), e);
}
function at(r) {
  if (te.has(r)) return;
  let e = new Promise((t, s) => {
    let a = () => {
        (r.removeEventListener('complete', n),
          r.removeEventListener('error', o),
          r.removeEventListener('abort', o));
      },
      n = () => {
        (t(), a());
      },
      o = () => {
        (s(r.error || new DOMException('AbortError', 'AbortError')), a());
      };
    (r.addEventListener('complete', n),
      r.addEventListener('error', o),
      r.addEventListener('abort', o));
  });
  te.set(r, e);
}
var se = {
  get(r, e, t) {
    if (r instanceof IDBTransaction) {
      if (e === 'done') return te.get(r);
      if (e === 'store')
        return t.objectStoreNames[1] ? void 0 : t.objectStore(t.objectStoreNames[0]);
    }
    return _(r[e]);
  },
  set(r, e, t) {
    return ((r[e] = t), !0);
  },
  has(r, e) {
    return r instanceof IDBTransaction && (e === 'done' || e === 'store') ? !0 : e in r;
  },
};
function De(r) {
  se = r(se);
}
function nt(r) {
  return st().includes(r)
    ? function (...e) {
        return (r.apply(re(this), e), _(this.request));
      }
    : function (...e) {
        return _(r.apply(re(this), e));
      };
}
function ot(r) {
  return typeof r == 'function'
    ? nt(r)
    : (r instanceof IDBTransaction && at(r), ee(r, tt()) ? new Proxy(r, se) : r);
}
function _(r) {
  if (r instanceof IDBRequest) return rt(r);
  if (X.has(r)) return X.get(r);
  let e = ot(r);
  return (e !== r && (X.set(r, e), O.set(e, r)), e);
}
var re = (r) => O.get(r);
function A(r, e, { blocked: t, upgrade: s, blocking: a, terminated: n } = {}) {
  let o = indexedDB.open(r, e),
    i = _(o);
  return (
    s &&
      o.addEventListener('upgradeneeded', (c) => {
        s(_(o.result), c.oldVersion, c.newVersion, _(o.transaction), c);
      }),
    t && o.addEventListener('blocked', (c) => t(c.oldVersion, c.newVersion, c)),
    i
      .then((c) => {
        (n && c.addEventListener('close', () => n()),
          a && c.addEventListener('versionchange', (l) => a(l.oldVersion, l.newVersion, l)));
      })
      .catch(() => {}),
    i
  );
}
function Se(r, { blocked: e } = {}) {
  let t = indexedDB.deleteDatabase(r);
  return (e && t.addEventListener('blocked', (s) => e(s.oldVersion, s)), _(t).then(() => {}));
}
var it = ['get', 'getKey', 'getAll', 'getAllKeys', 'count'],
  ct = ['put', 'add', 'delete', 'clear'],
  Z = new Map();
function Re(r, e) {
  if (!(r instanceof IDBDatabase && !(e in r) && typeof e == 'string')) return;
  if (Z.get(e)) return Z.get(e);
  let t = e.replace(/FromIndex$/, ''),
    s = e !== t,
    a = ct.includes(t);
  if (!(t in (s ? IDBIndex : IDBObjectStore).prototype) || !(a || it.includes(t))) return;
  let n = async function (o, ...i) {
    let c = this.transaction(o, a ? 'readwrite' : 'readonly'),
      l = c.store;
    return (s && (l = l.index(i.shift())), (await Promise.all([l[t](...i), a && c.done]))[0]);
  };
  return (Z.set(e, n), n);
}
De((r) => ({
  ...r,
  get: (e, t, s) => Re(e, t) || r.get(e, t, s),
  has: (e, t) => !!Re(e, t) || r.has(e, t),
}));
var lt = ['continue', 'continuePrimaryKey', 'advance'],
  ve = {},
  ae = new WeakMap(),
  qe = new WeakMap(),
  ut = {
    get(r, e) {
      if (!lt.includes(e)) return r[e];
      let t = ve[e];
      return (
        t ||
          (t = ve[e] =
            function (...s) {
              ae.set(this, qe.get(this)[e](...s));
            }),
        t
      );
    },
  };
async function* ht(...r) {
  let e = this;
  if ((e instanceof IDBCursor || (e = await e.openCursor(...r)), !e)) return;
  e = e;
  let t = new Proxy(e, ut);
  for (qe.set(t, e), O.set(t, re(e)); e; )
    (yield t, (e = await (ae.get(t) || e.continue())), ae.delete(t));
}
function xe(r, e) {
  return (
    (e === Symbol.asyncIterator && ee(r, [IDBIndex, IDBObjectStore, IDBCursor])) ||
    (e === 'iterate' && ee(r, [IDBIndex, IDBObjectStore]))
  );
}
De((r) => ({
  ...r,
  get(e, t, s) {
    return xe(e, t) ? ht : r.get(e, t, s);
  },
  has(e, t) {
    return xe(e, t) || r.has(e, t);
  },
}));
var Ae = async (r, e) => {
    let t = null;
    if ((r.url && (t = new URL(r.url).origin), t !== self.location.origin))
      throw new u('cross-origin-copy-response', { origin: t });
    let s = r.clone(),
      a = { headers: new Headers(s.headers), status: s.status, statusText: s.statusText },
      n = e ? e(a) : a,
      o = ge() ? s.body : await s.blob();
    return new Response(o, n);
  },
  Ue = () => {
    self.__WB_DISABLE_DEV_LOGS = !0;
  },
  Te = 3,
  dt = 'serwist-background-sync',
  w = 'requests',
  S = 'queueName',
  oe = class {
    _db = null;
    async addEntry(e) {
      let s = (await this.getDb()).transaction(w, 'readwrite', { durability: 'relaxed' });
      (await s.store.add(e), await s.done);
    }
    async getFirstEntryId() {
      return (await (await this.getDb()).transaction(w).store.openCursor())?.value.id;
    }
    async getAllEntriesByQueueName(e) {
      let s = await (await this.getDb()).getAllFromIndex(w, S, IDBKeyRange.only(e));
      return s || [];
    }
    async getEntryCountByQueueName(e) {
      return (await this.getDb()).countFromIndex(w, S, IDBKeyRange.only(e));
    }
    async deleteEntry(e) {
      await (await this.getDb()).delete(w, e);
    }
    async getFirstEntryByQueueName(e) {
      return await this.getEndEntryFromIndex(IDBKeyRange.only(e), 'next');
    }
    async getLastEntryByQueueName(e) {
      return await this.getEndEntryFromIndex(IDBKeyRange.only(e), 'prev');
    }
    async getEndEntryFromIndex(e, t) {
      return (await (await this.getDb()).transaction(w).store.index(S).openCursor(e, t))?.value;
    }
    async getDb() {
      return (this._db || (this._db = await A(dt, Te, { upgrade: this._upgradeDb })), this._db);
    }
    _upgradeDb(e, t) {
      (t > 0 && t < Te && e.objectStoreNames.contains(w) && e.deleteObjectStore(w),
        e
          .createObjectStore(w, { autoIncrement: !0, keyPath: 'id' })
          .createIndex(S, S, { unique: !1 }));
    }
  },
  k = class {
    _queueName;
    _queueDb;
    constructor(e) {
      ((this._queueName = e), (this._queueDb = new oe()));
    }
    async pushEntry(e) {
      (delete e.id, (e.queueName = this._queueName), await this._queueDb.addEntry(e));
    }
    async unshiftEntry(e) {
      let t = await this._queueDb.getFirstEntryId();
      (t ? (e.id = t - 1) : delete e.id,
        (e.queueName = this._queueName),
        await this._queueDb.addEntry(e));
    }
    async popEntry() {
      return this._removeEntry(await this._queueDb.getLastEntryByQueueName(this._queueName));
    }
    async shiftEntry() {
      return this._removeEntry(await this._queueDb.getFirstEntryByQueueName(this._queueName));
    }
    async getAll() {
      return await this._queueDb.getAllEntriesByQueueName(this._queueName);
    }
    async size() {
      return await this._queueDb.getEntryCountByQueueName(this._queueName);
    }
    async deleteEntry(e) {
      await this._queueDb.deleteEntry(e);
    }
    async _removeEntry(e) {
      return (e && (await this.deleteEntry(e.id)), e);
    }
  },
  pt = [
    'method',
    'referrer',
    'referrerPolicy',
    'mode',
    'credentials',
    'cache',
    'redirect',
    'integrity',
    'keepalive',
  ],
  q = class r {
    _requestData;
    static async fromRequest(e) {
      let t = { url: e.url, headers: {} };
      (e.method !== 'GET' && (t.body = await e.clone().arrayBuffer()),
        e.headers.forEach((s, a) => {
          t.headers[a] = s;
        }));
      for (let s of pt) e[s] !== void 0 && (t[s] = e[s]);
      return new r(t);
    }
    constructor(e) {
      (e.mode === 'navigate' && (e.mode = 'same-origin'), (this._requestData = e));
    }
    toObject() {
      let e = Object.assign({}, this._requestData);
      return (
        (e.headers = Object.assign({}, this._requestData.headers)),
        e.body && (e.body = e.body.slice(0)),
        e
      );
    }
    toRequest() {
      return new Request(this._requestData.url, this._requestData);
    }
    clone() {
      return new r(this.toObject());
    }
  },
  Ce = 'serwist-background-sync',
  ft = 1440 * 7,
  ne = new Set(),
  Oe = (r) => {
    let e = { request: new q(r.requestData).toRequest(), timestamp: r.timestamp };
    return (r.metadata && (e.metadata = r.metadata), e);
  },
  P = class {
    _name;
    _onSync;
    _maxRetentionTime;
    _queueStore;
    _forceSyncFallback;
    _syncInProgress = !1;
    _requestsAddedDuringSync = !1;
    constructor(e, { forceSyncFallback: t, onSync: s, maxRetentionTime: a } = {}) {
      if (ne.has(e)) throw new u('duplicate-queue-name', { name: e });
      (ne.add(e),
        (this._name = e),
        (this._onSync = s || this.replayRequests),
        (this._maxRetentionTime = a || ft),
        (this._forceSyncFallback = !!t),
        (this._queueStore = new k(this._name)),
        this._addSyncListener());
    }
    get name() {
      return this._name;
    }
    async pushRequest(e) {
      await this._addRequest(e, 'push');
    }
    async unshiftRequest(e) {
      await this._addRequest(e, 'unshift');
    }
    async popRequest() {
      return this._removeRequest('pop');
    }
    async shiftRequest() {
      return this._removeRequest('shift');
    }
    async getAll() {
      let e = await this._queueStore.getAll(),
        t = Date.now(),
        s = [];
      for (let a of e) {
        let n = this._maxRetentionTime * 60 * 1e3;
        t - a.timestamp > n ? await this._queueStore.deleteEntry(a.id) : s.push(Oe(a));
      }
      return s;
    }
    async size() {
      return await this._queueStore.size();
    }
    async _addRequest({ request: e, metadata: t, timestamp: s = Date.now() }, a) {
      let o = { requestData: (await q.fromRequest(e.clone())).toObject(), timestamp: s };
      switch ((t && (o.metadata = t), a)) {
        case 'push':
          await this._queueStore.pushEntry(o);
          break;
        case 'unshift':
          await this._queueStore.unshiftEntry(o);
          break;
      }
      this._syncInProgress ? (this._requestsAddedDuringSync = !0) : await this.registerSync();
    }
    async _removeRequest(e) {
      let t = Date.now(),
        s;
      switch (e) {
        case 'pop':
          s = await this._queueStore.popEntry();
          break;
        case 'shift':
          s = await this._queueStore.shiftEntry();
          break;
      }
      if (s) {
        let a = this._maxRetentionTime * 60 * 1e3;
        return t - s.timestamp > a ? this._removeRequest(e) : Oe(s);
      }
    }
    async replayRequests() {
      let e;
      for (; (e = await this.shiftRequest()); )
        try {
          await fetch(e.request.clone());
        } catch {
          throw (await this.unshiftRequest(e), new u('queue-replay-failed', { name: this._name }));
        }
    }
    async registerSync() {
      if ('sync' in self.registration && !this._forceSyncFallback)
        try {
          await self.registration.sync.register(`${Ce}:${this._name}`);
        } catch {}
    }
    _addSyncListener() {
      'sync' in self.registration && !this._forceSyncFallback
        ? self.addEventListener('sync', (e) => {
            if (e.tag === `${Ce}:${this._name}`) {
              let t = async () => {
                this._syncInProgress = !0;
                let s;
                try {
                  await this._onSync({ queue: this });
                } catch (a) {
                  if (a instanceof Error) throw ((s = a), s);
                } finally {
                  (this._requestsAddedDuringSync &&
                    !(s && !e.lastChance) &&
                    (await this.registerSync()),
                    (this._syncInProgress = !1),
                    (this._requestsAddedDuringSync = !1));
                }
              };
              e.waitUntil(t());
            }
          })
        : this._onSync({ queue: this });
    }
    static get _queueNames() {
      return ne;
    }
  },
  $ = class {
    _queue;
    constructor(e, t) {
      this._queue = new P(e, t);
    }
    async fetchDidFail({ request: e }) {
      await this._queue.pushRequest({ request: e });
    }
  },
  ie = {
    cacheWillUpdate: async ({ response: r }) => (r.status === 200 || r.status === 0 ? r : null),
  };
function U(r) {
  return typeof r == 'string' ? new Request(r) : r;
}
var L = class {
    event;
    request;
    url;
    params;
    _cacheKeys = {};
    _strategy;
    _handlerDeferred;
    _extendLifetimePromises;
    _plugins;
    _pluginStateMap;
    constructor(e, t) {
      ((this.event = t.event),
        (this.request = t.request),
        t.url && ((this.url = t.url), (this.params = t.params)),
        (this._strategy = e),
        (this._handlerDeferred = new C()),
        (this._extendLifetimePromises = []),
        (this._plugins = [...e.plugins]),
        (this._pluginStateMap = new Map()));
      for (let s of this._plugins) this._pluginStateMap.set(s, {});
      this.event.waitUntil(this._handlerDeferred.promise);
    }
    async fetch(e) {
      let { event: t } = this,
        s = U(e),
        a = await this.getPreloadResponse();
      if (a) return a;
      let n = this.hasCallback('fetchDidFail') ? s.clone() : null;
      try {
        for (let i of this.iterateCallbacks('requestWillFetch'))
          s = await i({ request: s.clone(), event: t });
      } catch (i) {
        if (i instanceof Error)
          throw new u('plugin-error-request-will-fetch', { thrownErrorMessage: i.message });
      }
      let o = s.clone();
      try {
        let i;
        i = await fetch(s, s.mode === 'navigate' ? void 0 : this._strategy.fetchOptions);
        for (let c of this.iterateCallbacks('fetchDidSucceed'))
          i = await c({ event: t, request: o, response: i });
        return i;
      } catch (i) {
        throw (
          n &&
            (await this.runCallbacks('fetchDidFail', {
              error: i,
              event: t,
              originalRequest: n.clone(),
              request: o.clone(),
            })),
          i
        );
      }
    }
    async fetchAndCachePut(e) {
      let t = await this.fetch(e),
        s = t.clone();
      return (this.waitUntil(this.cachePut(e, s)), t);
    }
    async cacheMatch(e) {
      let t = U(e),
        s,
        { cacheName: a, matchOptions: n } = this._strategy,
        o = await this.getCacheKey(t, 'read'),
        i = { ...n, cacheName: a };
      s = await caches.match(o, i);
      for (let c of this.iterateCallbacks('cachedResponseWillBeUsed'))
        s =
          (await c({
            cacheName: a,
            matchOptions: n,
            cachedResponse: s,
            request: o,
            event: this.event,
          })) || void 0;
      return s;
    }
    async cachePut(e, t) {
      let s = U(e);
      await D(0);
      let a = await this.getCacheKey(s, 'write');
      if (!t) throw new u('cache-put-with-no-response', { url: me(a.url) });
      let n = await this._ensureResponseSafeToCache(t);
      if (!n) return !1;
      let { cacheName: o, matchOptions: i } = this._strategy,
        c = await self.caches.open(o),
        l = this.hasCallback('cacheDidUpdate'),
        h = l ? await we(c, a.clone(), ['__WB_REVISION__'], i) : null;
      try {
        await c.put(a, l ? n.clone() : n);
      } catch (d) {
        if (d instanceof Error) throw (d.name === 'QuotaExceededError' && (await ye()), d);
      }
      for (let d of this.iterateCallbacks('cacheDidUpdate'))
        await d({
          cacheName: o,
          oldResponse: h,
          newResponse: n.clone(),
          request: a,
          event: this.event,
        });
      return !0;
    }
    async getCacheKey(e, t) {
      let s = `${e.url} | ${t}`;
      if (!this._cacheKeys[s]) {
        let a = e;
        for (let n of this.iterateCallbacks('cacheKeyWillBeUsed'))
          a = U(await n({ mode: t, request: a, event: this.event, params: this.params }));
        this._cacheKeys[s] = a;
      }
      return this._cacheKeys[s];
    }
    hasCallback(e) {
      for (let t of this._strategy.plugins) if (e in t) return !0;
      return !1;
    }
    async runCallbacks(e, t) {
      for (let s of this.iterateCallbacks(e)) await s(t);
    }
    *iterateCallbacks(e) {
      for (let t of this._strategy.plugins)
        if (typeof t[e] == 'function') {
          let s = this._pluginStateMap.get(t);
          yield (n) => {
            let o = { ...n, state: s };
            return t[e](o);
          };
        }
    }
    waitUntil(e) {
      return (this._extendLifetimePromises.push(e), e);
    }
    async doneWaiting() {
      let e;
      for (; (e = this._extendLifetimePromises.shift()); ) await e;
    }
    destroy() {
      this._handlerDeferred.resolve(null);
    }
    async getPreloadResponse() {
      if (
        this.event instanceof FetchEvent &&
        this.event.request.mode === 'navigate' &&
        'preloadResponse' in this.event
      )
        try {
          let e = await this.event.preloadResponse;
          if (e) return e;
        } catch {
          return;
        }
    }
    async _ensureResponseSafeToCache(e) {
      let t = e,
        s = !1;
      for (let a of this.iterateCallbacks('cacheWillUpdate'))
        if (
          ((t = (await a({ request: this.request, response: t, event: this.event })) || void 0),
          (s = !0),
          !t)
        )
          break;
      return (s || (t && t.status !== 200 && (t = void 0)), t);
    }
  },
  y = class {
    cacheName;
    plugins;
    fetchOptions;
    matchOptions;
    constructor(e = {}) {
      ((this.cacheName = m.getRuntimeName(e.cacheName)),
        (this.plugins = e.plugins || []),
        (this.fetchOptions = e.fetchOptions),
        (this.matchOptions = e.matchOptions));
    }
    handle(e) {
      let [t] = this.handleAll(e);
      return t;
    }
    handleAll(e) {
      e instanceof FetchEvent && (e = { event: e, request: e.request });
      let t = e.event,
        s = typeof e.request == 'string' ? new Request(e.request) : e.request,
        a = new L(
          this,
          e.url ? { event: t, request: s, url: e.url, params: e.params } : { event: t, request: s },
        ),
        n = this._getResponse(a, s, t),
        o = this._awaitComplete(n, a, s, t);
      return [n, o];
    }
    async _getResponse(e, t, s) {
      await e.runCallbacks('handlerWillStart', { event: s, request: t });
      let a;
      try {
        if (((a = await this._handle(t, e)), a === void 0 || a.type === 'error'))
          throw new u('no-response', { url: t.url });
      } catch (n) {
        if (n instanceof Error) {
          for (let o of e.iterateCallbacks('handlerDidError'))
            if (((a = await o({ error: n, event: s, request: t })), a !== void 0)) break;
        }
        if (!a) throw n;
      }
      for (let n of e.iterateCallbacks('handlerWillRespond'))
        a = await n({ event: s, request: t, response: a });
      return a;
    }
    async _awaitComplete(e, t, s, a) {
      let n, o;
      try {
        n = await e;
      } catch {}
      try {
        (await t.runCallbacks('handlerDidRespond', { event: a, request: s, response: n }),
          await t.doneWaiting());
      } catch (i) {
        i instanceof Error && (o = i);
      }
      if (
        (await t.runCallbacks('handlerDidComplete', {
          event: a,
          request: s,
          response: n,
          error: o,
        }),
        t.destroy(),
        o)
      )
        throw o;
    }
  };
var v = class extends y {
    _networkTimeoutSeconds;
    constructor(e = {}) {
      (super(e),
        this.plugins.some((t) => 'cacheWillUpdate' in t) || this.plugins.unshift(ie),
        (this._networkTimeoutSeconds = e.networkTimeoutSeconds || 0));
    }
    async _handle(e, t) {
      let s = [],
        a = [],
        n;
      if (this._networkTimeoutSeconds) {
        let { id: c, promise: l } = this._getTimeoutPromise({ request: e, logs: s, handler: t });
        ((n = c), a.push(l));
      }
      let o = this._getNetworkPromise({ timeoutId: n, request: e, logs: s, handler: t });
      a.push(o);
      let i = await t.waitUntil((async () => (await t.waitUntil(Promise.race(a))) || (await o))());
      if (!i) throw new u('no-response', { url: e.url });
      return i;
    }
    _getTimeoutPromise({ request: e, logs: t, handler: s }) {
      let a;
      return {
        promise: new Promise((o) => {
          a = setTimeout(async () => {
            o(await s.cacheMatch(e));
          }, this._networkTimeoutSeconds * 1e3);
        }),
        id: a,
      };
    }
    async _getNetworkPromise({ timeoutId: e, request: t, logs: s, handler: a }) {
      let n, o;
      try {
        o = await a.fetchAndCachePut(t);
      } catch (i) {
        i instanceof Error && (n = i);
      }
      return (e && clearTimeout(e), (n || !o) && (o = await a.cacheMatch(t)), o);
    }
  },
  R = class extends y {
    _networkTimeoutSeconds;
    constructor(e = {}) {
      (super(e), (this._networkTimeoutSeconds = e.networkTimeoutSeconds || 0));
    }
    async _handle(e, t) {
      let s, a;
      try {
        let n = [t.fetch(e)];
        if (this._networkTimeoutSeconds) {
          let o = D(this._networkTimeoutSeconds * 1e3);
          n.push(o);
        }
        if (((a = await Promise.race(n)), !a))
          throw new Error(
            `Timed out the network response after ${this._networkTimeoutSeconds} seconds.`,
          );
      } catch (n) {
        n instanceof Error && (s = n);
      }
      if (!a) throw new u('no-response', { url: e.url, error: s });
      return a;
    }
  },
  ce = 'GET';
var T = (r) => (r && typeof r == 'object' ? r : { handle: r }),
  p = class {
    handler;
    match;
    method;
    catchHandler;
    constructor(e, t, s = ce) {
      ((this.handler = T(t)), (this.match = e), (this.method = s));
    }
    setCatchHandler(e) {
      this.catchHandler = T(e);
    }
  },
  I = class r extends y {
    _fallbackToNetwork;
    static defaultPrecacheCacheabilityPlugin = {
      async cacheWillUpdate({ response: e }) {
        return !e || e.status >= 400 ? null : e;
      },
    };
    static copyRedirectedCacheableResponsesPlugin = {
      async cacheWillUpdate({ response: e }) {
        return e.redirected ? await Ae(e) : e;
      },
    };
    constructor(e = {}) {
      ((e.cacheName = m.getPrecacheName(e.cacheName)),
        super(e),
        (this._fallbackToNetwork = e.fallbackToNetwork !== !1),
        this.plugins.push(r.copyRedirectedCacheableResponsesPlugin));
    }
    async _handle(e, t) {
      let s = await t.getPreloadResponse();
      if (s) return s;
      let a = await t.cacheMatch(e);
      return (
        a ||
        (t.event && t.event.type === 'install'
          ? await this._handleInstall(e, t)
          : await this._handleFetch(e, t))
      );
    }
    async _handleFetch(e, t) {
      let s,
        a = t.params || {};
      if (this._fallbackToNetwork) {
        let n = a.integrity,
          o = e.integrity,
          i = !o || o === n;
        if (
          ((s = await t.fetch(
            new Request(e, { integrity: e.mode !== 'no-cors' ? o || n : void 0 }),
          )),
          n && i && e.mode !== 'no-cors')
        ) {
          this._useDefaultCacheabilityPluginIfNeeded();
          let c = await t.cachePut(e, s.clone());
        }
      } else throw new u('missing-precache-entry', { cacheName: this.cacheName, url: e.url });
      return s;
    }
    async _handleInstall(e, t) {
      this._useDefaultCacheabilityPluginIfNeeded();
      let s = await t.fetch(e);
      if (!(await t.cachePut(e, s.clone())))
        throw new u('bad-precaching-response', { url: e.url, status: s.status });
      return s;
    }
    _useDefaultCacheabilityPluginIfNeeded() {
      let e = null,
        t = 0;
      for (let [s, a] of this.plugins.entries())
        a !== r.copyRedirectedCacheableResponsesPlugin &&
          (a === r.defaultPrecacheCacheabilityPlugin && (e = s), a.cacheWillUpdate && t++);
      t === 0
        ? this.plugins.push(r.defaultPrecacheCacheabilityPlugin)
        : t > 1 && e !== null && this.plugins.splice(e, 1);
    }
  },
  V = class extends p {
    _allowlist;
    _denylist;
    constructor(e, { allowlist: t = [/./], denylist: s = [] } = {}) {
      (super((a) => this._match(a), e), (this._allowlist = t), (this._denylist = s));
    }
    _match({ url: e, request: t }) {
      if (t && t.mode !== 'navigate') return !1;
      let s = e.pathname + e.search;
      for (let a of this._denylist) if (a.test(s)) return !1;
      return !!this._allowlist.some((a) => a.test(s));
    }
  },
  ke = () => !!self.registration?.navigationPreload,
  Pe = (r) => {
    ke() &&
      self.addEventListener('activate', (e) => {
        e.waitUntil(
          self.registration.navigationPreload.enable().then(() => {
            r && self.registration.navigationPreload.setHeaderValue(r);
          }),
        );
      });
  };
var gt = (r, e = []) => {
  for (let t of [...r.searchParams.keys()]) e.some((s) => s.test(t)) && r.searchParams.delete(t);
  return r;
};
function* $e(
  r,
  {
    directoryIndex: e = 'index.html',
    ignoreURLParametersMatching: t = [/^utm_/, /^fbclid$/],
    cleanURLs: s = !0,
    urlManipulation: a,
  } = {},
) {
  let n = new URL(r, location.href);
  ((n.hash = ''), yield n.href);
  let o = gt(n, t);
  if ((yield o.href, e && o.pathname.endsWith('/'))) {
    let i = new URL(o.href);
    ((i.pathname += e), yield i.href);
  }
  if (s) {
    let i = new URL(o.href);
    ((i.pathname += '.html'), yield i.href);
  }
  if (a) {
    let i = a({ url: n });
    for (let c of i) yield c.href;
  }
}
var F = class extends p {
    constructor(e, t, s) {
      let a = ({ url: n }) => {
        let o = e.exec(n.href);
        if (o && !(n.origin !== location.origin && o.index !== 0)) return o.slice(1);
      };
      super(a, t, s);
    }
  },
  Le = (r) => {
    m.updateDetails(r);
  },
  mt = '__WB_REVISION__',
  Ie = (r) => {
    if (!r) throw new u('add-to-cache-list-unexpected-type', { entry: r });
    if (typeof r == 'string') {
      let n = new URL(r, location.href);
      return { cacheKey: n.href, url: n.href };
    }
    let { revision: e, url: t } = r;
    if (!t) throw new u('add-to-cache-list-unexpected-type', { entry: r });
    if (!e) {
      let n = new URL(t, location.href);
      return { cacheKey: n.href, url: n.href };
    }
    let s = new URL(t, location.href),
      a = new URL(t, location.href);
    return (s.searchParams.set(mt, e), { cacheKey: s.href, url: a.href });
  },
  M = class {
    updatedURLs = [];
    notUpdatedURLs = [];
    handlerWillStart = async ({ request: e, state: t }) => {
      t && (t.originalRequest = e);
    };
    cachedResponseWillBeUsed = async ({ event: e, state: t, cachedResponse: s }) => {
      if (e.type === 'install' && t?.originalRequest && t.originalRequest instanceof Request) {
        let a = t.originalRequest.url;
        s ? this.notUpdatedURLs.push(a) : this.updatedURLs.push(a);
      }
      return s;
    };
  },
  Ve = (r, e, t) => {
    if (typeof r == 'string') {
      let s = new URL(r, location.href),
        a = ({ url: n }) => n.href === s.href;
      return new p(a, e, t);
    }
    if (r instanceof RegExp) return new F(r, e, t);
    if (typeof r == 'function') return new p(r, e, t);
    if (r instanceof p) return r;
    throw new u('unsupported-route-type', {
      moduleName: 'serwist',
      funcName: 'parseRoute',
      paramName: 'capture',
    });
  };
var Fe = async (r, e, t) => {
  let s = e.map((i, c) => ({ index: c, item: i })),
    a = async (i) => {
      let c = [];
      for (;;) {
        let l = s.pop();
        if (!l) return i(c);
        let h = await t(l.item);
        c.push({ result: h, index: l.index });
      }
    },
    n = Array.from({ length: r }, () => new Promise(a));
  return (await Promise.all(n))
    .flat()
    .sort((i, c) => (i.index < c.index ? -1 : 1))
    .map((i) => i.result);
};
var cs = typeof navigator < 'u' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
var wt = 'serwist-expiration',
  B = 'cache-entries',
  Me = (r) => {
    let e = new URL(r, location.href);
    return ((e.hash = ''), e.href);
  },
  le = class {
    _cacheName;
    _db = null;
    constructor(e) {
      this._cacheName = e;
    }
    _getId(e) {
      return `${this._cacheName}|${Me(e)}`;
    }
    _upgradeDb(e) {
      let t = e.createObjectStore(B, { keyPath: 'id' });
      (t.createIndex('cacheName', 'cacheName', { unique: !1 }),
        t.createIndex('timestamp', 'timestamp', { unique: !1 }));
    }
    _upgradeDbAndDeleteOldDbs(e) {
      (this._upgradeDb(e), this._cacheName && Se(this._cacheName));
    }
    async setTimestamp(e, t) {
      e = Me(e);
      let s = { id: this._getId(e), cacheName: this._cacheName, url: e, timestamp: t },
        n = (await this.getDb()).transaction(B, 'readwrite', { durability: 'relaxed' });
      (await n.store.put(s), await n.done);
    }
    async getTimestamp(e) {
      return (await (await this.getDb()).get(B, this._getId(e)))?.timestamp;
    }
    async expireEntries(e, t) {
      let a = await (await this.getDb())
          .transaction(B, 'readwrite')
          .store.index('timestamp')
          .openCursor(null, 'prev'),
        n = [],
        o = 0;
      for (; a; ) {
        let i = a.value;
        (i.cacheName === this._cacheName &&
          ((e && i.timestamp < e) || (t && o >= t) ? (a.delete(), n.push(i.url)) : o++),
          (a = await a.continue()));
      }
      return n;
    }
    async getDb() {
      return (
        this._db ||
          (this._db = await A(wt, 1, { upgrade: this._upgradeDbAndDeleteOldDbs.bind(this) })),
        this._db
      );
    }
  },
  ue = class {
    _isRunning = !1;
    _rerunRequested = !1;
    _maxEntries;
    _maxAgeSeconds;
    _matchOptions;
    _cacheName;
    _timestampModel;
    constructor(e, t = {}) {
      ((this._maxEntries = t.maxEntries),
        (this._maxAgeSeconds = t.maxAgeSeconds),
        (this._matchOptions = t.matchOptions),
        (this._cacheName = e),
        (this._timestampModel = new le(e)));
    }
    async expireEntries() {
      if (this._isRunning) {
        this._rerunRequested = !0;
        return;
      }
      this._isRunning = !0;
      let e = this._maxAgeSeconds ? Date.now() - this._maxAgeSeconds * 1e3 : 0,
        t = await this._timestampModel.expireEntries(e, this._maxEntries),
        s = await self.caches.open(this._cacheName);
      for (let a of t) await s.delete(a, this._matchOptions);
      ((this._isRunning = !1),
        this._rerunRequested && ((this._rerunRequested = !1), this.expireEntries()));
    }
    async updateTimestamp(e) {
      await this._timestampModel.setTimestamp(e, Date.now());
    }
    async isURLExpired(e) {
      if (!this._maxAgeSeconds) return !1;
      let t = await this._timestampModel.getTimestamp(e),
        s = Date.now() - this._maxAgeSeconds * 1e3;
      return t !== void 0 ? t < s : !0;
    }
    async delete() {
      ((this._rerunRequested = !1),
        await this._timestampModel.expireEntries(Number.POSITIVE_INFINITY));
    }
  },
  yt = (r) => {
    z.add(r);
  },
  W = class {
    _config;
    _cacheExpirations;
    constructor(e = {}) {
      ((this._config = e),
        (this._cacheExpirations = new Map()),
        this._config.maxAgeFrom || (this._config.maxAgeFrom = 'last-fetched'),
        this._config.purgeOnQuotaError && yt(() => this.deleteCacheAndMetadata()));
    }
    _getCacheExpiration(e) {
      if (e === m.getRuntimeName()) throw new u('expire-custom-caches-only');
      let t = this._cacheExpirations.get(e);
      return (t || ((t = new ue(e, this._config)), this._cacheExpirations.set(e, t)), t);
    }
    cachedResponseWillBeUsed({ event: e, cacheName: t, request: s, cachedResponse: a }) {
      if (!a) return null;
      let n = this._isResponseDateFresh(a),
        o = this._getCacheExpiration(t),
        i = this._config.maxAgeFrom === 'last-used',
        c = (async () => {
          (i && (await o.updateTimestamp(s.url)), await o.expireEntries());
        })();
      try {
        e.waitUntil(c);
      } catch {}
      return n ? a : null;
    }
    _isResponseDateFresh(e) {
      if (this._config.maxAgeFrom === 'last-used') return !0;
      let s = Date.now();
      if (!this._config.maxAgeSeconds) return !0;
      let a = this._getDateHeaderTimestamp(e);
      return a === null ? !0 : a >= s - this._config.maxAgeSeconds * 1e3;
    }
    _getDateHeaderTimestamp(e) {
      if (!e.headers.has('date')) return null;
      let t = e.headers.get('date'),
        a = new Date(t).getTime();
      return Number.isNaN(a) ? null : a;
    }
    async cacheDidUpdate({ cacheName: e, request: t }) {
      let s = this._getCacheExpiration(e);
      (await s.updateTimestamp(t.url), await s.expireEntries());
    }
    async deleteCacheAndMetadata() {
      for (let [e, t] of this._cacheExpirations) (await self.caches.delete(e), await t.delete());
      this._cacheExpirations = new Map();
    }
  },
  Nt = 'serwist-google-analytics',
  Et = 2880,
  We = 'www.google-analytics.com',
  Ke = 'www.googletagmanager.com',
  _t = '/analytics.js',
  bt = '/gtag/js',
  Rt = '/gtm.js',
  vt = /^\/(\w+\/)?collect/,
  xt =
    (r) =>
    async ({ queue: e }) => {
      let t;
      for (; (t = await e.shiftRequest()); ) {
        let { request: s, timestamp: a } = t,
          n = new URL(s.url);
        try {
          let o =
              s.method === 'POST' ? new URLSearchParams(await s.clone().text()) : n.searchParams,
            i = a - (Number(o.get('qt')) || 0),
            c = Date.now() - i;
          if ((o.set('qt', String(c)), r.parameterOverrides))
            for (let l of Object.keys(r.parameterOverrides)) {
              let h = r.parameterOverrides[l];
              o.set(l, h);
            }
          (typeof r.hitFilter == 'function' && r.hitFilter.call(null, o),
            await fetch(
              new Request(n.origin + n.pathname, {
                body: o.toString(),
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                headers: { 'Content-Type': 'text/plain' },
              }),
            ));
        } catch (o) {
          throw (await e.unshiftRequest(t), o);
        }
      }
    },
  Dt = (r) => {
    let e = ({ url: s }) => s.hostname === We && vt.test(s.pathname),
      t = new R({ plugins: [r] });
    return [new p(e, t, 'GET'), new p(e, t, 'POST')];
  },
  St = (r) => {
    let e = ({ url: s }) => s.hostname === We && s.pathname === _t,
      t = new v({ cacheName: r });
    return new p(e, t, 'GET');
  },
  qt = (r) => {
    let e = ({ url: s }) => s.hostname === Ke && s.pathname === bt,
      t = new v({ cacheName: r });
    return new p(e, t, 'GET');
  },
  Tt = (r) => {
    let e = ({ url: s }) => s.hostname === Ke && s.pathname === Rt,
      t = new v({ cacheName: r });
    return new p(e, t, 'GET');
  },
  Be = ({ serwist: r, cacheName: e, ...t }) => {
    let s = m.getGoogleAnalyticsName(e),
      a = new $(Nt, { maxRetentionTime: Et, onSync: xt(t) }),
      n = [Tt(s), St(s), qt(s), ...Dt(a)];
    for (let o of n) r.registerRoute(o);
  },
  he = class {
    _fallbackUrls;
    _serwist;
    constructor({ fallbackUrls: e, serwist: t }) {
      ((this._fallbackUrls = e), (this._serwist = t));
    }
    async handlerDidError(e) {
      for (let t of this._fallbackUrls)
        if (typeof t == 'string') {
          let s = await this._serwist.matchPrecache(t);
          if (s !== void 0) return s;
        } else if (t.matcher(e)) {
          let s = await this._serwist.matchPrecache(t.url);
          if (s !== void 0) return s;
        }
    }
  };
var K = class extends y {
  async _handle(e, t) {
    let s = [],
      a = await t.cacheMatch(e),
      n;
    if (!a)
      try {
        a = await t.fetchAndCachePut(e);
      } catch (o) {
        o instanceof Error && (n = o);
      }
    if (!a) throw new u('no-response', { url: e.url, error: n });
    return a;
  }
};
var j = class extends y {
    constructor(e = {}) {
      (super(e), this.plugins.some((t) => 'cacheWillUpdate' in t) || this.plugins.unshift(ie));
    }
    async _handle(e, t) {
      let s = [],
        a = t.fetchAndCachePut(e).catch(() => {});
      t.waitUntil(a);
      let n = await t.cacheMatch(e),
        o;
      if (!n)
        try {
          n = await a;
        } catch (i) {
          i instanceof Error && (o = i);
        }
      if (!n) throw new u('no-response', { url: e.url, error: o });
      return n;
    }
  },
  de = class extends p {
    constructor(e, t) {
      let s = ({ request: a }) => {
        let n = e.getUrlsToPrecacheKeys();
        for (let o of $e(a.url, t)) {
          let i = n.get(o);
          if (i) {
            let c = e.getIntegrityForPrecacheKey(i);
            return { cacheKey: i, integrity: c };
          }
        }
      };
      super(s, e.precacheStrategy);
    }
  },
  pe = class {
    _precacheController;
    constructor({ precacheController: e }) {
      this._precacheController = e;
    }
    cacheKeyWillBeUsed = async ({ request: e, params: t }) => {
      let s = t?.cacheKey || this._precacheController.getPrecacheKeyForUrl(e.url);
      return s ? new Request(s, { headers: e.headers }) : e;
    };
  },
  Ct = (r, e = {}) => {
    let {
      cacheName: t,
      plugins: s = [],
      fetchOptions: a,
      matchOptions: n,
      fallbackToNetwork: o,
      directoryIndex: i,
      ignoreURLParametersMatching: c,
      cleanURLs: l,
      urlManipulation: h,
      cleanupOutdatedCaches: d,
      concurrency: f = 10,
      navigateFallback: b,
      navigateFallbackAllowlist: G,
      navigateFallbackDenylist: N,
    } = e ?? {};
    return {
      precacheStrategyOptions: {
        cacheName: m.getPrecacheName(t),
        plugins: [...s, new pe({ precacheController: r })],
        fetchOptions: a,
        matchOptions: n,
        fallbackToNetwork: o,
      },
      precacheRouteOptions: {
        directoryIndex: i,
        ignoreURLParametersMatching: c,
        cleanURLs: l,
        urlManipulation: h,
      },
      precacheMiscOptions: {
        cleanupOutdatedCaches: d,
        concurrency: f,
        navigateFallback: b,
        navigateFallbackAllowlist: G,
        navigateFallbackDenylist: N,
      },
    };
  },
  H = class {
    _urlsToCacheKeys = new Map();
    _urlsToCacheModes = new Map();
    _cacheKeysToIntegrities = new Map();
    _concurrentPrecaching;
    _precacheStrategy;
    _routes;
    _defaultHandlerMap;
    _catchHandler;
    _requestRules;
    constructor({
      precacheEntries: e,
      precacheOptions: t,
      skipWaiting: s = !1,
      importScripts: a,
      navigationPreload: n = !1,
      cacheId: o,
      clientsClaim: i = !1,
      runtimeCaching: c,
      offlineAnalyticsConfig: l,
      disableDevLogs: h = !1,
      fallbacks: d,
      requestRules: f,
    } = {}) {
      let {
        precacheStrategyOptions: b,
        precacheRouteOptions: G,
        precacheMiscOptions: N,
      } = Ct(this, t);
      if (
        ((this._concurrentPrecaching = N.concurrency),
        (this._precacheStrategy = new I(b)),
        (this._routes = new Map()),
        (this._defaultHandlerMap = new Map()),
        (this._requestRules = f),
        (this.handleInstall = this.handleInstall.bind(this)),
        (this.handleActivate = this.handleActivate.bind(this)),
        (this.handleFetch = this.handleFetch.bind(this)),
        (this.handleCache = this.handleCache.bind(this)),
        a && a.length > 0 && self.importScripts(...a),
        n && Pe(),
        o !== void 0 && Le({ prefix: o }),
        s
          ? self.skipWaiting()
          : self.addEventListener('message', (E) => {
              E.data && E.data.type === 'SKIP_WAITING' && self.skipWaiting();
            }),
        i && Ee(),
        e && e.length > 0 && this.addToPrecacheList(e),
        N.cleanupOutdatedCaches && Ne(b.cacheName),
        this.registerRoute(new de(this, G)),
        N.navigateFallback &&
          this.registerRoute(
            new V(this.createHandlerBoundToUrl(N.navigateFallback), {
              allowlist: N.navigateFallbackAllowlist,
              denylist: N.navigateFallbackDenylist,
            }),
          ),
        l !== void 0 &&
          (typeof l == 'boolean' ? l && Be({ serwist: this }) : Be({ ...l, serwist: this })),
        c !== void 0)
      ) {
        if (d !== void 0) {
          let E = new he({ fallbackUrls: d.entries, serwist: this });
          c.forEach((Q) => {
            Q.handler instanceof y &&
              !Q.handler.plugins.some((Je) => 'handlerDidError' in Je) &&
              Q.handler.plugins.push(E);
          });
        }
        for (let E of c) this.registerCapture(E.matcher, E.handler, E.method);
      }
      h && Ue();
    }
    get precacheStrategy() {
      return this._precacheStrategy;
    }
    get routes() {
      return this._routes;
    }
    addEventListeners() {
      (self.addEventListener('install', this.handleInstall),
        self.addEventListener('activate', this.handleActivate),
        self.addEventListener('fetch', this.handleFetch),
        self.addEventListener('message', this.handleCache));
    }
    addToPrecacheList(e) {
      let t = [];
      for (let s of e) {
        typeof s == 'string'
          ? t.push(s)
          : s && !s.integrity && s.revision === void 0 && t.push(s.url);
        let { cacheKey: a, url: n } = Ie(s),
          o = typeof s != 'string' && s.revision ? 'reload' : 'default';
        if (this._urlsToCacheKeys.has(n) && this._urlsToCacheKeys.get(n) !== a)
          throw new u('add-to-cache-list-conflicting-entries', {
            firstEntry: this._urlsToCacheKeys.get(n),
            secondEntry: a,
          });
        if (typeof s != 'string' && s.integrity) {
          if (
            this._cacheKeysToIntegrities.has(a) &&
            this._cacheKeysToIntegrities.get(a) !== s.integrity
          )
            throw new u('add-to-cache-list-conflicting-integrities', { url: n });
          this._cacheKeysToIntegrities.set(a, s.integrity);
        }
        (this._urlsToCacheKeys.set(n, a), this._urlsToCacheModes.set(n, o));
      }
      if (t.length > 0) {
        let s = `Serwist is precaching URLs without revision info: ${t.join(', ')}
This is generally NOT safe. Learn more at https://bit.ly/wb-precache`;
        console.warn(s);
      }
    }
    handleInstall(e) {
      return (
        this.registerRequestRules(e),
        Y(e, async () => {
          let t = new M();
          (this.precacheStrategy.plugins.push(t),
            await Fe(
              this._concurrentPrecaching,
              Array.from(this._urlsToCacheKeys.entries()),
              async ([n, o]) => {
                let i = this._cacheKeysToIntegrities.get(o),
                  c = this._urlsToCacheModes.get(n),
                  l = new Request(n, { integrity: i, cache: c, credentials: 'same-origin' });
                await Promise.all(
                  this.precacheStrategy.handleAll({
                    event: e,
                    request: l,
                    url: new URL(l.url),
                    params: { cacheKey: o },
                  }),
                );
              },
            ));
          let { updatedURLs: s, notUpdatedURLs: a } = t;
          return { updatedURLs: s, notUpdatedURLs: a };
        })
      );
    }
    async registerRequestRules(e) {
      if (this._requestRules && e?.addRoutes)
        try {
          (await e.addRoutes(this._requestRules), (this._requestRules = void 0));
        } catch (t) {
          throw t;
        }
    }
    handleActivate(e) {
      return Y(e, async () => {
        let t = await self.caches.open(this.precacheStrategy.cacheName),
          s = await t.keys(),
          a = new Set(this._urlsToCacheKeys.values()),
          n = [];
        for (let o of s) a.has(o.url) || (await t.delete(o), n.push(o.url));
        return { deletedCacheRequests: n };
      });
    }
    handleFetch(e) {
      let { request: t } = e,
        s = this.handleRequest({ request: t, event: e });
      s && e.respondWith(s);
    }
    handleCache(e) {
      if (e.data && e.data.type === 'CACHE_URLS') {
        let { payload: t } = e.data,
          s = Promise.all(
            t.urlsToCache.map((a) => {
              let n;
              return (
                typeof a == 'string' ? (n = new Request(a)) : (n = new Request(...a)),
                this.handleRequest({ request: n, event: e })
              );
            }),
          );
        (e.waitUntil(s), e.ports?.[0] && s.then(() => e.ports[0].postMessage(!0)));
      }
    }
    setDefaultHandler(e, t = ce) {
      this._defaultHandlerMap.set(t, T(e));
    }
    setCatchHandler(e) {
      this._catchHandler = T(e);
    }
    registerCapture(e, t, s) {
      let a = Ve(e, t, s);
      return (this.registerRoute(a), a);
    }
    registerRoute(e) {
      (this._routes.has(e.method) || this._routes.set(e.method, []),
        this._routes.get(e.method).push(e));
    }
    unregisterRoute(e) {
      if (!this._routes.has(e.method))
        throw new u('unregister-route-but-not-found-with-method', { method: e.method });
      let t = this._routes.get(e.method).indexOf(e);
      if (t > -1) this._routes.get(e.method).splice(t, 1);
      else throw new u('unregister-route-route-not-registered');
    }
    getUrlsToPrecacheKeys() {
      return this._urlsToCacheKeys;
    }
    getPrecachedUrls() {
      return [...this._urlsToCacheKeys.keys()];
    }
    getPrecacheKeyForUrl(e) {
      let t = new URL(e, location.href);
      return this._urlsToCacheKeys.get(t.href);
    }
    getIntegrityForPrecacheKey(e) {
      return this._cacheKeysToIntegrities.get(e);
    }
    async matchPrecache(e) {
      let t = e instanceof Request ? e.url : e,
        s = this.getPrecacheKeyForUrl(t);
      if (s) return (await self.caches.open(this.precacheStrategy.cacheName)).match(s);
    }
    createHandlerBoundToUrl(e) {
      let t = this.getPrecacheKeyForUrl(e);
      if (!t) throw new u('non-precached-url', { url: e });
      return (s) => (
        (s.request = new Request(e)),
        (s.params = { cacheKey: t, ...s.params }),
        this.precacheStrategy.handle(s)
      );
    }
    handleRequest({ request: e, event: t }) {
      let s = new URL(e.url, location.href);
      if (!s.protocol.startsWith('http')) return;
      let a = s.origin === location.origin,
        { params: n, route: o } = this.findMatchingRoute({
          event: t,
          request: e,
          sameOrigin: a,
          url: s,
        }),
        i = o?.handler,
        c = [],
        l = e.method;
      if ((!i && this._defaultHandlerMap.has(l) && (i = this._defaultHandlerMap.get(l)), !i))
        return;
      let h;
      try {
        h = i.handle({ url: s, request: e, event: t, params: n });
      } catch (f) {
        h = Promise.reject(f);
      }
      let d = o?.catchHandler;
      return (
        h instanceof Promise &&
          (this._catchHandler || d) &&
          (h = h.catch(async (f) => {
            if (d)
              try {
                return await d.handle({ url: s, request: e, event: t, params: n });
              } catch (b) {
                b instanceof Error && (f = b);
              }
            if (this._catchHandler)
              return this._catchHandler.handle({ url: s, request: e, event: t });
            throw f;
          })),
        h
      );
    }
    findMatchingRoute({ url: e, sameOrigin: t, request: s, event: a }) {
      let n = this._routes.get(s.method) || [];
      for (let o of n) {
        let i,
          c = o.match({ url: e, sameOrigin: t, request: s, event: a });
        if (c)
          return (
            (i = c),
            ((Array.isArray(i) && i.length === 0) ||
              (c.constructor === Object && Object.keys(c).length === 0) ||
              typeof c == 'boolean') &&
              (i = void 0),
            { route: o, params: i }
          );
      }
      return {};
    }
  };
function Ot(r) {
  return r.pathname === '/api' || r.pathname.startsWith('/api/');
}
function At(r) {
  return (
    r.pathname === '/auth' || r.pathname.startsWith('/auth/') || r.pathname.startsWith('/api/auth/')
  );
}
function Ut(r) {
  return r.pathname.startsWith('/_next/static/');
}
function kt(r) {
  return r.pathname === '/_next/image';
}
function Pt(r) {
  return /\/storage\/v1\/object\/(?:sign|public)\/food-thumbnails\//.test(r.pathname);
}
function $t(r) {
  return r.pathname === '/manifest.json' || r.pathname.startsWith('/icons/');
}
function Lt(r, e) {
  return e ? e.mode === 'navigate' || e.destination === 'document' : !1;
}
var je = [
  { id: 'auth', cacheName: null, strategy: 'NetworkOnly', matcher: At },
  { id: 'api', cacheName: null, strategy: 'NetworkOnly', matcher: Ot },
  { id: 'navigation', cacheName: null, strategy: 'NetworkOnly', matcher: Lt },
  { id: 'next-static', cacheName: 'next-static', strategy: 'StaleWhileRevalidate', matcher: Ut },
  {
    id: 'next-image',
    cacheName: 'next-image',
    strategy: 'CacheFirst',
    matcher: kt,
    maxAgeSeconds: 720 * 60 * 60,
    maxEntries: 60,
  },
  {
    id: 'thumbnails',
    cacheName: 'food-thumbnails',
    strategy: 'CacheFirst',
    matcher: Pt,
    maxAgeSeconds: 10080 * 60,
    maxEntries: 200,
  },
  {
    id: 'manifest-icons',
    cacheName: 'manifest-icons',
    strategy: 'CacheFirst',
    matcher: $t,
    maxAgeSeconds: 720 * 60 * 60,
  },
];
var He = 'kalori-offline',
  Ge = '/offline',
  It = je.map((r) => {
    let e = ({ url: a, request: n }) => r.matcher(a, n),
      t = {};
    (r.maxAgeSeconds !== void 0 && (t.maxAgeSeconds = r.maxAgeSeconds),
      r.maxEntries !== void 0 && (t.maxEntries = r.maxEntries));
    let s = Object.keys(t).length > 0 ? [new W(t)] : [];
    switch (r.strategy) {
      case 'NetworkOnly':
        return { matcher: e, handler: new R() };
      case 'StaleWhileRevalidate':
        return { matcher: e, handler: new j({ cacheName: r.cacheName ?? r.id, plugins: s }) };
      case 'CacheFirst':
        return { matcher: e, handler: new K({ cacheName: r.cacheName ?? r.id, plugins: s }) };
      default:
        return { matcher: e, handler: new R() };
    }
  }),
  Qe = new H({
    precacheEntries: [],
    skipWaiting: !1,
    clientsClaim: !1,
    navigationPreload: !0,
    runtimeCaching: It,
  });
self.addEventListener('install', (r) => {
  r.waitUntil(
    (async () => {
      try {
        await (await caches.open(He)).add(new Request(Ge, { cache: 'reload' }));
      } catch {}
    })(),
  );
});
Qe.setCatchHandler(async ({ request: r }) => {
  if (r.destination === 'document') {
    let t = await (await caches.open(He)).match(Ge);
    if (t) return t;
  }
  return Response.error();
});
Qe.addEventListeners();
//# sourceMappingURL=sw.js.map
