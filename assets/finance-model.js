// Financial calculations shared by the planner overview and unified ledger.
// Legacy records remain readable until an owner/finance organizer migrates them.
export const EVENTS=["Civil wedding","Garden wedding","Shared / both","Unassigned"];
export const STAGES=["Planned","Quoted","Confirmed","Ordered","Completed","Cancelled"];
export const number=value=>{const n=Number(value);return Number.isFinite(n)?n:0;};
const active=rows=>(rows||[]).filter(row=>!row.archived);
export const eventOf=row=>EVENTS.includes(row?.event)?row.event:"Unassigned";
export function legacyVendor(v){
  return {...v,id:"legacy-vendor-"+v.id,sourceVendorId:v.id,supplier:v.name,
    expectedCost:0,quotation:number(v.quote),actualCost:number(v.agreed),
    stage:v.status==="Cancelled"?"Cancelled":v.status==="Booked"||number(v.agreed)>0?"Confirmed":v.status==="Quoted"||number(v.quote)>0?"Quoted":"Planned",
    event:eventOf(v),dueDate:v.reserveBy||"",legacyVendor:true};
}
export function stageOf(item){
  if(STAGES.includes(item.stage))return item.stage;
  if(item.status==="Cancelled")return "Cancelled";
  if(item.status==="Received")return "Completed";
  if(item.status==="Ordered")return "Ordered";
  if(["Partially paid","Paid"].includes(item.status)||number(item.paid)>0||number(item.actualCost)>0)return "Confirmed";
  return "Planned";
}
export function itemsOf(db,includeArchived=false){
  const expenses=(db.expenses||[]).filter(x=>includeArchived||!x.archived);
  const represented=new Set((db.expenses||[]).map(x=>x.sourceVendorId).filter(Boolean));
  return [...expenses,...(db.vendors||[]).filter(v=>!represented.has(v.id)&&(includeArchived||!v.archived)).map(legacyVendor)];
}
export function linkedId(db,p){
  if(p.expenseId)return p.expenseId;
  if(p.vendorId){
    const mapped=(db.expenses||[]).find(x=>x.sourceVendorId===p.vendorId);
    return mapped?.id||"legacy-vendor-"+p.vendorId;
  }
  return "";
}
export function paidValue(p){
  if(p.archived||p.status!=="Paid")return 0;
  return (p.kind==="Refund"?-1:1)*number(p.amount);
}
export function committedOf(item){
  const stage=stageOf(item);
  if(!["Confirmed","Ordered","Completed"].includes(stage))return 0;
  // A zero explicit confirmed amount is meaningful in the new schema.
  if(item.stage)return Math.max(0,number(item.actualCost));
  return Math.max(0,number(item.actualCost)||number(item.expectedCost)||number(item.paid));
}
export function paidOf(db,item){
  const opening=item.openingMigrated?0:number(item.paid);
  return opening+active(db.payments).filter(p=>linkedId(db,p)===item.id).reduce((sum,p)=>sum+paidValue(p),0);
}
export const balanceOf=(db,item)=>Math.max(0,committedOf(item)-paidOf(db,item));
export function paymentStatus(db,item){
  const paid=paidOf(db,item), committed=committedOf(item);
  if(paid>committed&&paid>0)return "Overpaid / refund due";
  if(paid<0)return "Net refund";
  if(paid===0)return committed>0?"Unpaid":"Not committed";
  return paid>=committed?"Fully paid":"Partially paid";
}
export function financeTotals(db,event="All events"){
  const all=itemsOf(db,true), visible=all.filter(x=>event==="All events"||eventOf(x)===event);
  const current=visible.filter(x=>!x.archived);
  const matchesPayment=p=>{
    const item=all.find(x=>x.id===linkedId(db,p));
    return event==="All events"||eventOf(item)===event;
  };
  const planned=active(db.budgetCategories).filter(c=>event==="All events"||eventOf(c)===event).reduce((s,c)=>s+number(c.allocated),0);
  const committed=current.reduce((s,x)=>s+committedOf(x),0);
  const paid=visible.reduce((s,x)=>s+(x.openingMigrated?0:number(x.paid)),0)+active(db.payments).filter(matchesPayment).reduce((s,p)=>s+paidValue(p),0);
  return {planned,committed,paid,outstanding:current.reduce((s,x)=>s+balanceOf(db,x),0),estimate:current.filter(x=>stageOf(x)!=="Cancelled").reduce((s,x)=>s+number(x.expectedCost),0),unlinked:active(db.payments).filter(p=>!all.some(x=>x.id===linkedId(db,p))&&matchesPayment(p)).length};
}
// Idempotent, deterministic migration. Keep legacy source records, original amounts
// and dates; do not infer duplicate bookings or invent missing payment dates.
export function migrateFinance(db){
  db.expenses??=[];db.payments??=[];
  for(const v of db.vendors||[]){
    if(db.expenses.some(x=>x.sourceVendorId===v.id))continue;
    const x=legacyVendor(v);
    delete x.legacyVendor;
    db.expenses.push(x);
  }
  for(const p of db.payments){
    if(!p.expenseId&&p.vendorId)p.expenseId=linkedId(db,p);
  }
  for(const x of db.expenses){
    if(x.openingMigrated||!number(x.paid))continue;
    const id="opening-"+x.id;
    if(!db.payments.some(p=>p.id===id)){
      db.payments.push({id,expenseId:x.id,description:"Opening payment (legacy total)",amount:Math.abs(number(x.paid)),kind:number(x.paid)<0?"Refund":"Payment",status:"Paid",paidDate:"",dueDate:"",method:"",notes:"Imported aggregate; original payment dates and breakdown were not recorded.",archived:false,legacyOpening:true});
    }
    x.legacyPaid=number(x.paid);
    x.openingMigrated=true;
  }
}
