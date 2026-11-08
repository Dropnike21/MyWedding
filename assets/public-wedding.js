/*
 * Public-safe wedding details.
 * Only date and venue are exposed here: never load the private weddings/main
 * planner record from an unauthenticated public page.
 *
 * Until the owner publishes Firestore rules and initializes the public
 * projection, use the known December 23 tentative-date fallback.
 */
import { getWeddingClient, enableAppCheck } from "./firebase-services.js?v=20261031-2330";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";

const FALLBACK = Object.freeze({
  date: "2027-12-23",
  dateTentative: true,
  venueName: "Estoria",
  venueTentative: true,
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
  if (!data || !validDate(data.date)) return null;
  const name = typeof data.venueName === "string" ? data.venueName.trim().slice(0,120) : "";
  return {
    date: data.date,
    dateTentative: data.dateTentative !== false,
    venueName: name,
    venueTentative: data.venueTentative !== false,
  };
}

function matchesConfiguredVenue(name) {
  const config = window.WEDDING_VENUE || {};
  const normalized = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const query = normalized(name);
  if (!query) return false;
  return [config.name,config.shortName].some(candidate => {
    const other=normalized(candidate);
    return Boolean(other) && (other===query || other.includes(query) || query.includes(other));
  });
}

function put(id,text) {
  const node=document.getElementById(id);
  if (node && node.textContent !== text) node.textContent=text;
}

function countdown() {
  const target=new Date(details.date+"T00:00:00+08:00").getTime();
  const diff=target-Date.now();
  put("countdown",diff<=0?"Our day is here":
    Math.ceil(diff/DAY_MS)+" day"+(Math.ceil(diff/DAY_MS)===1?"":"s")+" to go");
}

function apply(data) {
  const normalized=normalize(data);
  if (!normalized) return;
  details=normalized;
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
  put("wedding-big-day-note",weekday+" · "+(details.dateTentative?"Tentative":"Confirmed"));
  put("wedding-date-seal",month+" · "+day);
  put("wedding-venue-heading",details.venueTentative?"TENTATIVE VENUE":"WEDDING VENUE");
  const known=matchesConfiguredVenue(details.venueName);
  put("wedding-venue-fact",known
    ? window.WEDDING_VENUE.name
    : details.venueName || "Venue to be confirmed");
  put("wedding-venue-fact-note",known
    ? "Ermita, Manila · subject to confirmation"
    : "Address and directions will follow confirmation");
  // The map and navigation links are specific to the original Estoria venue.
  // Do not send guests to its address if the planner changes to another venue.
  const venueJourney=document.getElementById("venue-journey");
  if (venueJourney) venueJourney.hidden=!known;
  countdown();
  document.dispatchEvent(new CustomEvent("wedding:public-details",{
    detail:{date:details.date,venueName:details.venueName}
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
      if (!snapshot.exists()) return; // fallback until owner creates the projection
      const live=normalize(snapshot.data());
      if (live) apply(live);
    },error=>{
      // Until public details rules are published, the source can be denied.
      // Never attempt to read the private wedding plan as a substitute.
      console.warn("Using published wedding-date fallback:",error?.code || error);
    });
  } catch(error) {
    console.warn("Public wedding date will use its safe fallback:",error?.code || error);
  }
}

export { FALLBACK, normalize, validDate };
