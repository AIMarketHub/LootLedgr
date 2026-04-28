// LootLedger — module-level constants.
// Mechanically extracted from src/App.tsx during Phase 2 step 1.
// No semantic changes; values preserved exactly as they were in App.tsx.
//
// THRESH and STATE_INFO previously lived here; they migrated to
// src/lib/compliance/au.js during Phase 2 step 3a as part of the
// pluggable regional compliance architecture (briefing Section 6).

// Standard precious-metals constants.
export const TROY_OZ=31.1035;

// App build version. Surfaced in backups and the API diagnostics modal.
export const APP_VERSION="5";

// Seed logo embedded as an SVG data URI. Used by:
//   - storage.js → runMigration (one-shot logoLib seed)
//   - App.tsx logoLib useEffect + header fallback img
// Inline SVG so the asset has zero network cost and survives offline.
export const SEED_LOGO="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='32' fill='%23c9a84c'/%3E%3Ctext x='32' y='40' text-anchor='middle' font-size='28' font-family='serif' fill='%23080c09'%3ELL%3C/text%3E%3C/svg%3E";

// Gold purity by carat stamp. Decimal fraction of pure gold.
export const GOLD_P={"24ct":1,"23ct":0.9583,"22ct":0.9167,"21ct":0.875,"20ct":0.8333,"18ct":0.75,"14ct":0.5833,"10ct":0.4167,"9ct":0.375};
// Silver purity by stamp. Decimal fraction of pure silver.
export const SILV_P={".999":0.999,".925":0.925,".900":0.9,".835":0.835,".800":0.8,".500":0.5};

// Initial settings shape applied when the app first loads with no
// stored settings. Every key the app reads should appear here so
// reads never see undefined.
export const DEFAULT_SETTINGS={businessName:"",abn:"",address:"",phone:"",staffPin:"1234",squareToken:"",squareLoc:"",squareRedirect:"",sheetsId:"",sheetsRange:"Sheet1!A1",sheetsToken:"",webhookUrl:"",shopifyDomain:"",shopifyToken:"",xeroToken:"",xeroTenantId:"",xeroBuyCode:"310",xeroSellCode:"200",requirePin:false,sessionTimeout:"never",ttrEnabled:true,cashHardBlockAbove:null,eftposProvider:"none",squareTerminalId:"",linklyBaseUrl:"http://localhost:4242",aiAgentEnabled:false,aiAgentLevel:1,aiAgentUrl:"",aiAgentName:"Sophiie",cryptoEnabled:false,walletBTC:"",walletETH:"",walletBNB:"",walletXRP:"",walletSOL:"",goldApiKey:"",metalsApiKey:"",metalsDevKey:"",duressContact1:"",duressContact2:"",duressContact3:"",duressContact4:"",duressContact5:"",duressContact6:"",duressContact7:"",duressContact8:"",duressContact9:"",duressContact10:"",smsProvider:"textbelt",textbeltKey:"textbelt",duressWebhookUrl:"",twilioFnUrl:"",policeEmail:"",policeStation:"",dealerLicenceNo:"",logoImg:null,scaleProtocol:"auto",scaleCustomServiceUUID:"",scaleCustomCharUUID:"",scaleUnit:"g",scaleFilter:true,state:"VIC",goldAlert:null,silverAlert:null,cashKycThreshold:null,bullionCddThreshold:null,sourceOfFundsCashThreshold:null,sourceOfWealthCashThreshold:null,idAutofillProvider:"none",googleVisionApiKey:"",googleVisionProjectId:"",awsTextractAccessKey:"",awsTextractSecretKey:"",awsTextractRegion:"",llmVisionSubProvider:"anthropic",llmVisionApiKey:"",llmVisionModel:"",llmVisionEndpoint:""};

// ID type options for the CDD form's "ID type" dropdown.
export const ID_OPTIONS=[{value:"",label:"— Select —"},{value:"dl",label:"Driver's Licence"},{value:"pp",label:"Passport"},{value:"lp",label:"Learner Permit"},{value:"fl",label:"Firearms Licence"},{value:"op",label:"Other Photo ID"},{value:"2doc",label:"Two Non-Photo Documents"}];

// BLE GATT UUIDs for digital-scale connections.
// Standard Bluetooth SIG Weight Scale Service.
export const SCALE_STD_SVC="0000181d-0000-1000-8000-00805f9b34fb";
export const SCALE_STD_CHAR="00002a9d-0000-1000-8000-00805f9b34fb";
// Nordic UART Service (used by Adam Equipment, certain Ohaus models).
export const NUS_SVC="6e400001-b5a3-f393-e0a9-e50e24dcca9e";
export const NUS_TX="6e400003-b5a3-f393-e0a9-e50e24dcca9e";
