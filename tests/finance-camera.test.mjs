import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../assets/finance-model.js",import.meta.url),"utf8");
const {financeTotals,migrateFinance}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
const snapshot=()=>({expenses:[
  {id:"ring",expectedCost:28000,actualCost:0,paid:28000,status:"Received"},
  {id:"venue",expectedCost:70000,actualCost:0,paid:10000,status:"Partially paid"}
],vendors:[],payments:[],budgetCategories:[70000,35000,3000,1000,8000,10000,2000].map(allocated=>({allocated}))});
test("legacy amounts preserved and migration idempotent",()=>{
  const db=snapshot(),before=financeTotals(db);
  assert.deepEqual([before.planned,before.committed,before.paid,before.outstanding],[129000,98000,38000,60000]);
  migrateFinance(db);assert.deepEqual(financeTotals(db),before);
  migrateFinance(db);assert.deepEqual(financeTotals(db),before);
  assert.equal(db.payments.length,2);
  assert.equal(db.payments[0].paidDate,"");
});
test("installments and refunds count but planned payments do not",()=>{
  const db=snapshot();migrateFinance(db);
  db.payments.push({expenseId:"venue",status:"Paid",amount:20000},{expenseId:"venue",status:"Paid",amount:1000,kind:"Refund"},{expenseId:"venue",status:"Planned",amount:999});
  const t=financeTotals(db);assert.equal(t.paid,57000);assert.equal(t.outstanding,41000);
});
test("existing vendor payments follow migration without duplication",()=>{
  const db={vendors:[{id:"v",agreed:10000,status:"Booked"}],expenses:[],payments:[{id:"p",vendorId:"v",status:"Paid",amount:3000}],budgetCategories:[]};
  const before=financeTotals(db);migrateFinance(db);assert.deepEqual(financeTotals(db),before);
  assert.equal(db.payments[0].expenseId,db.expenses[0].id);
  assert.equal(db.vendors.length,1);
});
test("planned expenses do not count as commitments and events are filtered",()=>{
  const db=snapshot();db.expenses.push({id:"garden",stage:"Planned",expectedCost:5000,event:"Garden wedding"});
  const t=financeTotals(db,"Garden wedding");assert.equal(t.committed,0);assert.equal(t.estimate,5000);
});
test("camera is off unless both private and published flags are enabled",()=>{
  const functions=readFileSync(new URL("../functions/index.js",import.meta.url),"utf8");
  const planner=readFileSync(new URL("../assets/planner.js",import.meta.url),"utf8");
  const publicDetails=readFileSync(new URL("../assets/public-wedding.js",import.meta.url),"utf8");
  assert.match(planner,/guestCameraEnabled: false/);
  assert.match(publicDetails,/guestCameraEnabled:false/);
  assert.equal((functions.match(/plan\.get\("settings\.guestCameraEnabled"\) !== true \|\| publicDetails\.get\("guestCameraEnabled"\) !== true/g)||[]).length,2);
});
