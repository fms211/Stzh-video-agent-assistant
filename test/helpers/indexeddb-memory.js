"use strict";

// 内存 IndexedDB shim（node:test 专用；无 fake-indexeddb 依赖）
// 实现最低可用子集：openDB/objectStore/createIndex/get/put/delete/clear + structuredClone 值语义。
// 不支持游标遍历（store 用索引 get 与 getAll 的最小子集；list 用 map 过滤）。

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

class MemoryIndex {
  constructor(name, keyPath) {
    this.name = name;
    this.keyPath = keyPath;
  }
}

class MemoryObjectStore {
  constructor(name, keyPath, indexes) {
    this.name = name;
    this.keyPath = keyPath;
    this.indexes = indexes || [];
    this.records = new Map(); // key -> value（结构复制）
  }

  put(value) {
    const key = value[this.keyPath];
    this.records.set(String(key), clone(value));
    return Promise.resolve(key);
  }

  get(key) {
    const record = this.records.get(String(key));
    return Promise.resolve(record ? clone(record) : undefined);
  }

  delete(key) {
    this.records.delete(String(key));
    return Promise.resolve(undefined);
  }

  clear() {
    this.records.clear();
    return Promise.resolve(undefined);
  }

  getAll() {
    return Promise.resolve([...this.records.values()].map(clone));
  }
}

class MemoryTransaction {
  constructor(db) {
    this.db = db;
  }

  objectStore(name) {
    const store = this.db.stores.get(name);
    if (!store) throw new Error(`store not found: ${name}`);
    return store;
  }
}

class MemoryDatabase {
  constructor(name) {
    this.name = name;
    this.stores = new Map();
    this.version = 1;
    this.onversionchange = null;
  }

  createObjectStore(name, options) {
    const store = new MemoryObjectStore(name, options && options.keyPath);
    this.stores.set(name, store);
    return store;
  }

  transaction(_stores, _mode) {
    return new MemoryTransaction(this);
  }

  close() {
    if (typeof this.onversionchange === "function") {
      // 模拟 IDB 语义（不实际触发，仅保留接口）
    }
  }
}

export function createMemoryFactory() {
  const databases = new Map();
  return {
    open(name) {
      let db = databases.get(name);
      if (!db) {
        db = new MemoryDatabase(name);
        databases.set(name, db);
      }
      // 模拟真实 IDB 的 onupgradeneeded：首次打开时创建 wallpapers store + by-owner 索引
      if (!db.stores.has("wallpapers")) {
        db.version = 1;
        db.createObjectStore("wallpapers", { keyPath: "id" });
        const store = db.stores.get("wallpapers");
        if (store) {
          store.indexes.push(new MemoryIndex("by-owner", "ownerScope"));
        }
      }
      return Promise.resolve({ db, version: db.version });
    },
    getDatabase(name) {
      return databases.get(name) || null;
    },
    has(name) {
      return databases.has(name);
    },
  };
}
