import { guestAccessConfig } from "./guest-config.js?v=20261119-guestdetails1";
import { getWeddingClient, enableAppCheck } from "./firebase-services.js?v=20261119-guestdetails1";
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
  "nungaygela@gmail.com",
]);
const COLLECTIONS = ["guests","vendors","expenses","payments","tasks","timeline","decisions","team","budgetCategories"];

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

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
}

function stable(value) {
  return JSON.stringify(canonical(sanitize(value)));
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
    this.publicDetailsError = null;
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
        displayName: user.displayName || "Wedding Owner",
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
      guests: [], vendors: [], expenses: [], payments: [], tasks: [], timeline: [], decisions: [], team: [],
      budgetCategories: []
    };

    const collectionSnaps = await Promise.all(
      COLLECTIONS.map(name =>
        getDocs(collection(this.db,"weddings",WEDDING_ID,name))
          .then(snap => [name,snap])
          .catch(error => {
            // Expenses is a newly introduced collection. During rollout, let
            // older published rules keep the rest of Wedding Studio usable.
            if (name === "expenses" && String(error?.code || "").includes("permission-denied")) {
              console.warn("Wedding Expenses rules are not published yet.");
              return [name,null];
            }
            throw error;
          })
      )
    );
    for (const [name,snap] of collectionSnaps) {
      data[name] = snap
        ? snap.docs.map(x => ({ id:x.id, ...x.data() }))
            .map(({createdAt,updatedAt,...rest})=>rest)
            .filter(record => record.cleared !== true)
        : [];
    }

    if (!data.budgetCategories.length) data.budgetCategories = structuredClone(seedData.budgetCategories);
    this.shadow = structuredClone(data);
    // Keep the published, non-private date in sync on owner login.
    // This is deliberately best-effort: a missing published rule must not
    // block the private planner from loading.
    if (this.role === "owner") {
      this.publishPublicDetails(data.settings).catch(error=>{
        this.publicDetailsError = error;
        console.warn("Public wedding details are pending publication:",error?.code || error);
      });
    }
    return data;
  }

  publicProjection(settings) {
    const date=String(settings?.date || "").trim();
    if (date && !/^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(date))
      throw new Error("Select a valid wedding date before publishing public details.");
    const rawMode=String(settings?.rsvpMode || "Both");
    const rsvpMode=["Both","Messenger only","Website only"].includes(rawMode)?rawMode:"Both";
    const sourceGuide=settings?.guestGuide || {};
    const guideText=key=>String(sourceGuide[key] || "").trim().slice(0,1200);
    const guestGuide={
      attire:guideText("attire"),
      whatToWear:guideText("whatToWear"),
      whatToBring:guideText("whatToBring"),
      preparation:guideText("preparation"),
      arrival:guideText("arrival"),
      venueInstructions:guideText("venueInstructions"),
      transportParking:guideText("transportParking"),
      reminders:guideText("reminders"),
      contact:guideText("contact"),
    };
    return {
      date,
      dateTentative:true,
      ceremony:String(settings?.ceremony || "").trim().slice(0,80),
      venueName:String(settings?.venue || "").trim().slice(0,120),
      city:String(settings?.city || "").trim().slice(0,120),
      venueTentative:true,
      rsvpMode,
      guestGuide,
    };
  }

  async publishPublicDetails(settings) {
    if (this.role !== "owner" || !this.db || !this.user) return false;
    const details=this.publicProjection(settings);
    const ref=doc(this.db,"publicWeddingDetails","current");
    const snap=await getDoc(ref);
    if (snap.exists() && Object.keys(details).every(key=>stable(snap.data()[key]) === stable(details[key]))) {
      this.publicDetailsError=null;
      return true;
    }
    await setDoc(ref,{...details,updatedAt:serverTimestamp()});
    this.publicDetailsError=null;
    return true;
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
    this.publishPublicDetails(seedData.settings).catch(error=>{
      this.publicDetailsError=error;
      console.warn("Public wedding details are pending publication:",error?.code || error);
    });
  }

  async reset(seedData) {
    if (this.role !== "owner" || !this.db || !this.user) {
      throw new Error("Only a signed-in wedding owner can clear Planning Studio.");
    }

    const blank = structuredClone(seedData);
    const snapshots = await Promise.all(
      COLLECTIONS.map(name => getDocs(collection(this.db,"weddings",WEDDING_ID,name)))
    );
    const refs = snapshots.flatMap(snapshot => snapshot.docs.map(item => item.ref));

    // Firestore batches support at most 500 writes. Keep reset batches below
    // that limit so a large guest list can still be cleared safely.
    for (let i=0; i<refs.length; i+=400) {
      const chunk = refs.slice(i,i+400);
      const deleteBatch = writeBatch(this.db);
      for (const ref of chunk) deleteBatch.delete(ref);
      try {
        await deleteBatch.commit();
      } catch(error) {
        // Older live rules denied deletes. Replace each document with a
        // content-free tombstone instead; load() filters these records out.
        if (!String(error?.code || "").includes("permission-denied")) throw error;
        const clearBatch = writeBatch(this.db);
        for (const ref of chunk) {
          clearBatch.set(ref, {
            cleared:true,
            archived:true,
            updatedAt:serverTimestamp()
          });
        }
        await clearBatch.commit();
      }
    }

    const batch = writeBatch(this.db);
    batch.set(doc(this.db,"weddings",WEDDING_ID), {
      settings:sanitize(blank.settings),
      version:blank.version,
      updatedAt:serverTimestamp()
    }, {merge:true});

    // Keep the standard budget headings, but reset every allocation to zero.
    for (const record of blank.budgetCategories || []) {
      batch.set(doc(this.db,"weddings",WEDDING_ID,"budgetCategories",record.id), {
        ...sanitize(record),
        createdAt:serverTimestamp(),
        updatedAt:serverTimestamp()
      });
    }

    batch.set(doc(collection(this.db,"weddings",WEDDING_ID,"audit")), {
      actorUid:this.user.uid,
      role:this.role,
      action:"reset",
      sections:["settings",...COLLECTIONS],
      at:serverTimestamp()
    });
    await batch.commit();

    this.shadow = structuredClone(blank);
    this.publicDetailsError = null;
    return structuredClone(blank);
  }

  canWriteSection(name) {
    if (this.role === "owner") return true;
    if (this.role === "coordinator") return ["guests","vendors","expenses","tasks","timeline","decisions","team"].includes(name);
    if (this.role === "finance") return ["vendors","expenses","payments","budgetCategories"].includes(name);
    return false;
  }

  queue(data) {
    const snapshot = structuredClone(data);
    this.pending = this.pending
      .catch(() => {})
      .then(() => this.sync(snapshot));
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
    if (changed.includes("settings") && this.role === "owner") {
      try {
        await this.publishPublicDetails(data.settings);
      } catch(error) {
        this.publicDetailsError=error;
        console.warn("Planner saved, but public date/venue has not published:",error?.code || error);
      }
    }
  }
}

export const plannerFirestore = new PlannerFirestoreStore();
