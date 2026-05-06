// LootLedger — Privacy Policy statutory defaults.
// Pre-filled text the dealer confirms or edits per section. Sources:
//   - Privacy Act 1988 (Cth)
//   - Australian Privacy Principles (APPs 1-13)
//   - OAIC "Guide to developing a privacy policy"
//   - Notifiable Data Breaches scheme (Privacy Amendment Act 2017)
//
// The structure mirrors the AML/CTF Program form's defaults shape so
// the Settings layer + Form layer + History layer + PDF layer can all
// reuse the same machinery (just swapped imports). Each field is
// keyed by `${section}.${field}` so the form layer can read / write
// a flat object.
//
// Reuses nextVersion from src/lib/amlProgram/defaults.js — same
// 1.0/1.1/1.2 minor-bump semantics, no need to duplicate.
//
// IMPORTANT: this template is a starting point pre-filled with
// statutory-correct defaults for an AU precious-metals dealer. It is
// NOT a substitute for legal review before public launch. The user
// should have a privacy lawyer review the customised version before
// publishing it on a real customer-facing surface (Stage 2 wires the
// public landing page).

export {nextVersion} from "../amlProgram/defaults.js";

export const SECTION_TITLES={
  s1:"1. Who We Are",
  s2:"2. What Personal Information We Collect",
  s3:"3. How We Collect It",
  s4:"4. Why We Collect It",
  s5:"5. Use and Disclosure",
  s6:"6. Data Quality",
  s7:"7. Data Security",
  s8:"8. Access and Correction Rights",
  s9:"9. Cross-Border Data Transfer",
  s10:"10. Cookies and Tracking",
  s11:"11. Notifiable Data Breach Commitment",
  s12:"12. Complaints Handling",
  s13:"13. Contact OAIC",
  s14:"14. Updates to This Policy",
};

// Build the default form data, optionally seeded from app-level
// settings (business name, ABN, address, phone, etc.) so Section 1
// isn't redundant data entry.
export function buildDefaults(settings){
  const s=settings||{};
  return{
    // ── Section 1 — Who We Are ──────────────────────────────────
    "s1.businessName":s.businessName||"",
    "s1.abn":s.abn||"",
    "s1.tradingNames":"",
    "s1.address":s.address||"",
    "s1.phone":s.phone||"",
    "s1.email":"",
    "s1.website":"",
    "s1.privacyOfficerName":"",
    "s1.privacyOfficerTitle":"Owner / Privacy Officer",
    "s1.privacyOfficerEmail":"",
    "s1.privacyOfficerPhone":s.phone||"",
    "s1.intro":"This Privacy Policy explains how we collect, use, disclose and protect your personal information. We are bound by the Australian Privacy Principles (APPs) under the Privacy Act 1988 (Cth). By transacting with us, you consent to the handling of your personal information as described in this policy.",

    // ── Section 2 — What Personal Information We Collect ────────
    "s2.identifiers":"Full name. Date of birth. Residential address. Phone number. Email address (where provided).",
    "s2.idDocuments":"Type and number of one or more government-issued identification documents (Australian Driver's Licence, Passport, Photo ID Card, etc.). A photograph of the identification document. The reference number of any verification check performed (e.g. Scantek, where active).",
    "s2.transactionData":"Date, time and location of each transaction. Description, weight, purity and price of each item bought from or sold to you. Method of payment. The store invoice / contract number. Any compliance flags raised by the transaction (TTR, KYC, SMR — internal only). Audit trail of who at the shop processed your transaction.",
    "s2.signatureData":"Your signature acknowledging the privacy notice and the transaction declaration. Captured digitally where the device supports it; otherwise on a printed receipt that is retained on file.",
    "s2.financialData":"Source of funds and source of wealth declarations where the transaction value triggers enhanced customer due-diligence under AML/CTF rules. Card or bank details are NOT stored — payment is processed via PCI-compliant third-party processors (Square, Stripe) which collect card data on their hosted pages.",
    "s2.sensitiveInformation":"We do not collect sensitive information (as defined by s.6 of the Privacy Act — health, race, religion, political opinions, sexual orientation, biometrics) except where biometric verification of an identification document is offered as an optional convenience (see Cross-Border Data Transfer below).",
    "s2.childrenNote":"We do not knowingly collect personal information from individuals under 18. If we discover such information has been collected, it will be deleted unless retention is required under the AML/CTF Act 2006 or the Second-Hand Dealers and Pawnbrokers Act 1989 (Vic).",

    // ── Section 3 — How We Collect It ───────────────────────────
    "s3.directCollection":"Most personal information is collected directly from you in person at the time of transaction. You provide your identification document for sighting; staff record the details, capture a photograph of the document, and (where the verification feature is active) submit it to a verification service.",
    "s3.indirectSources":"In limited circumstances we may receive personal information about you from third parties: (a) a verification provider returning the result of an ID check you initiated through us; (b) Victoria Police, AUSTRAC or a court if there is a lawful order or notice involving you; (c) the previous owner of an item where provenance is being established.",
    "s3.unsolicitedInformation":"If we receive personal information we did not solicit, we will, within a reasonable time, determine whether we could have collected it under APP 3. If we could not, and the information is not in a Commonwealth record, we will destroy or de-identify it as soon as practicable.",

    // ── Section 4 — Why We Collect It ───────────────────────────
    "s4.purposesPrimary":"Compliance with the Anti-Money Laundering and Counter-Terrorism Financing Act 2006 (Cth) — including Customer Due Diligence, Threshold Transaction Reports for cash transactions of $10,000 or more, and Suspicious Matter Reports. Compliance with the Second-Hand Dealers and Pawnbrokers Act 1989 (Vic) — maintaining a transaction register, satisfying police inspection rights, and supporting recovery of stolen property. Operating the transaction itself — recording what was bought or sold, calculating prices, holding bought items for the statutory hold period, returning items where required.",
    "s4.purposesSecondary":"Customer service — recognising returning customers, preventing duplication of identification effort, alerting you about items you've expressed interest in (only where you've opted in). Tax — providing supporting records for our own tax compliance, and if required, for yours. Risk management — maintaining a blacklist of customers whose past conduct (e.g. presenting stolen property) makes future transactions inappropriate.",
    "s4.purposesAggregated":"De-identified aggregate data may be used to understand trends in our business (e.g. seasonal volume, average transaction sizes) without re-identifying any individual.",
    "s4.optOutFromSecondary":"You may opt out of secondary purposes (such as marketing or recognition of returning-customer status) by telling any staff member or by contacting our Privacy Officer. Opting out does not affect mandatory record-keeping under the AML/CTF or SHD Acts.",

    // ── Section 5 — Use and Disclosure ──────────────────────────
    "s5.routineDisclosure":"We do not sell or rent personal information. We disclose information only where: (a) the disclosure is to a recipient described in this policy and is consistent with the primary purpose for which the information was collected; (b) you have consented; or (c) the disclosure is required or authorised by law.",
    "s5.disclosureAustrac":"Threshold Transaction Reports (TTRs) and Suspicious Matter Reports (SMRs) are submitted to AUSTRAC as required by the AML/CTF Act 2006. TTRs identify the customer; SMRs include personal information necessary for AUSTRAC to investigate. We are forbidden by section 123 of the AML/CTF Act from disclosing to you that an SMR has been or may be filed (the 'tipping-off' rule).",
    "s5.disclosurePolice":"We may disclose information to Victoria Police where a transaction relates to suspected stolen property, in accordance with the Second-Hand Dealers and Pawnbrokers Act 1989 (Vic). We share the transaction register and relevant photographs with police on request and pursuant to the legal regime.",
    "s5.disclosureCourtsOrders":"We may disclose information in response to a subpoena, court order, statutory notice, or where disclosure is required to protect the rights, property or safety of a person.",
    "s5.disclosureServiceProviders":"We share information with technology service providers strictly to operate this business: cloud hosting (Supabase Pty Ltd), payment processors (Square Inc., Stripe Payments Australia Pty Ltd), email and SMS providers, and identity verification providers. These providers are bound by their own contracts and privacy obligations and are permitted to use the information only to provide services to us.",
    "s5.disclosureBusinessSale":"If our business is sold or its assets transferred, customer records may transfer to the acquirer to enable continued operation under the same regulatory obligations. The acquirer would be bound by the same Privacy Act obligations.",

    // ── Section 6 — Data Quality ────────────────────────────────
    "s6.accuracyCommitment":"We take reasonable steps to ensure the personal information we hold is accurate, up to date, complete, and relevant to the purpose for which it is held. At each transaction with a returning customer, staff confirm with you that key details on file (address, phone) are still current and update them if necessary.",
    "s6.requestCorrections":"You may request correction of any inaccurate, outdated, incomplete or misleading information about you by contacting our Privacy Officer (Section 1) or any staff member. We will correct it within a reasonable time at no charge, or if we disagree, will provide a written reason.",

    // ── Section 7 — Data Security ───────────────────────────────
    "s7.technicalMeasures":"Personal information stored in LootLedger is encrypted at rest by our cloud database provider (Supabase Pty Ltd, Sydney region) and transmitted over TLS-secured connections. Access to the application is authenticated and gated by an administrator PIN. Sensitive operational paths (overriding a blacklisted customer, exporting backup data, voiding a transaction) require an additional administrator-PIN approval recorded to an audit log.",
    "s7.organisationalMeasures":"Tenant isolation is enforced at the database level: a row in any table is only readable or writable by an authenticated user attached to the row's shop. Photographs of identification documents are stored as application data, not as public objects. Staff are trained on privacy obligations and sign a confidentiality undertaking on commencement.",
    "s7.physicalSecurity":"The shop premises are alarmed and monitored. Devices accessing customer records are kept on the shop network. Hard-copy records (signed compliance forms, where used) are stored in locked filing cabinets on the premises.",
    "s7.thirdPartyAssurance":"Our cloud database provider (Supabase) operates from data centres in Sydney, Australia, with recognised security certifications. Our payment processors (Square, Stripe) maintain PCI-DSS compliance and we do not handle card data ourselves. We review service-provider security posture as part of vendor selection.",
    "s7.staffAccess":"Staff have access only to information necessary for their role. Records access events are auditable. Staff who leave have their access revoked promptly.",

    // ── Section 8 — Access and Correction Rights ────────────────
    "s8.accessRight":"Under APP 12 you may request access to the personal information we hold about you. Make the request in writing to our Privacy Officer (Section 1). We will respond within a reasonable period (and in any event within 30 days) at no cost. If we refuse access on grounds permitted under APP 12 (e.g. the request would unreasonably affect the privacy of another, or disclosure would prejudice an investigation), we will provide written reasons.",
    "s8.correctionRight":"Under APP 13 you may request correction of personal information we hold about you. We will correct it where we agree the information is inaccurate, out of date, incomplete, irrelevant or misleading, or will provide written reasons if we disagree. If correction is refused, you may request a statement be associated with your record noting that you consider it inaccurate.",
    "s8.identityVerificationForRequests":"To protect your privacy, we may require you to verify your identity (e.g. by attending the shop with your ID document) before disclosing or correcting personal information. This protects against impersonation.",

    // ── Section 9 — Cross-Border Data Transfer ──────────────────
    "s9.primaryStorageLocation":"All transaction records and customer identification data are stored in Australia. Our cloud database provider (Supabase) hosts the underlying database in its Sydney region.",
    "s9.overseasProcessing":"Limited technical metadata may be processed by service providers in the United States or European Union: error-monitoring telemetry, application performance metrics, optional optical-character-recognition of identification documents (if you've consented to use the autofill feature), and outbound email / SMS notifications. These transfers are protected by Standard Contractual Clauses or equivalent safeguards required by the Privacy Act.",
    "s9.consentToTransfer":"By transacting with us you consent to limited overseas processing of technical metadata as described above. We remain accountable under APP 8 for the conduct of our overseas service providers in respect of your information.",

    // ── Section 10 — Cookies and Tracking ───────────────────────
    "s10.cookiesUse":"The LootLedger application stores limited information in your browser's local storage to operate (e.g. session state, in-progress transaction). This is not used for advertising, profiling or sharing with third parties.",
    "s10.analyticsUse":"We do not currently run third-party analytics or advertising trackers in the customer-facing shop application. If this changes in the future, this section will be updated and a banner notification will be shown.",

    // ── Section 11 — Notifiable Data Breach Commitment ──────────
    "s11.breachAssessment":"If we become aware of a data breach we will assess, as soon as practicable, whether the breach is likely to result in serious harm to any individual whose personal information is involved.",
    "s11.notificationToOaic":"Where we have reasonable grounds to believe an eligible data breach has occurred, we will notify the Office of the Australian Information Commissioner (OAIC) and affected individuals as soon as practicable, in line with the Notifiable Data Breaches scheme (Privacy Amendment (Notifiable Data Breaches) Act 2017).",
    "s11.notificationToYou":"Notification to you (as an affected individual) will describe the breach, the personal information involved, what we have done to contain it, and steps you can take to protect yourself. Where direct notification is not practicable, we will publish a notification on our website.",
    "s11.containmentSteps":"Containment steps are tailored to the nature of the breach but typically include: revoking compromised credentials, restoring from backups, engaging external incident response support, and reviewing access controls to prevent recurrence.",

    // ── Section 12 — Complaints Handling ────────────────────────
    "s12.complaintsProcedure":"If you believe we have breached the APPs or this policy, please complain in writing to our Privacy Officer (Section 1). We will acknowledge receipt within 7 days and investigate the complaint within 30 days. We will provide a written response setting out our investigation and any remedial steps taken.",
    "s12.escalationToOaic":"If you are not satisfied with our response, you may complain to the Office of the Australian Information Commissioner (OAIC). The OAIC contact details appear in Section 13.",

    // ── Section 13 — Contact OAIC ───────────────────────────────
    "s13.oaicAddress":"Office of the Australian Information Commissioner (OAIC)\nGPO Box 5218, Sydney NSW 2001\nPhone: 1300 363 992\nEmail: enquiries@oaic.gov.au\nWebsite: https://www.oaic.gov.au",
    "s13.oaicComplaintNote":"The OAIC handles privacy complaints under the Privacy Act 1988. The OAIC will normally expect you to have first attempted to resolve the matter with us directly.",

    // ── Section 14 — Updates to This Policy ─────────────────────
    "s14.updatesPolicy":"We may update this Privacy Policy from time to time to reflect changes in the law, our business practices, or our information-handling arrangements. The current version is the one displayed in our application and on our website. Material changes will be brought to your attention via in-app or in-store notification.",
    "s14.versionMetadataIntent":"We retain superseded versions of this policy in our records so we can demonstrate which version was in force when a particular customer transacted with us.",
    "s14.policyEffectiveDate":new Date().toISOString().slice(0,10),
  };
}

// Field metadata — labels, types, helper text. Keys align with
// buildDefaults above. Anything absent is treated as a single-line
// text input.
export const FIELD_META={
  // s1
  "s1.businessName":{type:"text",label:"Business name"},
  "s1.abn":{type:"text",label:"ABN"},
  "s1.tradingNames":{type:"text",label:"Trading name(s)"},
  "s1.address":{type:"text",label:"Business address"},
  "s1.phone":{type:"text",label:"Phone"},
  "s1.email":{type:"text",label:"Email (general)"},
  "s1.website":{type:"text",label:"Website"},
  "s1.privacyOfficerName":{type:"text",label:"Privacy Officer name"},
  "s1.privacyOfficerTitle":{type:"text",label:"Privacy Officer position / title"},
  "s1.privacyOfficerEmail":{type:"text",label:"Privacy Officer email"},
  "s1.privacyOfficerPhone":{type:"text",label:"Privacy Officer phone"},
  "s1.intro":{type:"textarea",label:"Introductory statement",help:"Plain-English summary opening the policy."},
  // s2
  "s2.identifiers":{type:"textarea",label:"Identifiers collected"},
  "s2.idDocuments":{type:"textarea",label:"Identification documents collected"},
  "s2.transactionData":{type:"textarea",label:"Transaction data collected"},
  "s2.signatureData":{type:"textarea",label:"Signature / acknowledgement data"},
  "s2.financialData":{type:"textarea",label:"Financial information collected"},
  "s2.sensitiveInformation":{type:"textarea",label:"Sensitive information statement"},
  "s2.childrenNote":{type:"textarea",label:"Statement on minors"},
  // s3
  "s3.directCollection":{type:"textarea",label:"Direct collection"},
  "s3.indirectSources":{type:"textarea",label:"Indirect sources"},
  "s3.unsolicitedInformation":{type:"textarea",label:"Unsolicited information (APP 4)"},
  // s4
  "s4.purposesPrimary":{type:"textarea",label:"Primary purposes"},
  "s4.purposesSecondary":{type:"textarea",label:"Secondary purposes"},
  "s4.purposesAggregated":{type:"textarea",label:"Aggregated / de-identified use"},
  "s4.optOutFromSecondary":{type:"textarea",label:"Opt-out from secondary purposes"},
  // s5
  "s5.routineDisclosure":{type:"textarea",label:"Disclosure principles"},
  "s5.disclosureAustrac":{type:"textarea",label:"Disclosure to AUSTRAC"},
  "s5.disclosurePolice":{type:"textarea",label:"Disclosure to Victoria Police"},
  "s5.disclosureCourtsOrders":{type:"textarea",label:"Disclosure under legal compulsion"},
  "s5.disclosureServiceProviders":{type:"textarea",label:"Disclosure to service providers"},
  "s5.disclosureBusinessSale":{type:"textarea",label:"Disclosure on business sale"},
  // s6
  "s6.accuracyCommitment":{type:"textarea",label:"Accuracy commitment (APP 10)"},
  "s6.requestCorrections":{type:"textarea",label:"Request corrections"},
  // s7
  "s7.technicalMeasures":{type:"textarea",label:"Technical security measures"},
  "s7.organisationalMeasures":{type:"textarea",label:"Organisational security measures"},
  "s7.physicalSecurity":{type:"textarea",label:"Physical security"},
  "s7.thirdPartyAssurance":{type:"textarea",label:"Third-party security assurance"},
  "s7.staffAccess":{type:"textarea",label:"Staff access controls"},
  // s8
  "s8.accessRight":{type:"textarea",label:"Right of access (APP 12)"},
  "s8.correctionRight":{type:"textarea",label:"Right of correction (APP 13)"},
  "s8.identityVerificationForRequests":{type:"textarea",label:"Identity verification for access requests"},
  // s9
  "s9.primaryStorageLocation":{type:"textarea",label:"Primary storage location"},
  "s9.overseasProcessing":{type:"textarea",label:"Overseas processing"},
  "s9.consentToTransfer":{type:"textarea",label:"Consent to overseas transfer (APP 8)"},
  // s10
  "s10.cookiesUse":{type:"textarea",label:"Cookies / browser-storage use"},
  "s10.analyticsUse":{type:"textarea",label:"Analytics / tracking use"},
  // s11
  "s11.breachAssessment":{type:"textarea",label:"Breach assessment commitment"},
  "s11.notificationToOaic":{type:"textarea",label:"Notification to OAIC"},
  "s11.notificationToYou":{type:"textarea",label:"Notification to affected individuals"},
  "s11.containmentSteps":{type:"textarea",label:"Containment steps"},
  // s12
  "s12.complaintsProcedure":{type:"textarea",label:"Complaints procedure"},
  "s12.escalationToOaic":{type:"textarea",label:"Escalation to OAIC"},
  // s13
  "s13.oaicAddress":{type:"textarea",label:"OAIC contact details"},
  "s13.oaicComplaintNote":{type:"textarea",label:"OAIC complaint note"},
  // s14
  "s14.updatesPolicy":{type:"textarea",label:"Updates policy"},
  "s14.versionMetadataIntent":{type:"textarea",label:"Version retention statement"},
  "s14.policyEffectiveDate":{type:"date",label:"Effective date of this version"},
};

// Section → ordered field-key list. Drives the form's render order.
export const SECTION_FIELDS={
  s1:["s1.businessName","s1.abn","s1.tradingNames","s1.address","s1.phone","s1.email","s1.website","s1.privacyOfficerName","s1.privacyOfficerTitle","s1.privacyOfficerEmail","s1.privacyOfficerPhone","s1.intro"],
  s2:["s2.identifiers","s2.idDocuments","s2.transactionData","s2.signatureData","s2.financialData","s2.sensitiveInformation","s2.childrenNote"],
  s3:["s3.directCollection","s3.indirectSources","s3.unsolicitedInformation"],
  s4:["s4.purposesPrimary","s4.purposesSecondary","s4.purposesAggregated","s4.optOutFromSecondary"],
  s5:["s5.routineDisclosure","s5.disclosureAustrac","s5.disclosurePolice","s5.disclosureCourtsOrders","s5.disclosureServiceProviders","s5.disclosureBusinessSale"],
  s6:["s6.accuracyCommitment","s6.requestCorrections"],
  s7:["s7.technicalMeasures","s7.organisationalMeasures","s7.physicalSecurity","s7.thirdPartyAssurance","s7.staffAccess"],
  s8:["s8.accessRight","s8.correctionRight","s8.identityVerificationForRequests"],
  s9:["s9.primaryStorageLocation","s9.overseasProcessing","s9.consentToTransfer"],
  s10:["s10.cookiesUse","s10.analyticsUse"],
  s11:["s11.breachAssessment","s11.notificationToOaic","s11.notificationToYou","s11.containmentSteps"],
  s12:["s12.complaintsProcedure","s12.escalationToOaic"],
  s13:["s13.oaicAddress","s13.oaicComplaintNote"],
  s14:["s14.updatesPolicy","s14.versionMetadataIntent","s14.policyEffectiveDate"],
};
