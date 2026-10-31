import { guestAccessConfig } from "./guest-config.js?v=20261031-1935";
import { getWeddingClient, enableAppCheck } from "./firebase-services.js?v=20261031-1935";
import {
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, getDocs, collection, setDoc, writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const WEDDING_ID = "main";
const DEFAULT_OWNER_EMAILS = new Set([
  "babaynike2013@gmail.com",
  "josephsixson@mcstayuman.edu.ph",
]);
const COLLECTIONS = ["guests","vendors","payments","tasks","timeline","decisions","team","budgetCategories"];

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out = {};
    for (const [k,v] of Object.entries(value)) {
      if (v !== undefined) out[k] = sanitize(v);
    }
    return out;
  }
  return value;
}

function stable(value) {
  return JSON.stringify(sanitize(value), Object.keys(sanitize(value)||{}).sort());
}

function collectionMap(data) {
  const map = new Map();
  for (const item of data || []) map.set(item.id, sanitize(item));
  return map;
}

export class PlannerFirestoreStore {
  constructor() {
    this.enabled = Boolean(guestAccessConfig.plannerEnabled && guestAccessConfig.appCheckSiteKey);
    this.role = null;
    this.user = null;
    this.shadow = null;
    this.db = null;
    this.pending = Promise.resolve();
  }

  prepare() {
    if (!this.enabled) return null;
    enableAppCheck();
    const client = getWeddingClient();
    this.db = getFirestore(client.app);
    return client.auth;
  }

  onAuth(callback) {
    const auth = this.prepare();
    if (!auth) return () => {};
    return onAuthStateChanged(auth, callback);
  }

  async signIn() {
    const auth = this.prepare();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    return signInWithPopup(auth, provider);
  }

  async signOut() {
    const auth = this.prepare();
    return signOut(auth);
  }

  async organizerProfile(user) {
    if (!this.db) this.prepare();

    const email = String(user.email || "").toLowerCase();
    if (user.emailVerified && DEFAULT_OWNER_EMAILS.has(email)) {
      this.user = user;
      this.role = "owner";
      return {
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || "Groom / Owner",
        active: true,
        role: "owner",
        defaultOwner: true,
      };
    }

    const snap = await getDoc(doc(this.db,"organizers",user.uid));
    if (!snap.exists()) throw new Error("This Google account is not registered as a wedding organizer.");
    const profile = snap.data();
    if (profile.active !== true) throw new Error("This organizer account is inactive.");
    if (!["owner","coordinator","finance"].includes(profile.role)) throw new Error("This organizer role is invalid.");
    this.user = user;
    this.role = profile.role;
    return { uid:user.uid,email:user.email||"",displayName:user.displayName||"",...profile };
  }

  async load(seedData) {
    if (!this.user) throw new Error("Organizer sign-in required.");
    const weddingRef = doc(this.db,"weddings",WEDDING_ID);
    const weddingSnap = await getDoc(weddingRef);

    if (!weddingSnap.exists()) {
      if (this.role !== "owner") throw new Error("The wedding workspace has not been initialized by an owner yet.");
      await this.initialize(seedData);
      this.shadow = structuredClone(seedData);
      return structuredClone(seedData);
    }

    const base = weddingSnap.data();
    const data = {
      version: seedData.version,
      settings: { ...seedData.settings, ...(base.settings||{}) },
      guests: [], vendors: [], payments: [], tasks: [], timeline: [], decisions: [], team: [],
      budgetCategories: []
    };

    for (const name of COLLECTIONS) {
      const snap = await getDocs(collection(this.db,"weddings",WEDDING_ID,name));
      data[name] = snap.docs.map(x => ({ id:x.id, ...x.data() }))
        .map(({createdAt,updatedAt,...rest})=>rest);
    }

    if (!data.budgetCategories.length) data.budgetCategories = structuredClone(seedData.budgetCategories);
    this.shadow = structuredClone(data);
    return data;
  }

  async initialize(seedData) {
    if (this.role !== "owner") throw new Error("Only the owner can initialize the wedding workspace.");
    const batch = writeBatch(this.db);
    batch.set(doc(this.db,"weddings",WEDDING_ID), {
      settings:sanitize(seedData.settings),
      version:seedData.version,
      createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    });
    for (const name of COLLECTIONS) {
      for (const record of seedData[name] || []) {
        batch.set(doc(this.db,"weddings",WEDDING_ID,name,record.id), {
          ...sanitize(record), createdAt:serverTimestamp(), updatedAt:serverTimestamp()
        });
      }
    }
    batch.set(doc(collection(this.db,"weddings",WEDDING_ID,"audit")), {
      actorUid:this.user.uid, role:this.role, action:"initialize", sections:COLLECTIONS,
      at:serverTimestamp()
    });
    await batch.commit();
  }

  canWriteSection(name) {
    if (this.role === "owner") return true;
    if (this.role === "coordinator") return ["guests","vendors","tasks","timeline","decisions","team"].includes(name);
    if (this.role === "finance") return ["vendors","payments","budgetCategories"].includes(name);
    return false;
  }

  queue(data) {
    const snapshot = structuredClone(data);
    this.pending = this.pending.then(() => this.sync(snapshot));
    return this.pending;
  }

  async sync(data) {
    if (!this.enabled || !this.user || !this.shadow) return;
    const batch = writeBatch(this.db);
    const changed = [];

    if (stable(data.settings) !== stable(this.shadow.settings)) {
      if (this.role !== "owner") throw new Error("Only the owner can edit event setup.");
      batch.set(doc(this.db,"weddings",WEDDING_ID), {
        settings:sanitize(data.settings), version:data.version, updatedAt:serverTimestamp()
      }, {merge:true});
      changed.push("settings");
    }

    for (const name of COLLECTIONS) {
      const before = collectionMap(this.shadow[name]);
      const after = collectionMap(data[name]);
      for (const [id,record] of after) {
        if (stable(record) !== stable(before.get(id))) {
          if (!this.canWriteSection(name)) throw new Error("Your organizer role cannot edit " + name + ".");
          batch.set(doc(this.db,"weddings",WEDDING_ID,name,id), {
            ...sanitize(record),
            updatedAt:serverTimestamp(),
            ...(before.has(id)?{}:{createdAt:serverTimestamp()})
          }, {merge:true});
          if (!changed.includes(name)) changed.push(name);
        }
      }
    }

    if (!changed.length) return;
    batch.set(doc(collection(this.db,"weddings",WEDDING_ID,"audit")), {
      actorUid:this.user.uid, role:this.role, action:"update", sections:changed, at:serverTimestamp()
    });
    await batch.commit();
    this.shadow = structuredClone(data);
  }
}

export const plannerFirestore = new PlannerFirestoreStore();
