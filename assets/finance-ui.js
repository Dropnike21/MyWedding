import {EVENTS,STAGES,number,eventOf,stageOf,itemsOf,linkedId,paidOf,committedOf,balanceOf,paymentStatus,financeTotals,migrateFinance} from "./finance-model.js?v=20261124-finance-camera1";

const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=v=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",maximumFractionDigits:2}).format(number(v));
const uid=p=>p+"-"+crypto.randomUUID();
const options=(values,value)=>values.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return '<option value="'+esc(v)+'"'+(v===value?' selected':'')+'>'+esc(l||"Select…")+'</option>';}).join("");
const field=(key,label,value="",type="text",choices=null,required=false)=>'<label class="planner-field"><span>'+esc(label)+'</span>'+(choices?'<select name="'+key+'"'+(required?" required":"")+'>'+options(choices,value)+'</select>':type==="textarea"?'<textarea name="'+key+'">'+esc(value)+'</textarea>':'<input name="'+key+'" type="'+type+'" value="'+esc(value)+'"'+(type==="number"?' min="0" step="0.01"':'')+(required?" required":"")+'/>')+'</label>';
const btn=(label,id,primary=false)=>'<button type="button" class="button '+(primary?"primary":"outlined")+' planner-compact" id="'+id+'">'+esc(label)+'</button>';
const table=(heads,rows)=>'<div class="planner-table-wrap"><table class="planner-table"><thead><tr>'+heads.map(h=>'<th>'+esc(h)+'</th>').join("")+'</tr></thead><tbody>'+rows.join("")+'</tbody></table></div>';
const row=(attrs,cells)=>'<tr '+attrs+'>'+cells.map(c=>'<td>'+c+'</td>').join("")+'</tr>';
const metric=(label,value,note="")=>'<article class="planner-metric"><span>'+esc(label)+'</span><strong>'+money(value)+'</strong><small>'+esc(note)+'</small></article>';
const card=(title,body)=>'<section class="planner-card"><div class="planner-card-head"><h3>'+esc(title)+'</h3></div>'+body+'</section>';
const noRows='<p class="planner-muted">No matching records.</p>';

export function createFinance({root,getDb,getRole,save,refreshToolbar,categories}){
  let tab="overview",event="All events",search="",archived=false;
  const tabs=[["overview","Overview"],["plan","Budget plan"],["expenses","Expenses & commitments"],["payments","Payment history"]];
  const canFinance=()=>getRole()!=="coordinator";
  const owner=()=>["owner","local"].includes(getRole());
  const matches=x=>event==="All events"||eventOf(x)===event;
  const query=x=>JSON.stringify(x).toLowerCase().includes(search.toLowerCase());
  function persist(){save();refreshToolbar();render();}
  function modal(title,body,submit,extra=""){
    const dlg=document.createElement("dialog");
    dlg.className="planner-record-modal";
    dlg.innerHTML='<section class="planner-editor-card planner-modal-card"><div class="planner-editor-head planner-modal-head"><h3>'+esc(title)+'</h3><button type="button" class="planner-modal-close" aria-label="Close">×</button></div><form class="planner-form-grid">'+body+'<div class="planner-form-actions planner-field-wide">'+extra+'<button type="submit" class="button primary">Save</button><button type="button" class="button subtle" data-cancel>Cancel</button></div></form></section>';
    root.appendChild(dlg);
    const close=()=>{dlg.close();dlg.remove();};
    dlg.querySelector(".planner-modal-close").onclick=close;
    dlg.querySelector("[data-cancel]").onclick=close;
    dlg.addEventListener("cancel",e=>{e.preventDefault();close();});
    dlg.querySelector("form").onsubmit=e=>{e.preventDefault();if(!e.currentTarget.reportValidity())return;try{if(submit(Object.fromEntries(new FormData(e.currentTarget)))!==false){close();persist();}}catch(err){alert(err.message);}};
    dlg.showModal();
    return {dlg,close};
  }
  function expenseEditor(id){
    const db=getDb(),item=itemsOf(db,true).find(x=>x.id===id);
    if(item?.legacyVendor){alert("This is a preserved supplier record. An owner or finance organizer can migrate legacy records from the Overview tab before editing it.");return;}
    if(item?.archived){
      if(confirm("Restore this archived expense?")){item.archived=false;persist();}return;
    }
    const x=item||{name:"",category:categories[0],event:event==="All events"?"Civil wedding":event,stage:"Planned",expectedCost:0,quotation:0,actualCost:0};
    const cost=committedOf(x);
    const body=field("name","Expense / booking",x.name,"text",null,true)+field("event","Event",eventOf(x),"text",EVENTS,true)+field("category","Category",x.category,"text",[...new Set([...categories,x.category].filter(Boolean))],true)+field("supplier","Supplier / seller (optional)",x.supplier)+field("contact","Contact",x.contact)+field("expectedCost","Planned item estimate (PHP)",number(x.expectedCost),"number")+field("quotation","Quotation (PHP)",number(x.quotation||x.quote),"number")+field("actualCost","Confirmed cost (PHP)",cost,"number")+field("stage","Booking / delivery status",stageOf(x),"text",STAGES,true)+field("dueDate","Next payment / order due",x.dueDate,"date")+field("pickupDate","Delivery / pickup",x.pickupDate,"date")+field("link","Receipt / contract / reference URL",x.link,"url")+field("package","Package / inclusions",x.package,"textarea")+field("notes","Notes",x.notes,"textarea")+(item?'<div class="planner-field-wide"><p>Paid: <strong>'+money(paidOf(db,item))+'</strong> · Outstanding: <strong>'+money(balanceOf(db,item))+'</strong></p><p class="planner-muted">Payments are recorded separately and calculated automatically.</p></div>':"");
    const extra=item?(canFinance()?btn("Record payment","finance-pay-item")+ " ":"")+btn("Archive","finance-archive-item"):"";
    const {dlg,close}=modal(item?"Edit expense":"New expense",body,values=>{
      const data={...values,expectedCost:number(values.expectedCost),quotation:number(values.quotation),actualCost:number(values.actualCost)};
      if(["Confirmed","Ordered","Completed"].includes(data.stage)&&data.actualCost===0&&!confirm("Confirm this expense with a zero agreed cost?"))return false;
      if(item)Object.assign(item,data);else db.expenses.push({id:uid("expense"),...data,paid:0,archived:false});
      return true;
    },extra);
    dlg.querySelector("#finance-pay-item")?.addEventListener("click",()=>{close();paymentEditor(null,item.id);});
    dlg.querySelector("#finance-archive-item")?.addEventListener("click",()=>{
      if(paidOf(db,item)!==0||(db.payments||[]).some(p=>!p.archived&&linkedId(db,p)===item.id)){alert("This expense has payment records. Cancel or complete it instead; payments must remain traceable.");return;}
      if(confirm("Archive this expense?")){item.archived=true;close();persist();}
    });
  }
  function paymentEditor(id,expenseId){
    if(!canFinance())return;
    const db=getDb(),p=(db.payments||[]).find(x=>x.id===id);
    if(p?.archived){if(confirm("Restore this archived transaction?")){p.archived=false;persist();}return;}
    const all=itemsOf(db,true),selected=p?linkedId(db,p):expenseId||"";
    const choices=[["","Select expense"],...all.filter(x=>!x.archived||x.id===selected).map(x=>[x.id,x.name+" · "+eventOf(x)])];
    if(selected&&!choices.some(x=>x[0]===selected))choices.push([selected,"Unresolved legacy link — choose an expense"]);
    const body=field("expenseId","Linked expense / booking",selected,"text",choices,true)+field("description","Description",p?.description||"","text",null,true)+field("kind","Transaction type",p?.kind||"Payment","text",["Payment","Refund"],true)+field("amount","Amount (PHP)",p?.amount||0,"number",null,true)+field("status","Status",p?.status||"Paid","text",["Paid","Planned","Due","Cancelled"],true)+field("paidDate","Transaction date (blank if unknown)",p?.paidDate||"","date")+field("dueDate","Due date",p?.dueDate||"","date")+field("method","Method",p?.method||"","text",["","Cash","Bank transfer","GCash","Maya","Card","Other"])+field("notes","Notes",p?.notes||"","textarea");
    const {dlg,close}=modal(p?"Edit payment / refund":"Record payment / refund",body,values=>{
      if(!all.some(x=>x.id===values.expenseId&&!x.archived)){alert("Choose an active expense.");return false;}
      if(number(values.amount)<=0){alert("Enter a positive amount.");return false;}
      const data={...values,amount:number(values.amount)};
      if(p)Object.assign(p,data);else db.payments.push({id:uid("pay"),...data,archived:false});
      return true;
    },p?btn("Archive","finance-archive-payment"):"");
    dlg.querySelector("#finance-archive-payment")?.addEventListener("click",()=>{if(confirm("Archive this transaction? Its amount will no longer count toward paid totals.")){p.archived=true;close();persist();}});
  }
  function allocationEditor(id){
    if(!canFinance())return;
    const db=getDb(),x=db.budgetCategories.find(c=>c.id===id);
    const body=field("name","Category",x?.name||categories[0],"text",[...new Set([...categories,x?.name].filter(Boolean))],true)+field("event","Event",x?eventOf(x):event==="All events"?"Civil wedding":event,"text",EVENTS,true)+field("allocated","Budget allocation (PHP)",x?.allocated||0,"number",null,true);
    modal(x?"Edit category budget":"New category budget",body,v=>{
      if(db.budgetCategories.some(c=>c.id!==id&&!c.archived&&c.name===v.name&&eventOf(c)===v.event)){alert("That category already has a budget for this event. Edit the existing row.");return false;}
      const data={...v,allocated:number(v.allocated)};
      if(x)Object.assign(x,data);else db.budgetCategories.push({id:uid("budget"),...data});
      return true;
    });
  }
  function savingsEditor(){
    if(!owner())return;
    const s=getDb().settings;
    modal("Garden Wedding Fund",field("gardenSavingsTarget","Savings goal (PHP)",s.gardenSavingsTarget||0,"number")+field("gardenSavingsSaved","Saved (PHP)",s.gardenSavingsSaved||0,"number")+field("gardenSavingsNotes","Notes",s.gardenSavingsNotes,"textarea"),v=>{Object.assign(s,{...v,gardenSavingsTarget:number(v.gardenSavingsTarget),gardenSavingsSaved:number(v.gardenSavingsSaved)});return true;});
  }
  function render(){
    const db=getDb(),all=itemsOf(db,true),items=all.filter(x=>(archived||!x.archived)&&matches(x)&&query(x)),t=financeTotals(db,event);
    const paymentRows=(db.payments||[]).filter(p=>(archived||!p.archived)&&matches(all.find(x=>x.id===linkedId(db,p)))&&query({...p,expenseName:all.find(x=>x.id===linkedId(db,p))?.name}));
    const legacy=(db.vendors||[]).some(v=>!db.expenses.some(x=>x.sourceVendorId===v.id))||db.expenses.some(x=>!x.openingMigrated&&number(x.paid)!==0)||(db.payments||[]).some(p=>p.vendorId&&!p.expenseId);
    root.innerHTML='<div class="planner-page-head"><div><span class="eyebrow">WEDDING STUDIO</span><h2>Budget &amp; Expenses</h2><p>Plan spending, confirm commitments, and record payments in one place.</p></div><div class="planner-page-actions">'+btn("+ New expense","finance-new",true)+(canFinance()?btn("+ Record payment","finance-payment"):"")+'</div></div>'+
    '<nav class="planner-finance-tabs" aria-label="Financial sections">'+tabs.map(([k,l])=>'<button type="button" data-finance-tab="'+k+'" class="'+(tab===k?"active":"")+'"'+(tab===k?' aria-current="page"':'')+'>'+esc(l)+'</button>').join("")+'</nav>'+
    '<div class="planner-list-tools"><label>Event <select id="finance-event">'+options(["All events",...EVENTS],event)+'</select></label></div>'+
    (legacy?card("Legacy records",'<p>Existing supplier bookings and aggregate payments are included in totals. Review potential duplicate bookings before migration. Existing records without an event remain Unassigned.</p>'+(canFinance()?btn("Migrate existing records","finance-migrate"):"<p>Ask an owner or finance organizer to migrate legacy records.</p>")):"")+
    (t.unlinked?card("Unlinked transactions",'<p>'+t.unlinked+' payment record(s) have no matching expense. They remain in paid totals; review them in Payment history.</p>'):"");
    if(tab==="overview"){
      root.innerHTML+='<div class="planner-metrics compact">'+metric("Planned category budget",t.planned,"Allocation total")+metric("Confirmed commitments",t.committed)+metric("Net paid",t.paid,"Payments less refunds")+metric("Outstanding",t.outstanding,"Unpaid confirmed commitments")+metric("Uncommitted budget",t.planned-t.committed)+metric("Budget not yet spent",t.planned-t.paid)+'</div>'+
      card("Garden Wedding Fund",'<p>Separate savings, not wedding spending.</p><div class="planner-budget-lines"><div><span>Saved</span><strong>'+money(db.settings.gardenSavingsSaved)+'</strong></div><div><span>Goal</span><strong>'+money(db.settings.gardenSavingsTarget)+'</strong></div></div>'+(owner()?btn("Update savings","finance-savings"):""))+
      card("Planning guide",'<p>Set category limits in Budget plan. Add each purchase or booking once in Expenses &amp; commitments. Record every installment or refund against that same expense. Item estimates are not added to category allocations.</p><p>Legacy category allocations and expenses remain Unassigned until you classify them. Existing civil budget ceiling in Event Setup: '+money(db.settings.budget)+'.</p>');
    }
    if(tab==="plan"){
      const rows=db.budgetCategories.filter(c=>!c.archived&&matches(c));
      root.innerHTML+=card("Category allocations",(canFinance()?btn("+ Add category allocation","finance-allocation"):"")+(rows.length?table(["Category","Event","Allocation","Committed","Net paid"],rows.map(c=>{const group=all.filter(x=>!x.archived&&x.category===c.name&&eventOf(x)===eventOf(c));return row('data-allocation="'+esc(c.id)+'"',[esc(c.name),esc(eventOf(c)),money(c.allocated),money(group.reduce((s,x)=>s+committedOf(x),0)),money(group.reduce((s,x)=>s+paidOf(db,x),0))]);})):noRows)+'<p>Allocation total: <strong>'+money(t.planned)+'</strong>. Click a row to edit or classify it.</p>');
    }
    if(tab==="expenses"||tab==="payments"){
      root.innerHTML+='<section class="planner-list-card planner-list-card-full"><div class="planner-list-tools"><input type="search" id="finance-search" placeholder="Search records" value="'+esc(search)+'">'+btn(archived?"Hide archived":"Show archived","finance-archived")+'</div>'+
      (tab==="expenses"?(items.length?table(["Expense / booking","Event","Category","Estimate","Quote","Confirmed","Paid","Balance","Booking / delivery","Payment"],items.map(x=>row('data-expense="'+esc(x.id)+'"',[esc(x.name)+(x.archived?" (archived)":"")+(x.legacyVendor?" (legacy)":"")+(x.supplier?'<small> · '+esc(x.supplier)+'</small>':""),esc(eventOf(x)),esc(x.category),money(x.expectedCost),money(x.quotation||x.quote),money(committedOf(x)),money(paidOf(db,x)),money(balanceOf(db,x)),esc(stageOf(x)),esc(paymentStatus(db,x))]))):noRows):(paymentRows.length?table(["Transaction","Expense","Event","Type","Amount","Status","Date","Due"],paymentRows.map(p=>{const x=all.find(x=>x.id===linkedId(db,p));return row('data-payment="'+esc(p.id)+'"',[esc(p.description)+(p.archived?" (archived)":""),esc(x?.name||"Unlinked"),esc(eventOf(x)),esc(p.kind||"Payment"),money(p.amount),esc(p.status),esc(p.paidDate||"Unknown / not recorded"),esc(p.dueDate||"—")]);})):noRows))+'</section>';
      if(tab==="payments"&&legacy)root.innerHTML+='<p class="planner-muted">Legacy aggregate paid amounts appear in summary totals. Migrate them to display dated or undated opening entries here.</p>';
    }
    root.querySelectorAll("[data-finance-tab]").forEach(b=>b.onclick=()=>{tab=b.dataset.financeTab;search="";archived=false;render();});
    root.querySelector("#finance-event").onchange=e=>{event=e.target.value;render();};
    root.querySelector("#finance-new").onclick=()=>expenseEditor();
    root.querySelector("#finance-payment")?.addEventListener("click",()=>paymentEditor());
    root.querySelector("#finance-savings")?.addEventListener("click",savingsEditor);
    root.querySelector("#finance-allocation")?.addEventListener("click",()=>allocationEditor());
    root.querySelector("#finance-migrate")?.addEventListener("click",()=>{if(confirm("Convert legacy suppliers and aggregate payments into unified records? Source supplier records and original amounts are retained. No duplicate matching or missing dates will be guessed.")){migrateFinance(db);persist();}});
    root.querySelector("#finance-archived")?.addEventListener("click",()=>{archived=!archived;render();});
    root.querySelector("#finance-search")?.addEventListener("input",e=>{search=e.target.value;render();const input=root.querySelector("#finance-search");input.focus();input.setSelectionRange(search.length,search.length);});
    root.querySelectorAll("[data-expense]").forEach(r=>r.onclick=()=>expenseEditor(r.dataset.expense));
    root.querySelectorAll("[data-payment]").forEach(r=>r.onclick=()=>paymentEditor(r.dataset.payment));
    root.querySelectorAll("[data-allocation]").forEach(r=>r.onclick=()=>allocationEditor(r.dataset.allocation));
  }
  return {open(view,id){tab=view==="expenses"||view==="vendors"?"expenses":"overview";event="All events";search="";archived=false;render();if(id&&tab==="expenses")expenseEditor(id);},render};
}
