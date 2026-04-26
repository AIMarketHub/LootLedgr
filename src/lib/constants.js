// LootLedger — module-level constants.
// Mechanically extracted from src/App.tsx during Phase 2 step 1.
// No semantic changes; values preserved exactly as they were in App.tsx.
//
// Phase 2 step 3 will migrate THRESH and STATE_INFO from this file
// into src/lib/compliance/au.js as part of the pluggable regional
// compliance architecture (briefing Section 6).

// Compliance thresholds (AUD).
export const THRESH={CASH_WARN:2000,BULLION_CDD:5000,CASH_TTR:10000,HOLD_HOURS:168};

// Standard precious-metals constants.
export const TROY_OZ=31.1035;

// App build version. Surfaced in backups and the API diagnostics modal.
export const APP_VERSION="5";

// Gold purity by carat stamp. Decimal fraction of pure gold.
export const GOLD_P={"24ct":1,"23ct":0.9583,"22ct":0.9167,"21ct":0.875,"20ct":0.8333,"18ct":0.75,"14ct":0.5833,"10ct":0.4167,"9ct":0.375};
// Silver purity by stamp. Decimal fraction of pure silver.
export const SILV_P={".999":0.999,".925":0.925,".900":0.9,".835":0.835,".800":0.8,".500":0.5};

// Australian state/territory metadata for the police report generator.
// Each entry: governing act, hold period, submission cadence, default
// email, and submission note shown in the police-report modal.
export const STATE_INFO={
  VIC:{name:"Victoria",act:"Second-Hand Dealers and Pawnbrokers Act 1989 (Vic)",hold:"7 days",freq:"Weekly (within 3 working days)",defaultEmail:"",note:"Submit to your local Victoria Police station by email."},
  NSW:{name:"New South Wales",act:"Pawnbrokers and Second-hand Dealers Act 1996 (NSW)",hold:"14 days",freq:"Within 3 working days",defaultEmail:"#PBU@police.nsw.gov.au",note:"Submit via NSW Police Weblink or email #PBU@police.nsw.gov.au"},
  QLD:{name:"Queensland",act:"Second-hand Dealers and Pawnbrokers Act 2003 (Qld)",hold:"Check local conditions",freq:"Regular forwarding to SPIRS",defaultEmail:"SPIRS.Admin@police.qld.gov.au",note:"Forward CSV to SPIRS (Stolen Property ID & Recovery System)."},
  SA:{name:"South Australia",act:"Second-hand Dealers and Pawnbrokers Act 1996 (SA)",hold:"10 days (3 if full buyer details)",freq:"Keep on premises — available for inspection",defaultEmail:"sapol.leb@police.sa.gov.au",note:"Keep records on premises. Email SAPOL Licensing Enforcement Branch."},
  WA:{name:"Western Australia",act:"Second-hand Dealers and Pawnbrokers Act 1994 (WA)",hold:"3 days minimum",freq:"Available for inspection on request",defaultEmail:"",note:"Submit to local WA Police on request."},
  NT:{name:"Northern Territory",act:"Second-hand Dealers Act (NT)",hold:"14 days",freq:"Available for police inspection at any time",defaultEmail:"",note:"Contact local NT Police station."},
  ACT:{name:"Australian Capital Territory",act:"Second-Hand Dealers Act 1995 (ACT)",hold:"7 days",freq:"Available for ACT Policing inspection",defaultEmail:"",note:"Available for ACT Policing inspection."},
  TAS:{name:"Tasmania",act:"Second-Hand Dealers Act 1994 (Tas)",hold:"7 days",freq:"Available for Tasmania Police inspection",defaultEmail:"",note:"Contact your local Tasmania Police station."},
};

// Initial settings shape applied when the app first loads with no
// stored settings. Every key the app reads should appear here so
// reads never see undefined.
export const DEFAULT_SETTINGS={businessName:"",abn:"",address:"",phone:"",staffPin:"1234",squareToken:"",squareLoc:"",squareRedirect:"",sheetsId:"",sheetsRange:"Sheet1!A1",sheetsToken:"",webhookUrl:"",shopifyDomain:"",shopifyToken:"",xeroToken:"",xeroTenantId:"",xeroBuyCode:"310",xeroSellCode:"200",requirePin:false,sessionTimeout:"never",ttrEnabled:true,eftposProvider:"none",squareTerminalId:"",linklyBaseUrl:"http://localhost:4242",aiAgentEnabled:false,aiAgentLevel:1,aiAgentUrl:"",aiAgentName:"Sophiie",cryptoEnabled:false,walletBTC:"",walletETH:"",walletBNB:"",walletXRP:"",walletSOL:"",goldApiKey:"",metalsApiKey:"",metalsDevKey:"",duressContact1:"",duressContact2:"",duressContact3:"",duressContact4:"",duressContact5:"",duressContact6:"",duressContact7:"",duressContact8:"",duressContact9:"",duressContact10:"",smsProvider:"textbelt",textbeltKey:"textbelt",duressWebhookUrl:"",twilioFnUrl:"",policeEmail:"",policeStation:"",dealerLicenceNo:"",logoImg:null,scaleProtocol:"auto",scaleCustomServiceUUID:"",scaleCustomCharUUID:"",scaleUnit:"g",scaleFilter:true,state:"VIC",goldAlert:null,silverAlert:null};

// ID type options for the CDD form's "ID type" dropdown.
export const ID_OPTIONS=[{value:"",label:"— Select —"},{value:"dl",label:"Driver's Licence"},{value:"pp",label:"Passport"},{value:"lp",label:"Learner Permit"},{value:"fl",label:"Firearms Licence"},{value:"op",label:"Other Photo ID"},{value:"2doc",label:"Two Non-Photo Documents"}];

// BLE GATT UUIDs for digital-scale connections.
// Standard Bluetooth SIG Weight Scale Service.
export const SCALE_STD_SVC="0000181d-0000-1000-8000-00805f9b34fb";
export const SCALE_STD_CHAR="00002a9d-0000-1000-8000-00805f9b34fb";
// Nordic UART Service (used by Adam Equipment, certain Ohaus models).
export const NUS_SVC="6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_TX="6e400003-b5a3-f393-e0a9-e50e24dcca9e";
