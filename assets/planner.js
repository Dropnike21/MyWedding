import { plannerFirestore } from "./planner-firestore.js?v=20261031-2115";
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
      date: "2027-02-23",
      budget: 70000,
      venue: "Estoria",
      ceremony: "Civil wedding",
      city: "",
      guestTarget: 50,
      notes: "Tentative wedding date and venue. Confirm before issuing final invitations."
    },
    budgetCategories: [
      {id:"b1",name:"Venue + catering",allocated:38000},
      {id:"b2",name:"Photo / video",allocated:7000},
      {id:"b3",name:"Attire",allocated:6000},
      {id:"b4",name:"Hair + makeup",allocated:4000},
      {id:"b5",name:"Civil ceremony + documents",allocated:3000},
      {id:"b6",name:"Flowers + decor",allocated:3000},
      {id:"b7",name:"Cake",allocated:2000},
      {id:"b8",name:"Invites + stationery",allocated:1000},
      {id:"b9",name:"Transport",allocated:1000},
      {id:"b10",name:"Contingency",allocated:5000},
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
    vendors: [
      {id:"v-estoria",name:"Estoria (tentative)",category:"Venue + catering",contact:"",package:"",quote:0,agreed:0,status:"To inquire",reserveBy:"",notes:"Confirm February 23, 2027 availability, capacity, inclusions, taxes, overtime and rain backup.",archived:false}
    ],
    payments: [],
    expenses: [],
    tasks: [
      {id:"t1",title:"Confirm wedding date and ceremony city / municipality",workstream:"Core decisions",owner:"Both",dueDate:"2026-11-15",priority:"Critical",status:"Not started",notes:"Date is tentative until venue and ceremony arrangements are accepted.",archived:false},
      {id:"t2",title:"Confirm Estoria availability, pricing and inclusions",workstream:"Venue",owner:"Both",dueDate:"2026-11-15",priority:"Critical",status:"Not started",notes:"Ask about capacity, catering, taxes, corkage, overtime and weather backup.",archived:false},
      {id:"t3",title:"Finalize estimated guest count",workstream:"Guests",owner:"Both",dueDate:"2026-11-20",priority:"High",status:"Not started",notes:"Group/family entries need actual seat estimates.",archived:false},
      {id:"t4",title:"Verify civil wedding requirements and local registrar",workstream:"Documents",owner:"Both",dueDate:"2026-11-25",priority:"Critical",status:"Not started",notes:"Confirm requirements directly with the appropriate local civil registrar.",archived:false},
      {id:"t5",title:"Collect written supplier quotations",workstream:"Suppliers",owner:"Both",dueDate:"2026-12-01",priority:"High",status:"Not started",notes:"Record total price, inclusions, deposit, due dates and cancellation terms.",archived:false}
    ],
    timeline: [
      {id:"tl1",time:"08:00",title:"Preparation begins",location:"TBD",owner:"Both",status:"Draft",notes:"Hair, makeup, attire and detail photos.",archived:false},
      {id:"tl2",time:"11:00",title:"Civil ceremony",location:"TBD",owner:"Both",status:"Draft",notes:"Placeholder until ceremony schedule is confirmed.",archived:false},
      {id:"tl3",time:"12:30",title:"Reception / lunch",location:"Estoria (tentative)",owner:"Coordinator",status:"Draft",notes:"Timing depends on ceremony location and travel.",archived:false}
    ],
    decisions: [
      {id:"d1",title:"Confirm final wedding date",owner:"Both",dueDate:"2026-11-15",status:"Open",decision:"",notes:"Tentative: February 23, 2027.",archived:false},
      {id:"d2",title:"Confirm ceremony city / municipality",owner:"Both",dueDate:"2026-11-15",status:"Open",decision:"",notes:"Needed for civil wedding requirements.",archived:false},
      {id:"d3",title:"Set maximum guest headcount",owner:"Both",dueDate:"2026-11-20",status:"Open",decision:"",notes:"Must fit the ₱70,000 total budget.",archived:false}
    ],
    team: [
      {id:"team1",name:"Angela",role:"Bride / planner",contact:"",status:"Active",notes:"",archived:false},
      {id:"team2",name:"Joseph",role:"Groom / planner",contact:"",status:"Active",notes:"",archived:false}
    ]
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
let remoteActive = false;
let organizerRole = "local";
let organizerProfile = null;

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
      .then(()=>setSyncState("FIREBASE SYNCED"))
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
  const d = new Date(db.settings.date+"T00:00:00+08:00").getTime();
  return Math.max(0,Math.ceil((d-Date.now())/86400000));
}
function paymentTotal(status) {
  return active(db.payments).filter(p => !status || p.status===status).reduce((s,p)=>s+num(p.amount),0);
}
function vendorCommitted() {
  return active(db.vendors).reduce((s,v)=>s+num(v.agreed),0);
}
function expenseCommitted() {
  return active(db.expenses).reduce((sum,item)=>sum+num(item.actualCost || item.expectedCost),0);
}
function expensePaidTotal() {
  return active(db.expenses).reduce((sum,item)=>sum+num(item.paid),0);
}
function totalCommitted() {
  return vendorCommitted()+expenseCommitted();
}
function totalPaid() {
  return paymentTotal("Paid")+expensePaidTotal();
}
function expenseBalance(item) {
  return Math.max(0,num(item.actualCost || item.expectedCost)-num(item.paid));
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
    subtitle:"Keep individual and family invitations organized before secure invitation links go live.",
    fields:[
      ["name","Guest / family name","text",true],
      ["side","Invited by","select",true,["Angela","Joseph","Shared"]],
      ["seats","Estimated seats","number",true],
      ["rsvp","RSVP","select",true,["Pending","Yes","No","Maybe"]],
      ["confirmed","Confirmed attending","number",false],
      ["relationship","Relationship","select",false,["","Immediate family","Relative","Friend","Coworker","Sponsor","Family group","Other"]],
      ["priority","Priority","select",false,["","Must invite","Preferred","Optional"]],
      ["table","Reception table","text",false],
      ["contact","Contact / Messenger","text",false],
      ["notes","Notes","textarea",false]
    ],
    columns:[["name","Guest"],["side","Side"],["seats","Seats"],["rsvp","RSVP"],["confirmed","Confirmed"]]
  },
  vendors:{
    title:"Suppliers & Bookings",singular:"supplier",collection:"vendors",
    subtitle:"Compare quotations, record commitments, and keep booking details together.",
    fields:[
      ["name","Supplier / business","text",true],
      ["category","Budget category","select",true,categories],
      ["contact","Contact","text",false],
      ["package","Package / inclusions","textarea",false],
      ["quote","Quotation (PHP)","number",false],
      ["agreed","Agreed cost (PHP)","number",false],
      ["status","Booking status","select",true,["To inquire","Quoted","Considering","Booked","Cancelled"]],
      ["reserveBy","Reserve / decide by","date",false],
      ["notes","Notes","textarea",false]
    ],
    columns:[["name","Supplier"],["category","Category"],["quote","Quote"],["agreed","Agreed"],["status","Status"]]
  },
  expenses:{
    title:"Wedding Expenses",singular:"expense",collection:"expenses",
    subtitle:"Track personal purchases, wedding essentials, favors, attire, rings, legal fees and other non-supplier spending.",
    fields:[
      ["name","Item / expense","text",true],
      ["category","Budget category","select",true,categories],
      ["forWho","For","select",false,["","Angela","Joseph","Both","Guests","Wedding day","Other"]],
      ["purchaseType","Purchase type","select",false,["","Buy","Rent","Borrow","DIY","Service","Other"]],
      ["quantity","Quantity","number",false],
      ["unitCost","Unit cost (PHP)","number",false],
      ["expectedCost","Expected total (PHP)","number",false],
      ["actualCost","Actual total (PHP)","number",false],
      ["paid","Paid so far (PHP)","number",false],
      ["status","Status","select",true,["Researching","Chosen","Ordered","Partially paid","Paid","Received","Cancelled"]],
      ["dueDate","Payment / order due","date",false],
      ["pickupDate","Pickup / delivery","date",false],
      ["supplier","Store / seller","text",false],
      ["link","Product / reference link","url",false],
      ["notes","Notes","textarea",false]
    ],
    columns:[["name","Item"],["category","Category"],["forWho","For"],["expectedCost","Expected"],["actualCost","Actual"],["paid","Paid"],["balance","Balance"],["status","Status"]]
  },
  tasks:{
    title:"Wedding Checklist",singular:"task",collection:"tasks",
    subtitle:"Assign actions, priorities and deadlines so nothing important gets lost.",
    fields:[
      ["title","Task","textarea",true],
      ["workstream","Workstream","text",false],
      ["owner","Owner","select",false,["","Angela","Joseph","Both","Coordinator","Other"]],
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
      ["owner","Owner","select",false,["","Angela","Joseph","Both","Coordinator"]],
      ["dueDate","Decide by","date",false],
      ["status","Status","select",true,["Open","Researching","Decided","Deferred"]],
      ["decision","Final decision","textarea",false],
      ["notes","Notes / rationale","textarea",false]
    ],
    columns:[["title","Decision"],["owner","Owner"],["dueDate","Due"],["status","Status"]]
  },
  team:{
    title:"Coordinator Team",singular:"team member",collection:"team",
    subtitle:"Keep responsibilities and contact information for the people helping run the wedding.",
    fields:[
      ["name","Name","text",true],
      ["role","Role / responsibility","text",true],
      ["contact","Contact","text",false],
      ["status","Status","select",true,["Active","Backup","Confirmed","Unavailable"]],
      ["notes","Notes","textarea",false]
    ],
    columns:[["name","Name"],["role","Role"],["contact","Contact"],["status","Status"]]
  }
};

function renderOverview() {
  const supplierCommitted=vendorCommitted(), personalCommitted=expenseCommitted();
  const committed=totalCommitted(), paid=totalPaid(), remaining=num(db.settings.budget)-committed;
  const recentTasks=active(db.tasks).filter(t=>t.status!=="Done").sort((a,b)=>(a.dueDate||"9999").localeCompare(b.dueDate||"9999")).slice(0,5);
  const decisions=active(db.decisions).filter(d=>d.status!=="Decided").slice(0,4);
  const essentials=active(db.expenses)
    .filter(item=>!["Received","Cancelled"].includes(item.status))
    .sort((a,b)=>(a.pickupDate||a.dueDate||"9999").localeCompare(b.pickupDate||b.dueDate||"9999"))
    .slice(0,5);
  root.innerHTML =
    header("Wedding Overview",remoteActive?"A consolidated view of your live Firebase wedding plan.":"A consolidated view of the plans stored in this browser.","<button class='button primary planner-compact' data-jump='guests'>+ Add guest</button>")+
    '<div class="planner-metrics">'+
      metric("Days to wedding",daysToWedding(),dateLabel(db.settings.date))+
      metric("Estimated seats",guestSeats(),active(db.guests).length+" guest entries")+
      metric("Confirmed seats",confirmedSeats(),active(db.guests).filter(g=>g.rsvp==="Yes").length+" accepted invites")+
      metric("Budget remaining",money.format(remaining),"suppliers + wedding expenses")+
      metric("Amount paid",money.format(paid),"supplier payments + direct expenses")+
      metric("Open tasks",openTasks(),overdueTasks()+" overdue")+
    '</div>'+
    '<div class="planner-overview-grid">'+
      '<section class="planner-card"><div class="planner-card-head"><h3>Next priorities</h3><button data-jump="tasks">View checklist →</button></div>'+
      (recentTasks.length?'<div class="planner-mini-list">'+recentTasks.map(t=>'<button data-open-view="tasks" data-open-id="'+esc(t.id)+'"><span>'+esc(t.title)+'</span><small>'+dateLabel(t.dueDate)+' · '+esc(t.owner||"Unassigned")+'</small>'+statusBadge(t.status)+'</button>').join("")+'</div>':empty("Add your first planning task."))+'</section>'+
      '<section class="planner-card"><div class="planner-card-head"><h3>Open decisions</h3><button data-jump="decisions">Decision log →</button></div>'+
      (decisions.length?'<div class="planner-mini-list">'+decisions.map(d=>'<button data-open-view="decisions" data-open-id="'+esc(d.id)+'"><span>'+esc(d.title)+'</span><small>'+dateLabel(d.dueDate)+'</small>'+statusBadge(d.status)+'</button>').join("")+'</div>':empty("No open decisions."))+'</section>'+
      '<section class="planner-card"><div class="planner-card-head"><h3>Wedding essentials</h3><button data-jump="expenses">Manage expenses →</button></div>'+
      (essentials.length?'<div class="planner-mini-list">'+essentials.map(item=>'<button data-open-view="expenses" data-open-id="'+esc(item.id)+'"><span>'+esc(item.name)+'</span><small>'+esc(item.category)+' · balance '+money.format(expenseBalance(item))+'</small>'+statusBadge(item.status)+'</button>').join("")+'</div>':empty("Add rings, attire, souvenirs and other wedding essentials."))+'</section>'+
      '<section class="planner-card planner-budget-card"><div class="planner-card-head"><h3>Budget position</h3><button data-jump="budget">Open budget →</button></div>'+
      '<div class="planner-budget-lines"><div><span>Total budget</span><strong>'+money.format(db.settings.budget)+'</strong></div><div><span>Suppliers</span><strong>'+money.format(supplierCommitted)+'</strong></div><div><span>Wedding expenses</span><strong>'+money.format(personalCommitted)+'</strong></div><div><span>Paid so far</span><strong>'+money.format(paid)+'</strong></div></div>'+
      '<div class="planner-progress"><i style="width:'+Math.min(100,Math.max(0,committed/Math.max(1,num(db.settings.budget))*100))+'%"></i></div></section>'+
      '<section class="planner-card"><div class="planner-card-head"><h3>Wedding setup</h3><button data-jump="settings">Edit setup →</button></div><dl class="planner-definition"><div><dt>Date</dt><dd>'+dateLabel(db.settings.date)+'</dd></div><div><dt>Ceremony</dt><dd>'+esc(db.settings.ceremony||"—")+'</dd></div><div><dt>Venue</dt><dd>'+esc(db.settings.venue||"—")+'</dd></div><div><dt>Budget</dt><dd>'+money.format(db.settings.budget)+'</dd></div></dl></section>'+
    '</div>';
  bindJumps();
}
function bindJumps(){
  root.querySelectorAll("[data-jump]").forEach(b=>b.addEventListener("click",()=>switchPlanner(b.dataset.jump)));
  root.querySelectorAll("[data-open-view]").forEach(b=>b.addEventListener("click",()=>{selectedId=b.dataset.openId;switchPlanner(b.dataset.openView,false);}));
}

function renderSettings() {
  root.innerHTML=header("Event Setup","These values drive countdowns, capacity planning and budget summaries.")+
  '<div class="planner-card planner-settings-card"><form id="planner-settings-form" class="planner-form-grid">'+
  formField("date","Wedding date","date",db.settings.date,true)+
  formField("budget","Total budget (PHP)","number",db.settings.budget,true)+
  formField("guestTarget","Target maximum guests","number",db.settings.guestTarget,false)+
  formField("ceremony","Ceremony type","text",db.settings.ceremony,false)+
  formField("venue","Reception venue","text",db.settings.venue,false)+
  formField("city","Ceremony city / municipality","text",db.settings.city,false)+
  '<div class="planner-field planner-field-wide"><label for="f-notes">Planning notes</label><textarea id="f-notes" name="notes" rows="4">'+esc(db.settings.notes||"")+'</textarea></div>'+
  '<div class="planner-form-actions planner-field-wide"><button class="button primary" type="submit">Save event setup</button><span id="planner-settings-msg"></span></div></form></div>';
  root.querySelector("#planner-settings-form").addEventListener("submit",e=>{
    e.preventDefault();const fd=new FormData(e.currentTarget);
    db.settings={...db.settings,date:fd.get("date"),budget:num(fd.get("budget")),guestTarget:num(fd.get("guestTarget")),ceremony:String(fd.get("ceremony")||""),venue:String(fd.get("venue")||""),city:String(fd.get("city")||""),notes:String(fd.get("notes")||"")};save();
    root.querySelector("#planner-settings-msg").textContent=remoteActive?"Saved to Firebase.":"Saved locally.";
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
  if(view==="team") return {name:"",role:"",contact:"",status:"Active",notes:"",archived:false};
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
  root.innerHTML=header(schema.title,schema.subtitle,
      "<button class='button outlined planner-compact' id='planner-archived-toggle'>"+(showArchived?"Hide archived":"Show archived")+"</button>"+
      "<button class='button primary planner-compact' id='planner-new'>+ New "+esc(schema.singular)+"</button>")+
    '<div class="planner-split">'+
      '<section class="planner-list-card"><div class="planner-list-tools"><input type="search" id="planner-search" placeholder="Search '+esc(schema.title.toLowerCase())+'" value="'+esc(search)+'" /><span>'+filtered.length+' active</span></div>'+
      (filtered.length?'<div class="planner-table-wrap"><table class="planner-table"><thead><tr>'+schema.columns.map(c=>'<th>'+esc(c[1])+'</th>').join("")+'</tr></thead><tbody>'+
        filtered.map(r=>'<tr data-record="'+esc(r.id)+'" class="'+(selectedId===r.id?'selected':'')+'">'+schema.columns.map(c=>'<td>'+cellValue(c[0],r[c[0]],r)+'</td>').join("")+'</tr>').join("")+
      '</tbody></table></div>':empty("Create the first "+schema.singular+" using the form."))+
      '</section>'+
      '<section class="planner-editor-card"><div class="planner-editor-head"><div><span class="eyebrow">'+(selected?'EDIT RECORD':'NEW RECORD')+'</span><h3>'+(selected?esc((selected.name||selected.title||selected.role||schema.singular)):"Add "+esc(schema.singular))+'</h3></div>'+(selected?(selected.archived?'<button type="button" class="planner-link-restore" id="planner-restore">Restore</button>':'<button type="button" class="planner-link-danger" id="planner-archive">Archive</button>'):'')+'</div>'+
      '<form id="planner-entity-form" class="planner-form-grid">'+schema.fields.map(f=>formField(f[0],f[1],f[2],formRec[f[0]],f[3],f[4])).join("")+
      '<div class="planner-form-actions planner-field-wide"><button class="button primary" type="submit">'+(selected?'Save changes':'Add '+esc(schema.singular))+'</button><button class="button subtle" type="button" id="planner-cancel">Clear</button><span id="planner-entity-msg"></span></div></form></section>'+
    '</div>';
  root.querySelector("#planner-new").addEventListener("click",()=>{selectedId=null;renderEntity(view)});
  root.querySelector("#planner-archived-toggle").addEventListener("click",()=>{showArchived=!showArchived;selectedId=null;renderEntity(view)});
  root.querySelector("#planner-cancel").addEventListener("click",()=>{selectedId=null;renderEntity(view)});
  root.querySelector("#planner-search").addEventListener("input",e=>{
    search=e.target.value;renderEntity(view);
    const box=root.querySelector("#planner-search");if(box){box.focus();box.setSelectionRange(box.value.length,box.value.length)}
  });
  root.querySelectorAll("[data-record]").forEach(row=>row.addEventListener("click",()=>{selectedId=row.dataset.record;renderEntity(view)}));
  root.querySelector("#planner-entity-form").addEventListener("submit",e=>{
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
    if(selected){if(selected.archived)return;Object.assign(selected,record)}else{record.id=uid(view.slice(0,2));db[schema.collection].push(record);selectedId=record.id}
    save();renderEntity(view);updateToolbar();
    const msg=root.querySelector("#planner-entity-msg");if(msg)msg.textContent=remoteActive?"Saved to Firebase.":"Saved locally.";
  });
  const archive=root.querySelector("#planner-archive");
  if(archive) archive.addEventListener("click",()=>{
    if(!confirm("Archive this "+schema.singular+"? It will be excluded from active summaries but kept in the exported backup."))return;
    selected.archived=true;selectedId=null;save();renderEntity(view);updateToolbar();
  });
  const restore=root.querySelector("#planner-restore");
  if(restore) restore.addEventListener("click",()=>{
    selected.archived=false;save();renderEntity(view);updateToolbar();
  });
  if(selected?.archived){
    root.querySelectorAll("#planner-entity-form input,#planner-entity-form select,#planner-entity-form textarea,#planner-entity-form button").forEach(x=>x.disabled=true);
  }
}

function renderBudget() {
  const vendorOptions=active(db.vendors);
  const filtered=active(db.payments).filter(p=>JSON.stringify(p).toLowerCase().includes(search.toLowerCase()));
  const selected=active(db.payments).find(p=>p.id===selectedId)||null;
  const p=selected||{vendorId:"",description:"",amount:0,dueDate:"",status:"Planned",paidDate:"",method:"",notes:"",archived:false};
  const expenseOptions=active(db.expenses);
  const allocated=db.budgetCategories.reduce((s,c)=>s+num(c.allocated),0);
  const supplierCommitted=vendorCommitted(), personalCommitted=expenseCommitted();
  const committed=totalCommitted(), paid=totalPaid();
  root.innerHTML=header("Budget & Payments","Category caps, supplier payments, and direct wedding expenses roll into one financial position.")+
    '<div class="planner-metrics compact">'+metric("Total budget",money.format(db.settings.budget),"Event setup")+metric("Allocated",money.format(allocated),(allocated===num(db.settings.budget)?"Balanced":"Difference "+money.format(db.settings.budget-allocated)))+metric("Committed",money.format(committed),"Suppliers + wedding expenses")+metric("Paid",money.format(paid),"All recorded spending")+'</div>'+
    '<div class="planner-budget-layout"><section class="planner-card"><div class="planner-card-head"><h3>Category allocation</h3><span>Editable</span></div><div class="planner-allocation-list">'+
      db.budgetCategories.map(c=>'<label><span>'+esc(c.name)+'</span><input type="number" min="0" step="500" value="'+num(c.allocated)+'" data-budget-id="'+esc(c.id)+'" /></label>').join("")+
      '</div><div class="planner-allocation-total"><span>Allocation total</span><strong>'+money.format(allocated)+'</strong></div></section>'+
      '<section class="planner-card"><div class="planner-card-head"><h3>Commitments</h3><span>'+money.format(committed)+'</span></div>'+
        '<div class="planner-budget-lines"><div><span>Suppliers</span><strong>'+money.format(supplierCommitted)+'</strong></div><div><span>Wedding expenses</span><strong>'+money.format(personalCommitted)+'</strong></div></div>'+
        '<div class="planner-card-head planner-subhead"><h3>Wedding expenses</h3><button data-jump="expenses">Manage expenses →</button></div><div class="planner-mini-list">'+
        (expenseOptions.length?expenseOptions.slice(0,6).map(x=>'<button data-open-view="expenses" data-open-id="'+esc(x.id)+'"><span>'+esc(x.name)+'</span><small>'+esc(x.category)+'</small><strong>'+money.format(x.actualCost||x.expectedCost)+'</strong></button>').join(""):'<p>No direct wedding expenses yet.</p>')+
      '</div></section></div>'+
    '<div class="planner-split planner-payments-split"><section class="planner-list-card"><div class="planner-list-tools"><input type="search" id="planner-search" placeholder="Search payments" value="'+esc(search)+'" /><span>'+filtered.length+' transactions</span></div>'+
      (filtered.length?'<div class="planner-table-wrap"><table class="planner-table"><thead><tr><th>Payment</th><th>Supplier</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead><tbody>'+
      filtered.map(x=>{const v=vendorOptions.find(v=>v.id===x.vendorId);return '<tr data-payment="'+esc(x.id)+'" class="'+(selectedId===x.id?'selected':'')+'"><td>'+esc(x.description)+'</td><td>'+esc(v?.name||"—")+'</td><td>'+money.format(x.amount)+'</td><td>'+dateLabel(x.dueDate)+'</td><td>'+statusBadge(x.status)+'</td></tr>'}).join("")+'</tbody></table></div>':empty("Record deposits and balances here."))+'</section>'+
    '<section class="planner-editor-card"><div class="planner-editor-head"><div><span class="eyebrow">'+(selected?'EDIT PAYMENT':'NEW PAYMENT')+'</span><h3>'+(selected?esc(selected.description):"Record payment")+'</h3></div>'+(selected?'<button type="button" class="planner-link-danger" id="planner-archive">Archive</button>':'')+'</div>'+
    '<form id="planner-payment-form" class="planner-form-grid">'+
      formField("vendorId","Supplier","select",p.vendorId,true,[...vendorOptions.map(v=>v.id)])+
      formField("description","Description","text",p.description,true)+formField("amount","Amount (PHP)","number",p.amount,true)+
      formField("dueDate","Due date","date",p.dueDate,false)+formField("status","Status","select",p.status,true,["Planned","Due","Paid","Cancelled"])+
      formField("paidDate","Paid date","date",p.paidDate,false)+formField("method","Method","select",p.method,false,["","Cash","Bank transfer","GCash","Maya","Card","Other"])+
      formField("notes","Notes","textarea",p.notes,false)+
      '<div class="planner-form-actions planner-field-wide"><button class="button primary" type="submit">'+(selected?"Save payment":"Add payment")+'</button><button class="button subtle" id="planner-cancel" type="button">Clear</button></div></form></section></div>';
  // Replace vendor IDs shown in select with names without changing values.
  const select=root.querySelector("#f-vendorId");
  if(select){[...select.options].forEach(opt=>{const v=vendorOptions.find(v=>v.id===opt.value);if(v)opt.textContent=v.name})}
  root.querySelectorAll("[data-budget-id]").forEach(input=>input.addEventListener("change",()=>{
    const cat=db.budgetCategories.find(c=>c.id===input.dataset.budgetId);if(cat)cat.allocated=Math.max(0,num(input.value));save();renderBudget();
  }));
  root.querySelector("#planner-search").addEventListener("input",e=>{
    search=e.target.value;renderBudget();
    const box=root.querySelector("#planner-search");if(box){box.focus();box.setSelectionRange(box.value.length,box.value.length)}
  });
  root.querySelectorAll("[data-payment]").forEach(row=>row.addEventListener("click",()=>{selectedId=row.dataset.payment;renderBudget()}));
  root.querySelector("#planner-cancel").addEventListener("click",()=>{selectedId=null;renderBudget()});
  root.querySelector("#planner-payment-form").addEventListener("submit",e=>{
    e.preventDefault();if(!e.currentTarget.reportValidity())return;const fd=new FormData(e.currentTarget);
    const rec=selected||{id:uid("pay"),archived:false};
    rec.vendorId=String(fd.get("vendorId"));rec.description=String(fd.get("description")).trim();rec.amount=Math.max(0,num(fd.get("amount")));rec.dueDate=String(fd.get("dueDate")||"");rec.status=String(fd.get("status"));rec.paidDate=String(fd.get("paidDate")||"");rec.method=String(fd.get("method")||"");rec.notes=String(fd.get("notes")||"").trim();
    if(!selected)db.payments.push(rec);selectedId=rec.id;save();renderBudget();updateToolbar();
  });
  const archive=root.querySelector("#planner-archive");if(archive)archive.addEventListener("click",()=>{if(confirm("Archive this payment record?")){selected.archived=true;selectedId=null;save();renderBudget()}});
  bindJumps();
}

function renderCurrent() {
  selectedId = selectedId && currentView!=="overview" ? selectedId : selectedId;
  if(currentView==="overview")renderOverview();
  else if(currentView==="settings")renderSettings();
  else if(currentView==="budget")renderBudget();
  else renderEntity(currentView);
}
function switchPlanner(view,clear=true){
  if(!["overview","settings","budget",...Object.keys(schemas)].includes(view))view="overview";
  currentView=view;if(clear){selectedId=null;search="";showArchived=false}
  document.querySelectorAll("[data-planner-view]").forEach(b=>b.classList.toggle("active",b.dataset.plannerView===view));
  renderCurrent();
}
document.querySelectorAll("[data-planner-view]").forEach(b=>b.addEventListener("click",()=>switchPlanner(b.dataset.plannerView)));

function updateToolbar(){
  const strong=document.querySelector(".planner-toolbar strong");
  if(strong)strong.textContent="Angela & Joseph · "+dateLabel(db.settings.date);
  if(remoteActive) setSyncState("FIREBASE SYNCED");
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
document.getElementById("planner-reset").addEventListener("click",()=>{
  if(!confirm("Reset the local demo planner? This erases the data saved in this browser. Export a backup first if you need it."))return;
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
  if(role==="coordinator"){hidden.add("settings");hidden.add("budget");}
  if(role==="finance"){["settings","guests","tasks","timeline","decisions","team"].forEach(x=>hidden.add(x));}
  document.querySelectorAll("[data-planner-view]").forEach(btn=>{
    btn.hidden=hidden.has(btn.dataset.plannerView);
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
      localStorage.removeItem(STORAGE_KEY);
      remoteActive=true;
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