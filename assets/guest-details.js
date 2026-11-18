import { guestAccessConfig } from "./guest-config.js?v=20261119-guestguide1";
import { getGuestClient, callGuestFunction } from "./firebase-services.js?v=20261119-guestguide1";
import { start as startPublicWedding } from "./public-wedding.js?v=20261119-guestguide1";

const CODE_PATTERN=/^[A-HJ-NP-Z2-9]{8}$/;
const normalize=value=>String(value||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
const code=normalize(location.hash.slice(1));
const party=document.getElementById("guest-details-party");
const status=document.getElementById("guest-details-status");
const seatsNode=document.getElementById("details-seats");
const messenger=document.getElementById("guest-messenger-confirmation");
const form=document.getElementById("guest-details-rsvp-form");
const seatWrap=document.getElementById("guest-details-seats-wrap");
const seatSelect=document.getElementById("guest-details-seat-select");
const rsvpStatus=document.getElementById("guest-details-rsvp-status");
const cameraLink=document.getElementById("guest-details-camera-link");
let published=window.WEDDING_PUBLIC_DETAILS||{};
let invitation=null;
let authApi=null;

function formatDate(value){
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(String(value||"")))return "Date to be confirmed";
  const date=new Date(value+"T00:00:00+08:00");
  return new Intl.DateTimeFormat("en-PH",{timeZone:"Asia/Manila",month:"long",day:"numeric",year:"numeric"}).format(date);
}
function text(id,value){
  const node=document.getElementById(id);
  if(node)node.textContent=value;
}
function renderGuide(){
  const grid=document.getElementById("guest-guide-grid");
  const empty=document.getElementById("guest-guide-empty");
  if(!grid||!empty)return;
  const guide=published.guestGuide||{};
  const sections=[
    ["attire","Dress code / attire"],["whatToWear","What to wear"],["whatToBring","What to bring"],
    ["preparation","Things to prepare"],["arrival","Arrival"],["venueInstructions","Venue instructions"],
    ["transportParking","Parking / transport"],["reminders","Important reminders"],["contact","Who to contact"]
  ];
  grid.replaceChildren();
  for(const [key,label] of sections){
    const value=String(guide[key]||"").trim();
    if(!value)continue;
    const card=document.createElement("article");
    const heading=document.createElement("span");
    const copy=document.createElement("p");
    heading.textContent=label;copy.textContent=value;card.append(heading,copy);grid.appendChild(card);
  }
  empty.hidden=Boolean(grid.children.length);
}
function configureConfirmation(){
  const mode=String(published.rsvpMode||"Both");
  messenger.hidden=mode==="Website only";
  form.hidden=mode==="Messenger only";
}
function renderPublic(){
  text("details-date",formatDate(published.date));
  text("details-ceremony",String(published.ceremony||"Ceremony to be confirmed"));
  text("details-venue",String(published.venueName||"Venue to be confirmed"));
  text("details-city",String(published.city||"Location to be confirmed"));
  renderGuide();
  configureConfirmation();
}
function renderInvitation(){
  if(!invitation)return;
  party.textContent="For: "+(invitation.partyLabel||"our invited guest");
  const seats=Math.max(1,Number(invitation.invitedSeats||1));
  seatsNode.textContent=seats+" seat"+(seats===1?"":"s");
  seatSelect.innerHTML=Array.from({length:seats},(_,i)=>{
    const option=document.createElement("option");option.value=String(i+1);option.textContent=String(i+1);return option;
  }).reduce((fragment,option)=>{fragment.appendChild(option);return fragment;},document.createDocumentFragment());
  const current=String(invitation.rsvp||"Pending");
  form.querySelectorAll('input[name="rsvp"]').forEach(input=>input.checked=input.value===current);
  const yes=current==="Yes";
  seatWrap.hidden=!yes;
  if(yes)seatSelect.value=String(Math.min(seats,Math.max(1,Number(invitation.confirmedSeats||seats))));
  rsvpStatus.textContent=current==="Pending"?"":current==="Yes"
    ?"Current attendance: "+seatSelect.value+" of "+seats+" attending."
    :"Current attendance: "+current+".";
}
async function authTools(){
  if(authApi)return authApi;
  authApi=await import("https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js");
  return authApi;
}
async function guestUser(){
  const {auth}=getGuestClient();
  const tools=await authTools();
  await tools.setPersistence(auth,tools.browserLocalPersistence);
  if(!auth.currentUser)await tools.signInAnonymously(auth);
  return auth.currentUser;
}
async function loadInvitation(){
  if(!CODE_PATTERN.test(code)){
    status.textContent="This guest-details link is invalid.";
    form.hidden=true;messenger.hidden=true;
    return;
  }
  cameraLink.href="./index.html#camera/"+code;
  await guestUser();
  const response=await callGuestFunction("getInvitationDetails")({code});
  invitation=response.data||{};
  renderInvitation();
  status.textContent="Private invitation verified.";
}
form?.addEventListener("change",event=>{
  if(event.target?.name!=="rsvp")return;
  seatWrap.hidden=event.target.value!=="Yes";
});
form?.addEventListener("submit",async event=>{
  event.preventDefault();
  if(!invitation||!CODE_PATTERN.test(code))return;
  const selected=form.querySelector('input[name="rsvp"]:checked')?.value;
  if(!selected){rsvpStatus.textContent="Choose Yes, Maybe, or No.";return}
  const maxSeats=Math.max(1,Number(invitation.invitedSeats||1));
  const attendingSeats=selected==="Yes"?Math.min(maxSeats,Math.max(1,Number(seatSelect.value||1))):0;
  const button=form.querySelector('button[type="submit"]');
  button.disabled=true;rsvpStatus.textContent="Saving attendance…";
  try{
    await callGuestFunction(guestAccessConfig.callableName)({code});
    const response=await callGuestFunction("respondToInvitation")({rsvp:selected,attendingSeats});
    invitation={...invitation,...response.data};
    renderInvitation();
    rsvpStatus.textContent=selected==="Yes"
      ?"Attendance saved: "+Number(response.data?.confirmedSeats||attendingSeats)+" of "+maxSeats+" attending."
      :"Attendance saved: "+selected+".";
  }catch(error){
    console.error(error);
    rsvpStatus.textContent="Attendance could not be saved. You can still confirm through Messenger if that option is available.";
  }finally{button.disabled=false}
});

document.addEventListener("wedding:public-details",event=>{
  published=event.detail||{};
  renderPublic();
});
renderPublic();
startPublicWedding().catch(error=>console.warn("Could not load public wedding details:",error));
loadInvitation().catch(error=>{
  console.error(error);
  status.textContent="We couldn't verify this private invitation. Please reopen the original invitation link.";
});
