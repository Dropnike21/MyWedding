import { plannerFirestore } from "./planner-firestore.js?v=20261124-finance-camera1";
import { createFinance } from "./finance-ui.js?v=20261124-finance-camera1";
import { financeTotals, balanceOf, itemsOf, stageOf } from "./finance-model.js?v=20261124-finance-camera1";
import { callWeddingFunction } from "./firebase-services.js?v=20261119-guestdetails1";
(() => {
"use strict";

const STORAGE_KEY = "mywedding_planner_demo_v2";
const VERSION = 2;
const root = document.getElementById("planner-workspace");
if (!root) return;

const money = new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",maximumFractionDigits:0});
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch]));
const uid = prefix => prefix + "-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now()+"-"+Math.random().toString(36).slice(2));
const todayISO = () => new Date().toISOString().slice(0,10);

const categories = [
  "Venue + catering","Photo / video","Attire","Bride attire","Groom attire","Rings",
  "Hair + makeup","Civil ceremony + documents","Flowers + decor","Cake / dessert",
  "Invites + stationery","Souvenirs / favors","Gifts","Transport","Accommodation",
  "Food / drinks","Technology / website","Miscellaneous","Contingency"
];

function seed() {
  return {
    version: VERSION,
    settings: {
      date: "",
      budget: 0,
      venue: "",
      ceremony: "Civil wedding",
      city: "",
      guestTarget: 0,
      guestCameraEnabled: false,
      rsvpMode: "Both",
      guestGuide: {
        attire: "",
        whatToWear: "",
        whatToBring: "",
        preparation: "",
        arrival: "",
        venueInstructions: "",
        transportParking: "",
        reminders: "",
        contact: ""
      },
      gardenSavingsTarget: 0,
      gardenSavingsSaved: 0,
      gardenSavingsNotes: "",
      notes: ""
    },
    budgetCategories: [
      {id:"b1",name:"Venue + catering",allocated:0},
      {id:"b2",name:"Photo / video",allocated:0},
      {id:"b3",name:"Attire",allocated:0},
      {id:"b4",name:"Hair + makeup",allocated:0},
      {id:"b5",name:"Civil ceremony + documents",allocated:0},
      {id:"b6",name:"Flowers + decor",allocated:0},
      {id:"b7",name:"Cake",allocated:0},
      {id:"b8",name:"Invites + stationery",allocated:0},
      {id:"b9",name:"Transport",allocated:0},
      {id:"b10",name:"Contingency",allocated:0},
      {id:"b11",name:"Bride attire",allocated:0},
      {id:"b12",name:"Groom attire",allocated:0},
      {id:"b13",name:"Rings",allocated:0},
      {id:"b14",name:"Souvenirs / favors",allocated:0},
      {id:"b15",name:"Gifts",allocated:0},
      {id:"b16",name:"Accommodation",allocated:0},
      {id:"b17",name:"Food / drinks",allocated:0},
      {id:"b18",name:"Technology / website",allocated:0},
      {id:"b19",name:"Miscellaneous",allocated:0}
    ],
    guests: [],
    vendors: [],
    payments: [],
    expenses: [],
    tasks: [],
    timeline: [],
    decisions: [],
    team: []
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const data = JSON.parse(raw);
    if (!data || data.version !== VERSION) return seed();
    if (!Array.isArray(data.expenses)) data.expenses = [];
    if (!Array.isArray(data.budgetCategories)) data.budgetCategories = structuredClone(seed().budgetCategories);
    for (const category of seed().budgetCategories) {
      if (!data.budgetCategories.some(item => item.name === category.name)) {
        data.budgetCategories.push(structuredClone(category));
      }
    }
    return data;
  } catch {
    return seed();
  }
}
let db = plannerFirestore.enabled ? seed() : load();
if (plannerFirestore.enabled) localStorage.removeItem(STORAGE_KEY);
let currentView = "overview";
let selectedId = null;
let search = "";
let showArchived = false;
let recordModalOpen = false;
let savingsModalOpen = false;
let remoteActive = false;
let organizerRole = "local";
let organizerProfile = null;
const finance=createFinance({root,getDb:()=>db,getRole:()=>organizerRole,save:()=>save(),refreshToolbar:()=>updateToolbar(),categories});

function setSyncState(label,bad=false) {
  const mode=document.querySelector(".planner-mode");
  const note=document.querySelector(".planner-toolbar small");
  if(mode){
    mode.innerHTML='<span class="live-dot"></span>'+esc(label);
    mode.classList.toggle("error",bad);
  }
  if(note && remoteActive){
    note.textContent=bad ? "Sync problem — your browser copy is still preserved." :
      "Firebase is the primary planner database. Browser storage is only a local cache.";
  }
}

function save() {
  if(!plannerFirestore.enabled) localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  if(remoteActive){
    setSyncState("SYNCING");
    plannerFirestore.queue(db)
      .then(()=>{
        // Private records may save before the public-safe website projection
        // is publishable. Do not mislabel that as a failed planning write.
        if (plannerFirestore.publicDetailsError) {
          setSyncState("PLANNER SYNCED");
          const note=document.querySelector(".planner-toolbar small");
          if(note) note.textContent="Plan saved. Public wedding details update is pending Firebase rules publication.";
        } else {
          setSyncState("FIREBASE SYNCED");
        }
      })
      .catch(error=>{
        console.error("Planner sync failed",error);
        setSyncState("SYNC ERROR",true);
        alert("Firebase could not confirm that change. It is still visible in this tab, but do not refresh until a later save shows FIREBASE SYNCED.\n\n"+(error?.message||"Unknown sync error"));
      });
  }
}
function active(records) { return (records || []).filter(x => !x.archived); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function dateLabel(v) {
  if (!v) return "—";
  const d = new Date(v+"T00:00:00");
  return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"});
}
function daysToWedding() {
  if (!db.settings.date) return "—";
  const d = new Date(db.settings.date+"T00:00:00+08:00").getTime();
  if (!Number.isFinite(d)) return "—";
  return Math.max(0,Math.ceil((d-Date.now())/86400000));
}
function totalCommitted() {
  return financeTotals(db).committed;
}
function totalPaid() {
  return financeTotals(db).paid;
}
function expenseBalance(item) {
  return balanceOf(db,item);
}
function ensureBudgetCategory(name) {
  if (!name || db.budgetCategories.some(item=>item.name===name)) return;
  if (remoteActive && organizerRole === "coordinator") return;
  db.budgetCategories.push({id:uid("b"),name,allocated:0});
}
function guestSeats() { return active(db.guests).reduce((s,g)=>s+num(g.seats),0); }
function confirmedSeats() { return active(db.guests).filter(g=>g.rsvp==="Yes").reduce((s,g)=>s+num(g.confirmed || g.seats),0); }
function openTasks() { return active(db.tasks).filter(t=>t.status!=="Done").length; }
function overdueTasks() {
  return active(db.tasks).filter(t=>t.status!=="Done" && t.dueDate && t.dueDate<todayISO()).length;
}
function statusBadge(value) {
  const key=String(value||"").toLowerCase().replace(/\s+/g,"-");
  return '<span class="planner-status planner-status-'+esc(key)+'">'+esc(value||"—")+'</span>';
}
function metric(label,value,note="") {
  return '<article class="planner-metric"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></article>';
}
function header(title,sub,actions="") {
  return '<div class="planner-page-head"><div><span class="eyebrow">WEDDING STUDIO</span><h2>'+esc(title)+'</h2><p>'+esc(sub)+'</p></div><div class="planner-page-actions">'+actions+'</div></div>';
}
function empty(message){return '<div class="planner-empty"><strong>Nothing here yet.</strong><p>'+esc(message)+'</p></div>';}

const schemas = {
  guests:{
    title:"Guests & RSVPs",singular:"guest",collection:"guests",
    subtitle:"Keep invitations organized and record attendance manually from your Messenger confirmations.",
    fields:[
      ["name","Guest / family name","text",true],
      ["side","Invited by","select",true,["Angela","Joseph","Shared"]],
      ["seats","Estimated seats","number",true],
      ["rsvp","Attendance","select",true,["Pending","Yes","No","Maybe"]],
      ["confirmed","Confirmed attending","number",false],
      ["relationship","Relationship","select",false,["","Immediate family","Relative","Friend","Coworker","Sponsor","Family group","Other"]],
      ["priority","Priority","select",false,["","Must invite","Preferred","Optional"]],
      ["table","Reception table","text",false],
      ["contact","Contact / Messenger","text",false],
      ["notes","Notes","textarea",false]
    ],
    columns:[["name","Guest"],["side","Side"],["seats","Seats"],["rsvp","Attendance"],["confirmed","Confirmed"]]
  },
  tasks:{
    title:"Wedding Checklist",singular:"task",collection:"tasks",
    subtitle:"Assign actions, priorities and deadlines so nothing important gets lost.",
    fields:[
      ["title","Task","textarea",true],
      ["workstream","Workstream","text",false],
      ["owner","Owner","select",false,["","Angela","Joseph","Both","Other"]],
      ["dueDate","Target date","date",false],
      ["priority","Priority","select",true,["Critical","High","Medium","Low"]],
      ["status","Status","select",true,["Not started","In progress","Waiting","Done"]],
      ["notes","Notes","textarea",false]
    ],
    columns:[["title","Task"],["owner","Owner"],["dueDate","Due"],["priority","Priority"],["status","Status"]]
  },
  timeline:{
    title:"Wedding-day Timeline",singular:"timeline item",collection:"timeline",
    subtitle:"Build the run of show for preparations, ceremony, photos, reception and supplier movements.",
    fields:[
      ["time","Time","time",true],
      ["title","Activity","text",true],
      ["location","Location","text",false],
      ["owner","Lead / owner","text",false],
      ["status","Status","select",true,["Draft","Confirmed","Done"]],
      ["notes","Notes","textarea",false]
    ],
    columns:[["time","Time"],["title","Activity"],["location","Location"],["owner","Lead"],["status","Status"]]
  },
  decisions:{
    title:"Decision Log",singular:"decision",collection:"decisions",
    subtitle:"Track unresolved choices, who owns them, and the final decision once made.",
    fields:[
      ["title","Decision needed","textarea",true],
      ["owner","Owner","select",false,["","Angela","Joseph","Both"]],
      ["dueDate","Decide by","date",false],
      ["status","Status","select",true,["Open","Researching","Decided","Deferred"]],
      ["decision","Final decision","textarea",false],
      ["notes","Notes / rationale","textarea",false]
    ],
    columns:[["title","Decision"],["owner","Owner"],["dueDate","Due"],["status","Status"]]
  },
};

function renderOverview() {
  const committed=totalCommitted(), paid=totalPaid(), remaining=financeTotals(db).planned-committed;
  const recentTasks=active(db.tasks).filter(t=>t.status!=="Done").sort((a,b)=>(a.dueDate||"9999").localeCompare(b.dueDate||"9999")).slice(0,5);
  const decisions=active(db.decisions).filter(d=>d.status!=="Decided").slice(0,4);
  const essentials=itemsOf(db)
    .filter(item=>!["Completed","Cancelled"].includes(stageOf(item)))
    .sort((a,b)=>(a.pickupDate||a.dueDate||"9999").localeCompare(b.pickupDate||b.dueDate||"9999"))
    .slice(0,5);
  root.innerHTML =
    header("Wedding Overview",remoteActive?"A consolidated view of your live Firebase wedding plan.":"A consolidated view of the plans stored in this browser.","<button class='button primary planner-compact' data-new-view='guests'>+ Add guest</button>")+
    '<div class="planner-metrics">'+
      metric("Days to wedding",daysToWedding(),dateLabel(db.settings.date))+
      metric("Estimated seats",guestSeats(),active(db.guests).length+" guest entries")+
      metric("Confirmed seats",confirmedSeats(),active(db.guests).filter(g=>g.rsvp==="Yes").length+" accepted invites")+
      metric("Budget remaining",money.format(remaining),"category allocations less commitments")+
      metric("Amount paid",money.format(paid),"net payments across events")+
      metric("Open tasks",openTasks(),overdueTasks()+" overdue")+
    '</div>'+
    '<div class="planner-overview-grid">'+
      '<section class="planner-card"><div class="planner-card-head"><h3>Next priorities</h3><button data-jump="tasks">View checklist →</button></div>'+
      (recentTasks.length?'<div class="planner-mini-list">'+recentTasks.map(t=>'<button data-open-view="tasks" data-open-id="'+esc(t.id)+'"><span>'+esc(t.title)+'</span><small>'+dateLabel(t.dueDate)+' · '+esc(t.owner||"Unassigned")+'</small>'+statusBadge(t.status)+'</button>').join("")+'</div>':empty("Add your first planning task."))+'</section>'+
      '<section class="planner-card"><div class="planner-card-head"><h3>Open decisions</h3><button data-jump="decisions">Decision log →</button></div>'+
      (decisions.length?'<div class="planner-mini-list">'+decisions.map(d=>'<button data-open-view="decisions" data-open-id="'+esc(d.id)+'"><span>'+esc(d.title)+'</span><small>'+dateLabel(d.dueDate)+'</small>'+statusBadge(d.status)+'</button>').join("")+'</div>':empty("No open decisions."))+'</section>'+
      '<section class="planner-card"><div class="planner-card-head"><h3>Wedding essentials</h3><button data-jump="expenses">Manage expenses →</button></div>'+
      (essentials.length?'<div class="planner-mini-list">'+essentials.map(item=>'<button data-open-view="expenses" data-open-id="'+esc(item.id)+'"><span>'+esc(item.name)+'</span><small>'+esc(item.category)+' · balance '+money.format(expenseBalance(item))+'</small>'+statusBadge(stageOf(item))+'</button>').join("")+'</div>':empty("Add rings, attire, souvenirs and other wedding essentials."))+'</section>'+
      '<section class="planner-card planner-budget-card"><div class="planner-card-head"><h3>Budget position</h3><button data-jump="budget">Open budget →</button></div>'+
      '<div class="planner-budget-lines"><div><span>Planned allocations</span><strong>'+money.format(financeTotals(db).planned)+'</strong></div><div><span>Confirmed commitments</span><strong>'+money.format(committed)+'</strong></div><div><span>Outstanding</span><strong>'+money.format(financeTotals(db).outstanding)+'</strong></div><div><span>Paid so far</span><strong>'+money.format(paid)+'</strong></div></div>'+
      '<div class="planner-progress"><i style="width:'+Math.min(100,Math.max(0,committed/Math.max(1,financeTotals(db).planned)*100))+'%"></i></div></section>'+
      '<section class="planner-card"><div class="planner-card-head"><h3>Wedding setup</h3><button data-jump="settings">Edit setup →</button></div><dl class="planner-definition"><div><dt>Date</dt><dd>'+dateLabel(db.settings.date)+'</dd></div><div><dt>Ceremony</dt><dd>'+esc(db.settings.ceremony||"—")+'</dd></div><div><dt>Venue</dt><dd>'+esc(db.settings.venue||"—")+'</dd></div><div><dt>Budget</dt><dd>'+money.format(db.settings.budget)+'</dd></div></dl></section>'+
    '</div>';
  bindJumps();
}
function bindJumps(){
  root.querySelectorAll("[data-jump]").forEach(b=>b.addEventListener("click",()=>switchPlanner(b.dataset.jump)));
  root.querySelectorAll("[data-new-view]").forEach(b=>b.addEventListener("click",()=>{
    selectedId=null;
    recordModalOpen=true;
    switchPlanner(b.dataset.newView,false);
  }));
  root.querySelectorAll("[data-open-view]").forEach(b=>b.addEventListener("click",()=>{
    selectedId=b.dataset.openId;
    recordModalOpen=true;
    switchPlanner(b.dataset.openView,false);
  }));
}

function renderSettings() {
  root.innerHTML=header("Event Setup","These values drive countdowns and capacity planning. Manage category allocations in Budget & Expenses.")+
  '<div class="planner-card planner-settings-card"><form id="planner-settings-form" class="planner-form-grid">'+
  formField("date","Wedding date","date",db.settings.date,true)+
  formField("budget","Civil wedding budget ceiling (PHP)","number",db.settings.budget,true)+
  formField("guestTarget","Target maximum guests","number",db.settings.guestTarget,false)+
  formField("ceremony","Ceremony / event type","text",db.settings.ceremony,true)+
  formField("venue","Wedding venue","text",db.settings.venue,false)+
  formField("city","City / municipality","text",db.settings.city,false)+
  formField("rsvpMode","Guest confirmation","select",db.settings.rsvpMode||"Both",true,["Both","Messenger only","Website only"])+
  '<div class="planner-field planner-field-wide"><label for="f-notes">Planning notes</label><textarea id="f-notes" name="notes" rows="4">'+esc(db.settings.notes||"")+'</textarea></div>'+
  '<div class="planner-form-actions planner-field-wide"><button class="button primary" type="submit">Save event setup</button><span id="planner-settings-msg"></span></div></form></div>'+
  '<section class="planner-card planner-settings-card"><div class="planner-card-head"><h3>Website Features</h3></div><p>Guest Camera is disabled during the civil wedding. Enable it for the garden wedding when ready. Invitations, RSVP and existing photos are preserved.</p><form id="camera-feature-form"><label><input type="checkbox" id="camera-feature-enabled" '+(db.settings.guestCameraEnabled===true?"checked":"")+'/> Enable Guest Camera</label> <button type="submit" class="button primary planner-compact">Save camera setting</button><p id="camera-feature-status" role="status"></p></form></section>';
  root.querySelector("#camera-feature-form").addEventListener("submit",async e=>{
    e.preventDefault();
    if(organizerRole!=="owner"&&organizerRole!=="local")return;
    const button=e.currentTarget.querySelector("button"), status=root.querySelector("#camera-feature-status"), enabled=root.querySelector("#camera-feature-enabled").checked;
    button.disabled=true;status.textContent="Saving camera setting…";
    db.settings.guestCameraEnabled=enabled;
    try{
      if(remoteActive){await plannerFirestore.queue(db);await plannerFirestore.publishPublicDetails(db.settings);}
      else save();
      status.textContent=enabled?"Camera feature enabled. Invitation-specific access still applies.":"Camera feature disabled. Invitations and existing photos are unchanged.";
      if(remoteActive)setSyncState("FIREBASE SYNCED");
    }catch(error){status.textContent="Camera setting could not be fully published. Retry and verify the deployed Firebase rules and functions.";setSyncState("SYNC ERROR",true);}
    finally{button.disabled=false;}
  });
  root.querySelector("#planner-settings-form").addEventListener("submit",e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    db.settings={...db.settings,date:fd.get("date"),budget:num(fd.get("budget")),guestTarget:num(fd.get("guestTarget")),ceremony:String(fd.get("ceremony")||""),venue:String(fd.get("venue")||""),city:String(fd.get("city")||""),rsvpMode:String(fd.get("rsvpMode")||"Both"),notes:String(fd.get("notes")||"")};save();
    root.querySelector("#planner-settings-msg").textContent=remoteActive?"Saved to Firebase.":"Saved locally.";
    updateToolbar();
  });
}

function renderGuestGuide(){
  const guide=db.settings.guestGuide||{};
  root.innerHTML=header(
    "Guest Guide",
    "Everything invited guests should know before the wedding. These details are published to the private invitation experience."
  )+
  '<section class="planner-card planner-guest-guide-card">'+
    '<form id="planner-guest-guide-form" class="planner-form-grid">'+
      formField("attire","Dress code / attire","textarea",guide.attire||"",false)+
      formField("whatToWear","What to wear","textarea",guide.whatToWear||"",false)+
      formField("whatToBring","What to bring","textarea",guide.whatToBring||"",false)+
      formField("preparation","Things to prepare beforehand","textarea",guide.preparation||"",false)+
      formField("arrival","Arrival time / when to be there","textarea",guide.arrival||"",false)+
      formField("venueInstructions","Venue instructions","textarea",guide.venueInstructions||"",false)+
      formField("transportParking","Parking / transport instructions","textarea",guide.transportParking||"",false)+
      formField("reminders","Important reminders","textarea",guide.reminders||"",false)+
      formField("contact","Who to contact on the day","textarea",guide.contact||"",false)+
      '<div class="planner-form-actions planner-field-wide"><button class="button primary" type="submit">Save guest guide</button><span id="planner-guest-guide-msg"></span></div>'+
    '</form>'+
  '</section>';
  root.querySelector("#planner-guest-guide-form")?.addEventListener("submit",e=>{
    e.preventDefault();
    const fd=new FormData(e.currentTarget);
    db.settings={
      ...db.settings,
      guestGuide:{
        attire:String(fd.get("attire")||"").trim(),
        whatToWear:String(fd.get("whatToWear")||"").trim(),
        whatToBring:String(fd.get("whatToBring")||"").trim(),
        preparation:String(fd.get("preparation")||"").trim(),
        arrival:String(fd.get("arrival")||"").trim(),
        venueInstructions:String(fd.get("venueInstructions")||"").trim(),
        transportParking:String(fd.get("transportParking")||"").trim(),
        reminders:String(fd.get("reminders")||"").trim(),
        contact:String(fd.get("contact")||"").trim()
      }
    };
    save();
    root.querySelector("#planner-guest-guide-msg").textContent=remoteActive?"Saved to Firebase.":"Saved locally.";
    updateToolbar();
  });
}

function formField(name,label,type,value,required=false,options=null) {
  const req=required?" required":"";
  if(type==="select"){
    return '<div class="planner-field"><label for="f-'+name+'">'+esc(label)+(required?' *':'')+'</label><select id="f-'+name+'" name="'+name+'"'+req+'>'+options.map(o=>'<option value="'+esc(o)+'"'+(String(value??"")===String(o)?' selected':'')+'>'+esc(o||"Select…")+'</option>').join("")+'</select></div>';
  }
  if(type==="textarea") return '<div class="planner-field planner-field-wide"><label for="f-'+name+'">'+esc(label)+(required?' *':'')+'</label><textarea id="f-'+name+'" name="'+name+'" rows="3"'+req+'>'+esc(value||"")+'</textarea></div>';
  const extra=type==="number"?' min="0" step="1"':'';
  return '<div class="planner-field"><label for="f-'+name+'">'+esc(label)+(required?' *':'')+'</label><input id="f-'+name+'" name="'+name+'" type="'+type+'" value="'+esc(value??"")+'"'+extra+req+' /></div>';
}

function defaultRecord(view){
  if(view==="guests") return {name:"",side:"Shared",seats:1,rsvp:"Pending",confirmed:0,relationship:"",priority:"",table:"",contact:"",notes:"",archived:false};
  if(view==="vendors") return {name:"",category:categories[0],contact:"",package:"",quote:0,agreed:0,status:"To inquire",reserveBy:"",notes:"",archived:false};
  if(view==="expenses") return {name:"",category:"Rings",forWho:"Both",purchaseType:"Buy",quantity:1,unitCost:0,expectedCost:0,actualCost:0,paid:0,status:"Researching",dueDate:"",pickupDate:"",supplier:"",link:"",notes:"",archived:false};
  if(view==="tasks") return {title:"",workstream:"",owner:"Both",dueDate:"",priority:"Medium",status:"Not started",notes:"",archived:false};
  if(view==="timeline") return {time:"",title:"",location:"",owner:"",status:"Draft",notes:"",archived:false};
  if(view==="decisions") return {title:"",owner:"Both",dueDate:"",status:"Open",decision:"",notes:"",archived:false};
  return {};
}
function recordValue(view,field,val){
  if(["seats","confirmed","quote","agreed","quantity","unitCost","expectedCost","actualCost","paid"].includes(field)) return num(val);
  return String(val??"").trim();
}
function cellValue(field,val,record=null){
  if(field==="balance") return money.format(expenseBalance(record||{}));
  if(["quote","agreed","amount","unitCost","expectedCost","actualCost","paid"].includes(field)) return money.format(num(val));
  if(["dueDate","reserveBy","pickupDate"].includes(field)) return dateLabel(val);
  if(["status","rsvp","priority"].includes(field)) return statusBadge(val);
  return esc(val||"—");
}

function renderEntity(view) {
  const schema=schemas[view], allRecords=db[schema.collection]||[];
  const records=showArchived ? allRecords : active(allRecords);
  const selected=allRecords.find(r=>r.id===selectedId)||null;
  const filtered=records.filter(r=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
  const formRec=selected||defaultRecord(view);
  const editorTitle=selected?esc((selected.name||selected.title||selected.role||schema.singular)):"Add "+esc(schema.singular);

  root.innerHTML=header(schema.title,schema.subtitle,
      "<button class='button outlined planner-compact' id='planner-archived-toggle'>"+(showArchived?"Hide archived":"Show archived")+"</button>"+
      "<button class='button primary planner-compact' id='planner-new'>+ New "+esc(schema.singular)+"</button>"+
      (view==="guests"?"<button class='button outlined planner-compact' id='planner-invitation-manage'>Invitations &amp; photo cleanup</button>":""))+
    '<section class="planner-list-card planner-list-card-full"><div class="planner-list-tools"><input type="search" id="planner-search" placeholder="Search '+esc(schema.title.toLowerCase())+'" value="'+esc(search)+'" /><span>'+filtered.length+' active</span></div>'+
      (filtered.length?'<div class="planner-table-wrap"><table class="planner-table"><thead><tr>'+schema.columns.map(c=>'<th>'+esc(c[1])+'</th>').join("")+'</tr></thead><tbody>'+
        filtered.map(r=>'<tr data-record="'+esc(r.id)+'">'+schema.columns.map(c=>'<td>'+cellValue(c[0],r[c[0]],r)+'</td>').join("")+'</tr>').join("")+
      '</tbody></table></div>':empty("Create the first "+schema.singular+" using + New "+schema.singular+"."))+
    '</section>'+
    '<dialog class="planner-record-modal" id="planner-record-modal" aria-labelledby="planner-record-modal-title">'+
      '<section class="planner-editor-card planner-modal-card">'+
        '<div class="planner-editor-head planner-modal-head"><div><span class="eyebrow">'+(selected?'EDIT RECORD':'NEW RECORD')+'</span><h3 id="planner-record-modal-title">'+editorTitle+'</h3></div>'+
          '<div class="planner-modal-head-actions">'+
            (selected?(selected.archived?'<button type="button" class="planner-link-restore" id="planner-restore">Restore</button>':'<button type="button" class="planner-link-danger" id="planner-archive">Archive</button>'):'')+
            '<button type="button" class="planner-modal-close" id="planner-modal-close" aria-label="Close">×</button>'+
          '</div>'+
        '</div>'+
        '<form id="planner-entity-form" class="planner-form-grid">'+schema.fields.map(f=>formField(f[0],f[1],f[2],formRec[f[0]],f[3],f[4])).join("")+
          '<div class="planner-form-actions planner-field-wide"><button class="button primary" type="submit">'+(selected?'Save changes':'Add '+esc(schema.singular))+'</button><button class="button subtle" type="button" id="planner-cancel">Cancel</button></div>'+
        '</form>'+
      '</section>'+
    '</dialog>';

  const modal=root.querySelector("#planner-record-modal");
  const closeModal=()=>{
    recordModalOpen=false;
    selectedId=null;
    if(modal?.open)modal.close();
    renderEntity(view);
  };

  root.querySelector("#planner-new").addEventListener("click",()=>{
    selectedId=null;
    recordModalOpen=true;
    renderEntity(view);
  });
  root.querySelector("#planner-invitation-manage")?.addEventListener("click",()=>switchPlanner("photos"));
  root.querySelector("#planner-archived-toggle").addEventListener("click",()=>{
    showArchived=!showArchived;
    selectedId=null;
    recordModalOpen=false;
    renderEntity(view);
  });
  root.querySelector("#planner-search").addEventListener("input",e=>{
    search=e.target.value;
    renderEntity(view);
    const box=root.querySelector("#planner-search");
    if(box){box.focus();box.setSelectionRange(box.value.length,box.value.length)}
  });
  root.querySelectorAll("[data-record]").forEach(row=>row.addEventListener("click",()=>{
    selectedId=row.dataset.record;
    recordModalOpen=true;
    renderEntity(view);
  }));

  if(modal && recordModalOpen){
    modal.showModal();
    modal.addEventListener("cancel",e=>{e.preventDefault();closeModal()});
    modal.addEventListener("click",e=>{if(e.target===modal)closeModal()});
    root.querySelector("#planner-modal-close")?.addEventListener("click",closeModal);
    root.querySelector("#planner-cancel")?.addEventListener("click",closeModal);
  }

  root.querySelector("#planner-entity-form")?.addEventListener("submit",e=>{
    e.preventDefault();if(!e.currentTarget.reportValidity())return;
    const fd=new FormData(e.currentTarget), record={...(selected||defaultRecord(view))};
    schema.fields.forEach(f=>record[f[0]]=recordValue(view,f[0],fd.get(f[0])));
    if(view==="guests"){
      record.seats=Math.max(1,num(record.seats));
      record.confirmed=record.rsvp==="Yes"?Math.min(record.seats,Math.max(1,num(record.confirmed||record.seats))):0;
    }
    if(view==="expenses"){
      record.quantity=Math.max(1,num(record.quantity)||1);
      record.unitCost=Math.max(0,num(record.unitCost));
      record.expectedCost=Math.max(0,num(record.expectedCost));
      if(!record.expectedCost && record.unitCost) record.expectedCost=record.quantity*record.unitCost;
      record.actualCost=Math.max(0,num(record.actualCost));
      record.paid=Math.max(0,num(record.paid));
      ensureBudgetCategory(record.category);
    }
    if(selected){
      if(selected.archived)return;
      Object.assign(selected,record);
    }else{
      record.id=uid(view.slice(0,2));
      db[schema.collection].push(record);
    }
    recordModalOpen=false;
    selectedId=null;
    save();
    renderEntity(view);
    updateToolbar();
  });

  const archive=root.querySelector("#planner-archive");
  if(archive) archive.addEventListener("click",()=>{
    if(!confirm("Archive this "+schema.singular+"? It will be excluded from active summaries but kept in the exported backup."))return;
    selected.archived=true;
    recordModalOpen=false;
    selectedId=null;
    save();
    renderEntity(view);
    updateToolbar();
  });
  const restore=root.querySelector("#planner-restore");
  if(restore) restore.addEventListener("click",()=>{
    selected.archived=false;
    recordModalOpen=false;
    selectedId=null;
    save();
    renderEntity(view);
    updateToolbar();
  });
  if(selected?.archived){
    root.querySelectorAll("#planner-entity-form input,#planner-entity-form select,#planner-entity-form textarea,#planner-entity-form button").forEach(x=>x.disabled=true);
  }
}
// Firebase callable failures are often generic in a mobile browser.
function invitationServiceError(error, service = "invitation service") {
  const code=String(error?.code || "unknown").replace(/^functions\//,"").toLowerCase();
  const message=String(error?.message || "").trim();
  const hint=message && !/^(internal|0|unknown)$/i.test(message)
    ? " "+message : "";
  if(code==="internal" || code==="not-found" || code==="unavailable" ||
     code==="unknown" || message==="0") {
    return "The Firebase "+service+" is unavailable or failed on the server ("+
      code+"). Check Firebase Console > Functions in asia-southeast1 for the "+
      "deployed function and inspect its logs. GitHub Pages does not deploy Firebase Functions."+hint;
  }
  if(code==="unauthenticated" || code==="permission-denied")
    return "Firebase did not authorize the "+service+" request ("+code+
      "). Sign in as a verified wedding owner. If this persists after the latest Functions deployment, check the Cloud Run/Functions invocation permissions."+hint;
  if(code==="failed-precondition")
    return "The "+service+" needs additional Firebase or Google Drive setup ("+
      code+")."+hint;
  if(code==="already-exists")
    return "This guest already has an invitation. Use Regenerate link instead.";
  return "The "+service+" failed ("+code+")."+(hint||" Please inspect Firebase Functions logs.");
}

let issuedInvitationLink="";
let issuedInvitationMessage="";
function guestInvitationUrl(code) {
  return window.location.origin+window.location.pathname+"#camera/"+String(code);
}
function invitationManagerCard() {
  if(organizerRole!=="owner")return "";
  const guests=active(db.guests);
  return '<section class="planner-invitation-card" aria-labelledby="invitation-manager-title">'+
    '<span class="eyebrow">GUEST INVITATIONS · OWNER ACCESS</span>'+
    '<h3 id="invitation-manager-title">Invitation links &amp; camera access</h3>'+
    '<p>Create a guest under <strong>Guests &amp; RSVPs</strong>, then select them here to issue a real invitation link. '+
    'The camera can be opened or closed separately for each invitation, without a time limit. '+
    'Issued links and Messenger messages can be reopened and copied again from the invitation list.</p>'+
    '<label for="invitation-guest-select">Saved guest or family</label>'+
    '<select id="invitation-guest-select" class="planner-invite-select">'+
      '<option value="">Choose a saved guest</option>'+
      guests.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.name)+" · "+esc(g.seats)+" seats</option>").join("")+
    '</select>'+
    '<div class="planner-invitation-actions">'+
      '<button class="button primary" type="button" id="invitation-create"'+(!guests.length?" disabled":"")+'>Generate invitation link</button>'+
      '<button class="button outlined" type="button" id="invitation-refresh">Refresh invitations</button>'+
    '</div>'+
    '<p id="invitation-manager-status" class="planner-invitation-status" role="status" aria-live="polite">'+
      'Only verified owners can issue links or remove guests. Guest verification uses Firebase.</p>'+
    '<div id="invitation-generated-link" class="planner-invitation-link" hidden>'+
      '<label for="invitation-link-value">Private invitation link</label>'+
      '<input type="text" id="invitation-link-value" readonly autocomplete="off" />'+
      '<label for="invitation-message-value">Messenger message</label>'+
      '<textarea id="invitation-message-value" rows="10" readonly></textarea>'+
      '<div class="planner-invitation-actions">'+
        '<button type="button" class="button outlined" id="invitation-copy-message">Copy Messenger message</button>'+
        '<button type="button" class="button outlined" id="invitation-copy">Copy link only</button>'+
        '<a class="button primary" id="invitation-open" target="_blank" rel="noopener noreferrer">Open guest invitation</a>'+
      '</div>'+
    '</div>'+
    '<div class="planner-invitation-list" id="invitation-list" aria-live="polite">Loading issued invitations…</div>'+
  '</section>';
}
function bindInvitationManager() {
  const panel=root.querySelector("#invitation-list");
  const status=root.querySelector("#invitation-manager-status");
  if(!panel||!status)return;
  let busy=false;
  const run=async(name,data)=> (await callWeddingFunction(name)(data)).data||{};
  const setBusy=value=>{
    busy=value;
    for(const button of root.querySelectorAll("#invitation-create,#invitation-refresh,[data-invitation-action]"))
      button.disabled=value;
  };
  const invitationMessage=(guest,link)=>{
    const date=db.settings.date?dateLabel(db.settings.date):"Date to be confirmed";
    const ceremony=String(db.settings.ceremony||"Civil wedding").trim()||"Civil wedding";
    const venue=String(db.settings.venue||"Venue to be confirmed").trim()||"Venue to be confirmed";
    const city=String(db.settings.city||"Location to be confirmed").trim()||"Location to be confirmed";
    const seats=Math.max(1,Number(guest?.seats)||1);
    const mode=String(db.settings.rsvpMode||"Both");
    const confirmation=mode==="Website only"
      ? "Please open the link and confirm your attendance on the invitation page."
      : mode==="Messenger only"
        ? "Please reply to this Messenger conversation to confirm if you can attend and how many of the reserved seats you will use."
        : "You can confirm on the invitation page, or simply reply here in Messenger with whether you can attend and how many reserved seats you will use.";
    return [
      "Hi "+(guest?.name||"there")+"!",
      "",
      "Angela & Joseph would love to invite you to our "+ceremony.toLowerCase()+".",
      "",
      "Date: "+date,
      "Ceremony: "+ceremony,
      "Venue: "+venue,
      "Location: "+city,
      "Seats reserved: "+seats,
      "",
      "Open this private link for the full wedding guide — attire, what to bring, preparation, venue instructions, reminders — and your wedding-camera pass:",
      link,
      "",
      confirmation,
      "",
      "Thank you — we hope to celebrate with you. 🤍"
    ].join("\n");
  };
  const copyText=async(value,fallbackSelector="")=>{
    if(!value)return false;
    try{
      await navigator.clipboard.writeText(value);
      return true;
    }catch{
      const fallback=fallbackSelector?root.querySelector(fallbackSelector):null;
      if(fallback?.select)fallback.select();
      return false;
    }
  };
  const displayLink=(code,guest)=>{
    issuedInvitationLink=guestInvitationUrl(code);
    issuedInvitationMessage=invitationMessage(guest,issuedInvitationLink);
    const output=root.querySelector("#invitation-link-value");
    if(output)output.value=issuedInvitationLink;
    const message=root.querySelector("#invitation-message-value");
    if(message)message.value=issuedInvitationMessage;
    const anchor=root.querySelector("#invitation-open");
    if(anchor)anchor.href=issuedInvitationLink;
    const area=root.querySelector("#invitation-generated-link");
    if(area)area.hidden=false;
  };
  const refresh=async()=>{
    const result=await run("listInvitations",{});
    const invitations=result.items||[];
    if(!invitations.length){panel.innerHTML='<p class="planner-muted">No invitations issued yet.</p>';return;}
    panel.innerHTML='<div class="planner-table-wrap"><table class="planner-table">'+
      '<thead><tr><th>Guest / family</th><th>Seats</th><th>Attendance</th><th>Film</th><th>Camera</th><th>Actions</th></tr></thead><tbody>'+
      invitations.map(item=>{const linked=db.guests.find(g=>g.id===item.sourceGuestId);const attendance=linked?.rsvp||"Pending";const confirmed=Number(linked?.confirmed||0);return '<tr><td>'+esc(item.partyLabel)+
        (item.status==="deleting"?' · DELETION PENDING':'')+
        '</td><td>'+esc(item.invitedSeats)+'</td><td>'+esc(attendance)+
        ((attendance==="Yes")?" · "+esc(confirmed)+"/"+esc(item.invitedSeats):"")+
        '</td><td>'+esc(item.photosUsed)+' / '+esc(item.photoLimit)+
        '</td><td>'+esc(item.cameraAccessEnabled?"Open":"Closed")+
        '</td><td><div class="planner-invite-actions">'+
        (item.status==="active"
          ? (item.code
              ? '<button type="button" data-invitation-action="copy-link" data-invitation-id="'+esc(item.id)+'">Copy link</button>'+
                '<button type="button" data-invitation-action="copy-message" data-invitation-id="'+esc(item.id)+'">Copy Messenger message</button>'+
                '<button type="button" data-invitation-action="open" data-invitation-id="'+esc(item.id)+'">Open invitation</button>'
              : '')+
            '<button type="button" data-invitation-action="camera" data-invitation-id="'+esc(item.id)+'">'+
              (item.cameraAccessEnabled?"Close camera":"Open camera")+'</button>'+
            '<button type="button" data-invitation-action="rotate" data-invitation-id="'+esc(item.id)+'">Regenerate link</button>'
          : "")+
        '<button type="button" class="planner-link-danger" data-invitation-action="delete" data-invitation-id="'+esc(item.id)+'">Delete guest &amp; photos</button>'+
        '</div></td></tr>'}).join("")+
      '</tbody></table></div>';
    panel.querySelectorAll("[data-invitation-action]").forEach(button=>{
      button.addEventListener("click",async()=>{
        if(busy)return;
        const item=invitations.find(x=>x.id===button.dataset.invitationId);
        if(!item)return;
        const action=button.dataset.invitationAction;
        const actionLabel=action==="camera"?(item.cameraAccessEnabled?"close":"open"):
          action==="rotate"?"regenerate":action==="copy-link"?"copy link":
          action==="copy-message"?"copy message":action==="open"?"open":"delete";
        if(action==="copy-link" || action==="copy-message" || action==="open"){
          if(!item.code){
            status.textContent="This older invitation cannot be copied from the owner list. Use Regenerate link once, then future copies will remain available.";
            return;
          }
          const guest=db.guests.find(g=>g.id===item.sourceGuestId)||{name:item.partyLabel,seats:item.invitedSeats};
          const link=guestInvitationUrl(item.code);
          if(action==="open"){
            window.open(link,"_blank","noopener,noreferrer");
            status.textContent="Opened "+item.partyLabel+"'s current invitation.";
            return;
          }
          const value=action==="copy-link"?link:invitationMessage(guest,link);
          const copied=await copyText(value);
          status.textContent=copied
            ? (action==="copy-link"?"Invitation link copied for ":"Messenger message copied for ")+item.partyLabel+"."
            : "Your browser blocked automatic copying. Open the invitation panel and copy it manually.";
          return;
        }
        if(action==="delete"){
          const verified=prompt("Permanently delete this invitation, its camera access, BOTH Drive photo copies, the Sheet log rows and its linked planning guest? Type DELETE to confirm: "+
            item.partyLabel);
          if(verified!=="DELETE")return;
        }else if(action==="rotate" && !confirm("Replace the previous invitation link for "+item.partyLabel+"? The old link will stop working."))return;
        setBusy(true);
        status.textContent="Processing "+actionLabel+" for "+item.partyLabel+"…";
        try{
          if(action==="camera"){
            await run("setInvitationCameraAccess",{
              invitationId:item.id,enabled:!item.cameraAccessEnabled
            });
            status.textContent="Camera "+(item.cameraAccessEnabled?"closed":"opened")+
              " for "+item.partyLabel+".";
          }else if(action==="rotate"){
            const result=await run("rotateInvitation",{invitationId:item.id});
            displayLink(result.code,db.guests.find(g=>g.id===item.sourceGuestId)||{name:item.partyLabel,seats:item.invitedSeats});
            status.textContent="New invitation link issued and saved for future resends. The old code is invalid.";
          }else{
            await run("deleteInvitationAndPhotos",{invitationId:item.id});
            if(item.sourceGuestId){
              const exists=db.guests.some(g=>g.id===item.sourceGuestId);
              if(exists){
                db.guests=db.guests.filter(g=>g.id!==item.sourceGuestId);
                save();
              }
            }
            issuedInvitationLink="";
            const area=root.querySelector("#invitation-generated-link");
            if(area)area.hidden=true;
            status.textContent="Invitation, associated Drive photos, Sheet audit rows and linked planning guest permanently removed.";
          }
          await refresh();
        }catch(error){
          status.textContent="Could not complete "+actionLabel+": "+
            invitationServiceError(error,"invitation service")+
            (action==="delete" ? " If deletion failed, access remains revoked and you can retry." : "");
        }finally{setBusy(false);}
      });
    });
  };
  root.querySelector("#invitation-create")?.addEventListener("click",async()=>{
    if(busy)return;
    const selected=root.querySelector("#invitation-guest-select")?.value;
    const guest=active(db.guests).find(g=>g.id===selected);
    if(!guest){status.textContent="Select a saved guest first.";return;}
    setBusy(true);status.textContent="Issuing a private link for "+guest.name+"…";
    try{
      // Ensure the new saved guest exists in Firebase before linking their
      // code, avoiding a race with a just-submitted Guests & RSVPs form.
      if(remoteActive)await plannerFirestore.queue(db);
      const issued=await run("createInvitation",{
        partyLabel:guest.name,side:guest.side||"Shared",
        invitedSeats:Math.min(30,Math.max(1,Number(guest.seats)||1)),
        notes:"",rsvp:"Pending",sourceGuestId:guest.id
      });
      displayLink(issued.code,guest);
      try {
        await run("setInvitationCameraAccess",{
          invitationId:issued.invitationId,enabled:true
        });
        status.textContent="Invitation link ready and saved for future resends. Camera enabled for this guest until you close or delete it.";
      }catch(error){
        status.textContent="Invitation created, but camera access could not be enabled: "+
          invitationServiceError(error,"camera access")+
          " Copy the link, then use Open camera in the invitation list.";
      }
      await refresh();
    }catch(error){status.textContent="Invitation creation failed: "+
      invitationServiceError(error,"invitation creation");}
    finally{setBusy(false);}
  });
  root.querySelector("#invitation-refresh")?.addEventListener("click",()=>{
    refresh().catch(error=>{status.textContent="Could not load invitations: "+
      invitationServiceError(error,"invitation list");});
  });
  root.querySelector("#invitation-copy-message")?.addEventListener("click",async()=>{
    if(!issuedInvitationMessage)return;
    const copied=await copyText(issuedInvitationMessage,"#invitation-message-value");
    status.textContent=copied
      ?"Messenger message copied. Paste it into your PM conversation with the guest."
      :"Copy the selected Messenger message using your browser.";
  });
  root.querySelector("#invitation-copy")?.addEventListener("click",async()=>{
    if(!issuedInvitationLink)return;
    const copied=await copyText(issuedInvitationLink,"#invitation-link-value");
    status.textContent=copied
      ?"Invitation link copied. It can be opened on another phone."
      :"Copy the selected link using your browser.";
  });
  refresh().catch(error=>{
    panel.textContent="Invitation list unavailable. Open Firebase Console > Functions to verify deployment.";
    status.textContent=invitationServiceError(error,"invitation list");
  });
}

async function renderPhotoArchive() {
  root.innerHTML = header(
    "Guest Photo Archive",
    "Owner-only view of guest-camera uploads. The protected Google Sheet is an audit mirror; manage the archive here."
  ) + invitationManagerCard()+
    '<div class="planner-card"><div class="planner-loading-state">Loading private photo archive…</div></div>';


  const token = window.WeddingUI?.begin(
    "Loading photo archive…",
    "Reading secure upload metadata from Firebase.",
    { blocking: false, delay: 160 }
  );

  try {
    const statusFn = callWeddingFunction("driveStorageStatus");
    const listFn = callWeddingFunction("listPhotoUploads");
    // The private Drive status and Firestore photo index are independent.
    // A Drive OAuth issue must not hide otherwise accessible photo records.
    const [statusResult, listResult] = await Promise.allSettled([
      statusFn({}),
      listFn({ limit: 300 }),
    ]);
    const storageReady=statusResult.status==="fulfilled";
    const archiveReady=listResult.status==="fulfilled";
    const storage = storageReady ? (statusResult.value.data || {}) : {};
    const items = archiveReady ? (listResult.value.data?.items || []) : [];
    const issues=[];
    if(!storageReady)issues.push(
      "Drive storage: "+invitationServiceError(statusResult.reason,"Google Drive connection"));
    if(!archiveReady)issues.push(
      "Photo records: "+invitationServiceError(listResult.reason,"photo archive"));
    const onlyDriveSetupIssue=!storageReady && archiveReady;
    const issuesHtml=issues.length
      ? '<section class="planner-card '+(onlyDriveSetupIssue?"planner-warning-card":"planner-error-card")+'"><h3>'+
          (onlyDriveSetupIssue?"Photo storage setup needed":"Backend services need attention")+'</h3>'+
          issues.map(message=>'<p>'+esc(message)+'</p>').join("")+
          '<p>'+(onlyDriveSetupIssue
            ?"Invitations, guest records and attendance can still work while Google Drive photo storage is being configured."
            :"Check Cloud Functions in project mywedding-1ad09 (asia-southeast1). This does not mean your existing photos or guest records were deleted.")+'</p>'+
        '</section>'
      : '';
    const rawBytes = items.reduce((sum,item)=>sum+num(item.rawBytes),0);
    const wmBytes = items.reduce((sum,item)=>sum+num(item.watermarkedBytes),0);
    const uniquePasses = new Set(items.map(item=>item.invitationId).filter(Boolean)).size;
    const realFrames=items.length;
    const mb = value => (value/1024/1024).toFixed(1)+" MB";

    root.innerHTML = header(
      "Guest Photo Archive",
      "Owner-only guest-camera archive. Google Drive stores the files; Firebase and the website remain the management layer.",
      '<button class="button outlined planner-compact" id="photo-refresh">Refresh</button>'
    ) + invitationManagerCard()+issuesHtml+
    (archiveReady ? '<div class="planner-metrics compact">'+
      metric("Real frames",realFrames,"Finalized guest uploads")+
      metric("Invitation passes",uniquePasses,"Unique guest/family codes")+
      metric("RAW storage",mb(rawBytes),"Clean archival originals")+
      metric("Wedding copies",mb(wmBytes),"Filtered + watermarked")+
    '</div>' : '')+
    (storageReady ? '<div class="planner-budget-layout">'+
      '<section class="planner-card"><div class="planner-card-head"><h3>Private storage</h3><span>'+(storage.connected?"Connected":"Needs setup")+'</span></div>'+
      '<div class="planner-definition">'+
        '<div><dt>Parent folder</dt><dd>'+esc(storage.parent?.name||"Guest Photos")+'</dd></div>'+
        '<div><dt>RAW folder</dt><dd>'+esc(storage.raw?.name||"RAW")+'</dd></div>'+
        '<div><dt>Wedding copies</dt><dd>'+esc(storage.watermarked?.name||"WATERMARKED")+'</dd></div>'+
        '<div><dt>Audit sheet</dt><dd>'+esc(storage.sheet?.properties?.title||"Photo Index")+'</dd></div>'+
      '</div></section>'+
      '<section class="planner-card"><div class="planner-card-head"><h3>Archive policy</h3><span>Website managed</span></div>'+
      '<p class="planner-muted">The Google Sheet is protected against accidental manual edits during the wedding. After the wedding, its protection can be removed and it can become a normal editable archive.</p>'+
      '</section>'+
    '</div>' : '')+
    (archiveReady ? '<section class="planner-list-card"><div class="planner-list-tools"><strong>Latest frames</strong><span>'+items.length+' loaded</span></div>'+
      (items.length?'<div class="planner-table-wrap"><table class="planner-table"><thead><tr><th>Frame</th><th>Guest / party</th><th>Captured</th><th>Format</th><th>Effect</th><th>Archive</th></tr></thead><tbody>'+
        items.map(item=>'<tr><td>#'+String(item.frameNumber||0).padStart(2,"0")+'</td><td>'+esc(item.partyLabel||"Invitation")+'</td><td>'+esc(item.capturedAt?new Date(item.capturedAt).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"}):"—")+'</td><td>'+esc((item.orientation||"")+" · "+(item.camera||""))+'</td><td>'+esc(item.effect||"Natural")+'</td><td>'+statusBadge(item.sheetLogged?"Logged":"Sheet pending")+'</td></tr>').join("")+
      '</tbody></table></div>':empty("No guest-camera frames have been finalized yet."))+
    '</section>' : '');

    root.querySelector("#photo-refresh")?.addEventListener("click",renderPhotoArchive);
    bindInvitationManager();
  } catch(error) {
    console.error("Photo archive load failed",error);
    root.innerHTML = header("Guest Photo Archive","Private Drive archive status.")+
      invitationManagerCard()+
      '<div class="planner-card planner-error-card"><h3>Archive connection needs attention</h3><p>'+
        esc(invitationServiceError(error,"photo archive"))+'</p></div>';
    bindInvitationManager();
  } finally {
    if(token) window.WeddingUI?.end(token);
  }
}

function renderCurrent() {
  selectedId = selectedId && currentView!=="overview" ? selectedId : selectedId;
  if(currentView==="overview")renderOverview();
  else if(currentView==="settings")renderSettings();
  else if(currentView==="guestguide")renderGuestGuide();
  else if(["budget","vendors","expenses"].includes(currentView))finance.open(currentView,selectedId);
  else if(currentView==="photos")renderPhotoArchive();
  else renderEntity(currentView);
}
function switchPlanner(view,clear=true){
  if(!["overview","settings","guestguide","budget","photos","vendors","expenses",...Object.keys(schemas)].includes(view))view="overview";
  if(view==="vendors")view="expenses";
  currentView=view;if(clear){selectedId=null;search="";showArchived=false;recordModalOpen=false;savingsModalOpen=false}
  const navView=(view==="vendors"||view==="expenses")?"budget":view;
  document.querySelectorAll("[data-planner-view]").forEach(button=>{
    const active=button.dataset.plannerView===navView;
    button.classList.toggle("active",active);
    if(active)button.setAttribute("aria-current","page");
    else button.removeAttribute("aria-current");
  });
  const mobileSelector=document.getElementById("planner-mobile-section");
  if(mobileSelector && mobileSelector.value!==navView) mobileSelector.value=navView;
  renderCurrent();
}
document.querySelectorAll("[data-planner-view]").forEach(b=>b.addEventListener("click",()=>switchPlanner(b.dataset.plannerView)));
document.getElementById("planner-mobile-section")?.addEventListener("change",event=>{
  switchPlanner(event.target.value);
});

function updateToolbar(){
  const strong=document.querySelector(".planner-toolbar strong");
  if(strong)strong.textContent="Angela & Joseph · "+dateLabel(db.settings.date);
  // Sync state is changed only when Firebase confirms the write.
}

document.getElementById("planner-export").addEventListener("click",()=>{
  const blob=new Blob([JSON.stringify(db,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="mywedding-planner-backup-"+todayISO()+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),500);
});
document.getElementById("planner-import").addEventListener("click",()=>document.getElementById("planner-import-file").click());
document.getElementById("planner-import-file").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    const parsed=JSON.parse(await file.text());
    if(!parsed||parsed.version!==VERSION||!parsed.settings||!Array.isArray(parsed.guests))throw new Error();
    if(!confirm("Replace this browser's current demo data with the imported backup?"))return;
    db=parsed;save();selectedId=null;search="";renderCurrent();updateToolbar();
  }catch{alert("That file is not a compatible MyWedding planner backup.");}
  e.target.value="";
});
document.getElementById("planner-reset").addEventListener("click",async()=>{
  if(remoteActive){
    if(organizerRole!=="owner")return;
    const verified=prompt(
      "This permanently clears Planning Studio event details, guests, suppliers, expenses, payments, checklist, timeline, decisions and team records. Budget headings stay but reset to ₱0.\n\nType CLEAR to continue."
    );
    if(verified!=="CLEAR")return;
    const button=document.getElementById("planner-reset");
    button.disabled=true;
    const token=window.WeddingUI?.begin(
      "Clearing Planning Studio…",
      "Removing the current Firebase planning records.",
      {blocking:true,delay:100}
    );
    setSyncState("RESETTING");
    try{
      db=await plannerFirestore.reset(seed());
      selectedId=null;search="";showArchived=false;
      switchPlanner("overview");
      updateToolbar();
      setSyncState("FIREBASE SYNCED");
      alert("Planning Studio is clear. You can now enter your wedding details from scratch.");
    }catch(error){
      console.error("Planning Studio reset failed",error);
      setSyncState("RESET ERROR",true);
      alert("Planning Studio could not be cleared. No successful reset was confirmed.\n\n"+(error?.message||"Unknown reset error"));
    }finally{
      button.disabled=organizerRole!=="owner";
      if(token)window.WeddingUI?.end(token);
    }
    return;
  }
  if(!confirm("Clear the local planner data in this browser?"))return;
  db=seed();save();selectedId=null;search="";switchPlanner("overview");updateToolbar();
});

function lockPlanner(message="Sign in with your organizer Google account to open the wedding workspace.", canSignIn=true) {
  remoteActive=false;
  const gate=document.getElementById("planner-access-gate");
  const shell=document.getElementById("planner-secure-shell");
  const button=document.getElementById("planner-firebase-login");
  const copy=document.getElementById("planner-access-message");
  document.getElementById("view-planner")?.classList.remove("planner-authenticated");
  if(shell){
    shell.hidden=true;
    shell.setAttribute("aria-hidden","true");
  }
  if(gate){
    gate.hidden=false;
    gate.removeAttribute("aria-hidden");
  }
  if(copy) copy.textContent=message;
  if(button){
    button.disabled=!canSignIn;
    button.onclick=async()=>{
      button.disabled=true;
      if(copy)copy.textContent="Opening secure Google sign-in…";
      const token=window.WeddingUI?.begin("Signing you in…","Opening secure Google organizer access.",{blocking:true,delay:120});
      try{await plannerFirestore.signIn();}
      catch(error){
        if(copy)copy.textContent=error?.message||"Sign-in failed.";
        button.disabled=false;
      }finally{
        if(token)window.WeddingUI?.end(token);
      }
    };
  }
}

function unlockPlanner() {
  const gate=document.getElementById("planner-access-gate");
  const shell=document.getElementById("planner-secure-shell");
  if(gate){
    gate.hidden=true;
    gate.setAttribute("aria-hidden","true");
  }
  document.getElementById("view-planner")?.classList.add("planner-authenticated");
  if(shell){
    shell.hidden=false;
    shell.removeAttribute("aria-hidden");
    shell.classList.remove("planner-shell-enter");
    void shell.offsetWidth;
    shell.classList.add("planner-shell-enter");
  }
}

function applyRoleUI(role){
  organizerRole=role;
  const hidden=new Set();
  if(role==="coordinator"){hidden.add("settings");hidden.add("guestguide");hidden.add("photos");}
  if(role==="finance"){["settings","guestguide","guests","tasks","timeline","decisions","photos"].forEach(x=>hidden.add(x));}
  document.querySelectorAll("[data-planner-view]").forEach(btn=>{
    btn.hidden=hidden.has(btn.dataset.plannerView);
  });
  document.querySelectorAll("#planner-mobile-section option").forEach(option=>{
    const restricted=hidden.has(option.value);
    option.hidden=restricted;
    option.disabled=restricted;
  });
  let signout=document.getElementById("planner-signout");
  if(!signout){
    signout=document.createElement("button");
    signout.type="button";signout.id="planner-signout";
    signout.className="button outlined planner-compact";
    signout.textContent="Sign out";
    document.querySelector(".planner-toolbar-actions")?.appendChild(signout);
    signout.addEventListener("click",()=>plannerFirestore.signOut());
  }
  signout.hidden=false;
  const reset=document.getElementById("planner-reset");
  if(reset){
    reset.hidden=role!=="owner";
    reset.disabled=role!=="owner";
  }
  const toolbar=document.querySelector(".planner-toolbar strong");
  if(toolbar&&organizerProfile){
    toolbar.textContent="Angela & Joseph · "+dateLabel(db.settings.date)+" · "+(organizerProfile.displayName||organizerProfile.email||role);
  }
}

async function initializePlanner(){
  lockPlanner("Connecting securely to Firebase…",false);

  if(!plannerFirestore.enabled){
    lockPlanner("Firebase planner access is not configured yet. Ask the site owner to finish App Check setup.",false);
    return;
  }

  document.getElementById("planner-import").disabled=true;
  document.getElementById("planner-reset").disabled=true;
  document.querySelector(".planner-toolbar small").textContent="Connecting securely to Firebase…";
  setSyncState("FIREBASE CONNECTING");

  let initialToken=window.WeddingUI?.begin(
    "Connecting Wedding Studio…",
    "Checking your organizer session.",
    {blocking:true,delay:120}
  );

  plannerFirestore.onAuth(async user=>{
    const token=initialToken || window.WeddingUI?.begin(
      user?"Loading wedding plan…":"Updating organizer session…",
      user?"Reading the latest Firebase planning records.":"Checking sign-in status.",
      {blocking:Boolean(user),delay:160}
    );
    initialToken=null;

    if(!user){
      organizerProfile=null;organizerRole="local";db=seed();localStorage.removeItem(STORAGE_KEY);
      document.getElementById("planner-signout")?.remove();
      setSyncState("SIGN-IN REQUIRED");
      lockPlanner("Sign in with an authorized organizer Google account to open the wedding workspace.",true);
      if(token)window.WeddingUI?.end(token);
      return;
    }
    try{
      if(token)window.WeddingUI?.update(token,"Loading wedding plan…","Reading guests, expenses, suppliers, payments and tasks in parallel.");
      organizerProfile=await plannerFirestore.organizerProfile(user);
      db=await plannerFirestore.load(seed());
      if(!Array.isArray(db.expenses))db.expenses=[];
      const applyCivilWedding=!String(db.settings.ceremony||"").trim();
      if(applyCivilWedding)db.settings.ceremony="Civil wedding";
      localStorage.removeItem(STORAGE_KEY);
      remoteActive=true;
      if(applyCivilWedding)plannerFirestore.queue(db).catch(error=>console.warn("Could not save civil-wedding default:",error?.code||error));
      applyRoleUI(organizerProfile.role);
      selectedId=null;search="";showArchived=false;
      updateToolbar();
      unlockPlanner();
      switchPlanner("overview");
    }catch(error){
      console.error(error);
      await plannerFirestore.signOut().catch(()=>{});
      lockPlanner(error?.message||"This account cannot access the wedding planner.",true);
    }finally{
      if(token)window.WeddingUI?.end(token);
    }
  });
}

initializePlanner();
})();