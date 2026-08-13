"use strict";
/* ============ Хранилище прогресса ============
   В браузере — localStorage. Внутри Telegram — CloudStorage: он привязан
   к аккаунту, поэтому серия и XP одни и те же на телефоне и на компе,
   и никакого сервера для этого не нужно.

   Ограничения CloudStorage: до 1024 ключей, значение до 4096 символов.
   Прогресс по 2134 вопросам в один ключ не влезает, поэтому режем на шарды
   и храним компактно: "id.box.at.seen.wrong", записи через запятую.        */

// Скрипт telegram-web-app.js создаёт window.Telegram.WebApp и в обычном браузере,
// только с пустым initData и platform === "unknown". Проверять надо платформу,
// иначе в браузере полезем в несуществующий CloudStorage.
const _tgw = window.Telegram && window.Telegram.WebApp;
const TG = _tgw && _tgw.platform && _tgw.platform !== "unknown" ? _tgw : null;

const CHUNK = 3900;          // с запасом под лимит 4096
const K_META = "meta";
const K_DAYS = "days";
const Q_PREFIX = "q";

const Store = {
  inTelegram: !!TG,

  /* ---------- сериализация ---------- */
  packQ(q) {
    const out = [];
    for (const [id, p] of Object.entries(q))
      out.push(`${id}.${p.box || 0}.${p.at || 0}.${p.seen || 0}.${p.wrong || 0}`);
    return out.join(",");
  },
  unpackQ(str) {
    const q = {};
    if (!str) return q;
    for (const rec of str.split(",")) {
      if (!rec) continue;
      const [id, box, at, seen, wrong] = rec.split(".");
      q[id] = { box: +box || 0, at: +at || 0, seen: +seen || 0, wrong: +wrong || 0 };
      q[id].last = q[id].box > 0 ? 1 : 0;
    }
    return q;
  },
  shard(str) {
    const parts = [];
    let buf = "";
    for (const rec of str.split(",")) {
      if (buf.length + rec.length + 1 > CHUNK) { parts.push(buf); buf = ""; }
      buf += (buf ? "," : "") + rec;
    }
    if (buf) parts.push(buf);
    return parts;
  },

  /* ---------- localStorage ---------- */
  loadLocal() {
    try { return JSON.parse(localStorage.getItem("prawko.v2")); } catch (e) { return null; }
  },
  saveLocal(state) {
    try { localStorage.setItem("prawko.v2", JSON.stringify(state)); } catch (e) { /* переполнено */ }
  },

  /* ---------- CloudStorage ---------- */
  cloudGet(keys) {
    return new Promise(res => {
      TG.CloudStorage.getItems(keys, (err, vals) => res(err ? {} : (vals || {})));
    });
  },
  cloudSet(key, value) {
    return new Promise(res => TG.CloudStorage.setItem(key, value, (err) => res(!err)));
  },
  cloudKeys() {
    return new Promise(res => TG.CloudStorage.getKeys((err, keys) => res(err ? [] : (keys || []))));
  },
  cloudRemove(keys) {
    return new Promise(res => TG.CloudStorage.removeItems(keys, () => res(true)));
  },

  async loadCloud() {
    const keys = await this.cloudKeys();
    if (!keys.length) return null;
    const qKeys = keys.filter(k => /^q\d+$/.test(k)).sort(
      (a, b) => +a.slice(1) - +b.slice(1));
    const vals = await this.cloudGet([K_META, K_DAYS, ...qKeys]);
    if (!vals[K_META]) return null;
    let state;
    try { state = JSON.parse(vals[K_META]); } catch (e) { return null; }
    try { state.days = JSON.parse(vals[K_DAYS] || "{}"); } catch (e) { state.days = {}; }
    state.q = this.unpackQ(qKeys.map(k => vals[k] || "").filter(Boolean).join(","));
    return state;
  },

  async saveCloud(state) {
    const { q, days, ...meta } = state;
    await this.cloudSet(K_META, JSON.stringify(meta));
    await this.cloudSet(K_DAYS, JSON.stringify(days || {}));
    const parts = this.shard(this.packQ(q || {}));
    for (let i = 0; i < parts.length; i++) await this.cloudSet(Q_PREFIX + i, parts[i]);
    // подчищаем шарды, оставшиеся от более длинного прошлого состояния
    const stale = (await this.cloudKeys())
      .filter(k => /^q\d+$/.test(k) && +k.slice(1) >= parts.length);
    if (stale.length) await this.cloudRemove(stale);
  },

  /* ---------- публичное ---------- */
  async load() {
    const local = this.loadLocal();
    if (!TG) return local;
    let cloud = null;
    try { cloud = await this.loadCloud(); } catch (e) { cloud = null; }
    if (!cloud) return local;
    if (!local) return cloud;
    // Оба существуют — берём тот, где ответов больше: это и есть «свежее».
    return (cloud.ans || 0) >= (local.ans || 0) ? cloud : local;
  },

  save(state) {
    this.saveLocal(state);                       // локальная копия всегда
    if (!TG) return;
    clearTimeout(this._t);                       // облако — с задержкой, чтобы не спамить
    this._t = setTimeout(() => this.saveCloud(state).catch(() => { }), 1500);
  },
};

// `Storage` — занятое браузером имя (интерфейс Web Storage API),
// присваивание в него молча не срабатывает. Поэтому Store.
window.Store = Store;
window.TG = TG;
