/*
 * Public-safe wedding details published from Planning Studio > Event Setup.
 * The public site never reads the private weddings/main planner document.
 */
import { getWeddingClient, enableAppCheck } from "./firebase-services.js?v=20261119-details1";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const FALLBACK = Object.freeze({
  date: "",
  dateTentative: true,
  ceremony: "",
  venueName: "",
  city: "",
  venueTentative: true,
  rsvpMode: "Both",
  guestGuide: {
    attire:"", whatToWear:"", whatToBring:"", preparation:"",
    arrival:"", venueInstructions:"", transportParking:"", reminders:"", contact:""
  },
});
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^20[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
let details = FALLBACK;
let started = false;

function validDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const [year,month,day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year &&
    date.getUTCMonth()+1===month && date.getUTCDate()===day;
}

function normalize(data) {
  if (!data || typeof data !== "object") return {...FALLBACK};
  const date=typeof data.date==="string"?data.date.trim():"";
  if(date && !validDate(date)) return null;
  const mode=["Both","Messenger only","Website only"].includes(data.rsvpMode)
    ? data.rsvpMode : "Both";
  const sourceGuide=data.guestGuide && typeof data.guestGuide==="object" ? data.guestGuide : {};
  const guideText=key=>typeof sourceGuide[key]==="string" ? sourceGuide[key].trim().slice(0,1200) : "";
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
    dateTentative: data.dateTentative !== false,
    ceremony: typeof data.ceremony==="string" ? data.ceremony.trim().slice(0,80) : "",
    venueName: typeof data.venueName==="string" ? data.venueName.trim().slice(0,120) : "",
    city: typeof data.city==="string" ? data.city.trim().slice(0,120) : "",
    venueTentative: data.venueTentative !== false,
    rsvpMode: mode,
    guestGuide,
  };
}

function put(id,text) {
  const node=document.getElementById(id);
  if (node && node.textContent !== text) node.textContent=text;
}

function countdown() {
  if(!validDate(details.date)){
    put("countdown","Date to be confirmed");
    return;
  }
  const target=new Date(details.date+"T00:00:00+08:00").getTime();
  const diff=target-Date.now();
  put("countdown",diff<=0?"Our day is here":
    Math.ceil(diff/DAY_MS)+" day"+(Math.ceil(diff/DAY_MS)===1?"":"s")+" to go");
}

function apply(data) {
  const normalized=normalize(data);
  if (!normalized) return;
  details=normalized;
  window.WEDDING_PUBLIC_DETAILS={...details};
  const ceremony=details.ceremony || "Ceremony to be confirmed";
  const venue=details.venueName || "Venue to be confirmed";
  const city=details.city || "Location to be confirmed";

  if(validDate(details.date)){
    const stamp=new Date(details.date+"T00:00:00+08:00");
    const date=new Intl.DateTimeFormat("en-PH",{
      timeZone:"Asia/Manila",month:"long",day:"numeric",year:"numeric"
    }).format(stamp);
    const weekday=new Intl.DateTimeFormat("en-PH",{
      timeZone:"Asia/Manila",weekday:"long"
    }).format(stamp);
    const month=String(Number(details.date.slice(5,7))).padStart(2,"0");
    const day=details.date.slice(8,10);
    put("wedding-big-day",date);
    put("wedding-big-day-note",weekday+" · "+ceremony);
    put("wedding-date-seal",month+" · "+day);
  }else{
    put("wedding-big-day","Date to be confirmed");
    put("wedding-big-day-note",ceremony);
    put("wedding-date-seal","—");
  }

  put("wedding-venue-heading","WEDDING VENUE");
  put("wedding-venue-fact",venue);
  put("wedding-venue-fact-note",city);
  countdown();

  document.dispatchEvent(new CustomEvent("wedding:public-details",{
    detail:{...details}
  }));
}

export async function start() {
  if (started) return;
  started=true;
  apply(FALLBACK);
  window.setInterval(countdown,60*1000);

  try {
    enableAppCheck();
    const {app}=getWeddingClient();
    const firestore=getFirestore(app);
    onSnapshot(doc(firestore,"publicWeddingDetails","current"),snapshot=>{
      if (!snapshot.exists()) {
        apply(FALLBACK);
        return;
      }
      const live=normalize(snapshot.data());
      if (live) apply(live);
    },error=>{
      console.warn("Published wedding details unavailable:",error?.code || error);
      apply(FALLBACK);
    });
  } catch(error) {
    console.warn("Wedding details will show neutral placeholders:",error?.code || error);
    apply(FALLBACK);
  }
}

export { FALLBACK, normalize, validDate };
