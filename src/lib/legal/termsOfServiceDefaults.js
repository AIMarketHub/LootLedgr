// LootLedger — Terms of Service / End User Licence Agreement defaults.
//
// ============================================================================
// LAWYER REVIEW RECOMMENDED BEFORE STAGE 2 (public launch with paying customers).
// Australian Consumer Law (ACL) statutory consumer guarantees CANNOT BE EXCLUDED
// by contract — they apply regardless of what these Terms say. This template
// limits exposure to the maximum permitted by law and includes the mandatory
// ACL acknowledgment, but a contract-law specialist should review before this
// document is presented to fee-paying customers in Stage 2.
// ============================================================================
//
// Sections mirror the AML/CTF Program + Privacy Policy architecture: 14
// numbered sections, each with one or more textarea fields keyed by
// `${section}.${field}`. The form layer reads / writes a flat object.
//
// Reuses nextVersion from src/lib/amlProgram/defaults.js so the version-
// numbering semantics are identical across all three documents.

export {nextVersion} from "../amlProgram/defaults.js";

export const SECTION_TITLES={
  s1:"1. Acceptance of Terms",
  s2:"2. Description of Service",
  s3:"3. Account Registration and Security",
  s4:"4. Subscription and Payment Terms",
  s5:"5. Acceptable Use",
  s6:"6. Disclaimer of Warranties",
  s7:"7. Limitation of Liability",
  s8:"8. Indemnification",
  s9:"9. No Legal or Compliance Advice",
  s10:"10. Termination",
  s11:"11. Governing Law",
  s12:"12. Entire Agreement",
  s13:"13. Severability",
  s14:"14. Australian Consumer Law Acknowledgment",
};

export function buildDefaults(settings){
  const s=settings||{};
  return{
    // ── Section 1 — Acceptance of Terms ─────────────────────────
    "s1.serviceProviderName":s.businessName||"LootLedger",
    "s1.serviceProviderAbn":s.abn||"",
    "s1.acceptanceText":"By creating an account, signing in, or otherwise using LootLedger ('the Service'), You ('You', 'Your', 'the User') agree to be bound by these Terms of Service ('Terms'). If You do not agree to these Terms, do not use the Service. These Terms form a binding contract between You and the Service Provider identified above. Affiliated parties — contractors, technical service providers, and any AI assistants used in development — receive the benefit of the limitations and indemnities in these Terms.",
    "s1.acceptanceVersionNote":"These Terms are versioned. The version in force is the version You accepted on signup, or the version You most recently re-accepted following an update. Material updates require You to re-accept before continuing to use the Service.",

    // ── Section 2 — Description of Service ──────────────────────
    "s2.serviceDescription":"LootLedger is a software-as-a-service application for licensed second-hand precious-metals dealers in Australia. Features include: transaction recording, customer identification capture, AML/CTF compliance support, statutory transaction reports, integration with payment processors and accounting software, and operational tooling.",
    "s2.notLegalAdvice":"LootLedger is a software tool. The pre-filled compliance text — including AML/CTF Program defaults, Privacy Policy defaults, and these Terms — is general guidance only. The Service Provider does not provide legal, tax, regulatory, or compliance advice. You are solely responsible for ensuring Your business operations comply with all applicable laws.",
    "s2.serviceChanges":"The Service Provider may add, remove, or change features at any time. Where a change materially reduces the functionality You have come to rely on, the Service Provider will give reasonable notice through the Service or by email.",
    "s2.serviceAvailability":"The Service is provided 'as available' (subject to the disclaimers and liability limits below). The Service Provider does not guarantee uninterrupted availability or specific uptime targets, and is not liable for downtime caused by third-party services, hardware failures, internet connectivity issues, or force majeure.",

    // ── Section 3 — Account Registration and Security ───────────
    "s3.registrationRequirement":"You must register for an account to access the Service. You agree to provide accurate, current, and complete information at registration and to keep it current. The Service Provider may suspend or terminate accounts that contain materially false information.",
    "s3.passwordSecurity":"You are responsible for keeping Your password confidential. You are responsible for all activity that occurs under Your account, including activity by Your staff or anyone else You have given access to. Notify the Service Provider promptly if You believe Your account has been compromised.",
    "s3.unauthorisedAccess":"The Service Provider is not liable for any loss arising from unauthorised access to Your account where the unauthorised access was not caused by the Service Provider's failure to implement reasonable security measures on the Service infrastructure.",
    "s3.accuracyOfInputs":"You are responsible for the accuracy of data You enter into the Service. The Service may flag, calculate, or report on the basis of Your inputs (including customer identification, transaction values, and compliance answers); the Service Provider is not liable for outputs that are wrong because Your inputs were wrong.",

    // ── Section 4 — Subscription and Payment Terms ──────────────
    "s4.trialPeriod":"New accounts receive a three-month free trial. During the trial period, the Service is fully functional. At the end of the trial, an active subscription is required to continue using the Service.",
    "s4.subscriptionActivation":"Until automated billing is integrated (Stripe), subscriptions are activated manually by a Service Provider administrator after payment is confirmed. The current process for transitioning from trial to active subscription will be communicated to You by email or through the Service.",
    "s4.priceChanges":"The Service Provider may change subscription prices at any time. Price changes take effect at the start of Your next subscription period and will be communicated to You at least 14 days before they take effect.",
    "s4.refunds":"Subscription fees are non-refundable except where required by law (including the Australian Consumer Law — see Section 14). The Service Provider may, at its discretion, offer a pro-rated refund or credit for service interruption it considers significant.",
    "s4.taxes":"Subscription fees are quoted exclusive of GST. GST will be added at the prevailing rate for Australian customers. You are responsible for any other taxes applicable to Your use of the Service.",

    // ── Section 5 — Acceptable Use ──────────────────────────────
    "s5.lawfulUseRequirement":"You agree to use the Service only for lawful purposes and in accordance with all applicable laws — including, where relevant to Your business, the Anti-Money Laundering and Counter-Terrorism Financing Act 2006 (Cth), the Privacy Act 1988 (Cth), the Second-Hand Dealers and Pawnbrokers Act 1989 (Vic) (or its equivalent in Your jurisdiction), the Australian Consumer Law, and tax legislation.",
    "s5.prohibitedActivities":"You must not: (a) use the Service to engage in or facilitate money laundering, terrorism financing, fraud, or other criminal activity; (b) attempt to bypass or interfere with the Service's compliance controls (e.g. tampering with TTR or SMR flagging); (c) reverse engineer, decompile, or attempt to extract the source code of the Service; (d) resell or redistribute access to the Service without the Service Provider's written consent; (e) upload malware or content that infringes another person's rights; (f) use automated means to access the Service in a way that disproportionately burdens its infrastructure.",
    "s5.staffSupervision":"You are responsible for the conduct of any staff or other persons whom You authorise to access the Service. Any breach of these Terms by such a person is treated as a breach by You.",

    // ── Section 6 — Disclaimer of Warranties ────────────────────
    "s6.asIsService":"To the maximum extent permitted by law, the Service is provided on an 'as is' and 'as available' basis without warranties of any kind, either express or implied. Without limiting the generality of that statement, the Service Provider does not warrant that: (a) the Service will meet Your specific requirements; (b) the Service will be uninterrupted, error-free, or secure; (c) the results obtained from use of the Service will be accurate or reliable; (d) defects in the Service will be corrected.",
    "s6.statutoryGuaranteesNotExcluded":"Nothing in this section excludes or restricts any consumer guarantee, warranty, or right that cannot be excluded under the Australian Consumer Law or any other applicable law (see Section 14).",
    "s6.thirdPartyServices":"The Service relies on third-party providers — including but not limited to Supabase Pty Ltd (cloud database), Netlify Inc. (application hosting), Stripe Payments Australia Pty Ltd (payment processing), Square Inc. (point-of-sale and payment processing), and identity verification services. The Service Provider does not warrant the performance, security, or availability of these third-party services and is not liable for their failure.",

    // ── Section 7 — Limitation of Liability ─────────────────────
    "s7.exclusionOfIndirectLoss":"To the maximum extent permitted by law, the Service Provider, its directors, employees, contractors, and affiliated parties (collectively, the 'Released Parties') shall not be liable to You for any indirect, consequential, special, incidental, exemplary, or punitive damages, including but not limited to: loss of profits, loss of revenue, loss of business, loss of opportunity, loss of data, loss of goodwill, or any other intangible loss, arising out of or in connection with Your use of (or inability to use) the Service.",
    "s7.cap":"To the maximum extent permitted by law, the total aggregate liability of the Released Parties to You for all claims arising out of or in connection with the Service, in any 12-month period, shall not exceed the LESSER of: (a) the total subscription fees You paid to the Service Provider for the Service in the 12 months immediately preceding the event giving rise to the claim; or (b) AUD $100.",
    "s7.specificCarveOuts":"Without limiting the generality of the above, the Released Parties shall not be liable for any loss arising from: (a) bugs, errors, or other defects in the Service; (b) Your misuse, misconfiguration, or failure to follow operating instructions; (c) loss of data resulting from Your action, deletion, export, or import; (d) compliance failures resulting from Your input errors (including, by way of example, entering an incorrect customer ID number, mis-categorising a transaction, or omitting to file a TTR or SMR flagged by the Service); (e) regulatory penalties imposed on Your business by AUSTRAC, OAIC, the ATO, Victoria Police, or any other regulator or authority; (f) failure or unavailability of any third-party service the Service depends on (including those listed in Section 6); (g) interruptions to internet connectivity or to Your local network; (h) force majeure events (including but not limited to natural disasters, government actions, public health emergencies, war, terrorism, civil unrest, sabotage, and cyberattack); (i) failure of any hardware or peripheral You use with the Service (printers, scanners, scales, cameras, EFTPOS terminals).",
    "s7.statutoryGuaranteesAcknowledged":"Nothing in this Section 7 limits liability that cannot be limited under the Australian Consumer Law or any other applicable law (see Section 14). Where liability cannot be excluded but can be limited, the Service Provider's liability is limited, at its option, to: (a) re-supplying the affected service; (b) refunding the amount paid for the affected service; or (c) the cost of re-supplying the affected service.",

    // ── Section 8 — Indemnification ─────────────────────────────
    "s8.userIndemnity":"To the maximum extent permitted by law, You shall indemnify, defend, and hold harmless the Released Parties from and against any and all claims, demands, actions, proceedings, losses, damages, costs, and expenses (including reasonable legal fees on a solicitor-client basis) arising out of or in connection with: (a) Your breach of these Terms; (b) Your breach of any applicable law in connection with Your use of the Service; (c) Your misuse of the Service; (d) any claim brought by Your customer, employee, contractor, or any other third party arising from Your business operations or from Your use of the Service in those operations; (e) Your inputs to the Service that result in inaccurate, misleading, or unlawful outputs.",
    "s8.indemnityExceptions":"The indemnity in this section does not apply to the extent the loss was caused by the gross negligence or wilful misconduct of the indemnified party, nor where applicable law prohibits the indemnity.",
    "s8.indemnityProcedure":"The Service Provider will: (a) notify You promptly of any claim subject to indemnification; (b) give You reasonable control of the defence and settlement of the claim, provided no settlement that imposes any liability or admission on the Released Parties is made without their consent; and (c) provide reasonable cooperation in the defence at Your expense.",

    // ── Section 9 — No Legal or Compliance Advice ──────────────
    "s9.notProfessionalAdvice":"LootLedger is a software tool. It does not provide legal, tax, regulatory, or compliance advice. The user is responsible for their own legal compliance, including but not limited to AML/CTF Act 2006, Privacy Act 1988, Second-Hand Dealers and Pawnbrokers Act 1989 (Vic), Australian Consumer Law, and tax legislation. The pre-filled AML/CTF Program text and Privacy Policy templates are general guidance only and must be reviewed and adapted by the user with appropriate professional advice.",
    "s9.userResponsibility":"You are responsible for engaging Your own qualified advisers — lawyers, accountants, AML/CTF specialists, privacy consultants — where Your business circumstances warrant it. The Service Provider is not Your adviser and does not owe You a duty of care to identify or correct compliance gaps in Your business.",
    "s9.regulatoryReporting":"Where the Service flags a transaction for regulatory reporting (e.g. as TTR-required, or as a suspected SMR), the flag is a guidance prompt only. You are responsible for confirming the flag is appropriate for Your circumstances and for filing the report with the relevant regulator within the statutory timeframe.",

    // ── Section 10 — Termination ────────────────────────────────
    "s10.terminationByUser":"You may terminate Your account at any time by following the cancellation process in the Service or by emailing the Service Provider. On termination, You remain responsible for any subscription fees due up to the end of the current subscription period. Refunds, if any, are governed by Section 4.",
    "s10.terminationByProvider":"The Service Provider may suspend or terminate Your account: (a) on at least 14 days' notice for any reason; (b) immediately, without notice, for material breach of these Terms — including breach of Section 5 (Acceptable Use), repeated non-payment, or any conduct that exposes the Service Provider or other users to legal or reputational risk.",
    "s10.dataAfterTermination":"Following termination, the Service Provider will retain Your data for at least 30 days to allow data export, then will permanently delete Your data unless retention is required by law (including AML/CTF Act 7-year retention, where applicable). The Service Provider may, at its option, retain de-identified aggregate data indefinitely for service-improvement purposes.",
    "s10.survival":"Sections 6 (Disclaimer of Warranties), 7 (Limitation of Liability), 8 (Indemnification), 9 (No Legal or Compliance Advice), 11 (Governing Law), and any provisions which by their nature should survive, will survive termination.",

    // ── Section 11 — Governing Law ──────────────────────────────
    "s11.governingLaw":"These Terms are governed by the laws of the State of Victoria, Australia, and the laws of the Commonwealth of Australia as applicable.",
    "s11.jurisdiction":"You submit to the exclusive jurisdiction of the courts of Victoria, Australia and the Federal Court of Australia for any dispute arising out of or in connection with these Terms.",

    // ── Section 12 — Entire Agreement ───────────────────────────
    "s12.entireAgreement":"These Terms, together with the Privacy Policy, constitute the entire agreement between You and the Service Provider relating to the Service and supersede all prior or contemporaneous communications, representations, or agreements (whether oral or written) regarding the subject matter.",
    "s12.noReliance":"You acknowledge that, in agreeing to these Terms, You have not relied on any representation, statement, promise, or assurance made by or on behalf of the Service Provider that is not set out in these Terms or the Privacy Policy.",

    // ── Section 13 — Severability ───────────────────────────────
    "s13.severability":"If any provision of these Terms is held to be invalid, illegal, or unenforceable, that provision will be severed from these Terms to the minimum extent necessary, and the remaining provisions will continue in full force and effect.",
    "s13.waiver":"A failure or delay by the Service Provider to exercise any right under these Terms is not a waiver of that right. A waiver of a right under these Terms is only effective if in writing.",

    // ── Section 14 — Australian Consumer Law Acknowledgment ─────
    "s14.aclAcknowledgment":"Nothing in these Terms excludes, restricts, or modifies any consumer guarantee, right, or remedy that cannot be excluded under the Australian Consumer Law (Schedule 2 of the Competition and Consumer Act 2010 (Cth)) or any other applicable law. Where the Service is supplied to You as a 'consumer' (within the meaning of the Australian Consumer Law), You may have rights under that law that operate alongside these Terms. Where these Terms purport to exclude or limit a right or remedy that cannot be excluded under that law, those Terms are read down to the maximum extent permitted, and otherwise have full effect.",
    "s14.statutoryGuaranteesList":"The non-excludable consumer guarantees under the Australian Consumer Law include (without limitation) the guarantee of acceptable quality (s.54), fitness for any disclosed purpose (s.55), correspondence with description (s.56), services rendered with due care and skill (s.60), and services fit for any disclosed purpose (s.61).",
    "s14.contactForRights":"If You believe a right under the Australian Consumer Law has not been honoured, You should contact the Service Provider in writing in the first instance and allow a reasonable opportunity for resolution before pursuing other remedies.",
    "s14.policyEffectiveDate":new Date().toISOString().slice(0,10),
  };
}

export const FIELD_META={
  // s1
  "s1.serviceProviderName":{type:"text",label:"Service Provider name"},
  "s1.serviceProviderAbn":{type:"text",label:"Service Provider ABN"},
  "s1.acceptanceText":{type:"textarea",label:"Acceptance clause"},
  "s1.acceptanceVersionNote":{type:"textarea",label:"Note on versioning"},
  // s2
  "s2.serviceDescription":{type:"textarea",label:"Description of the Service"},
  "s2.notLegalAdvice":{type:"textarea",label:"Not legal / compliance advice"},
  "s2.serviceChanges":{type:"textarea",label:"Service changes"},
  "s2.serviceAvailability":{type:"textarea",label:"Service availability"},
  // s3
  "s3.registrationRequirement":{type:"textarea",label:"Registration requirement"},
  "s3.passwordSecurity":{type:"textarea",label:"Password security"},
  "s3.unauthorisedAccess":{type:"textarea",label:"Unauthorised access"},
  "s3.accuracyOfInputs":{type:"textarea",label:"Accuracy of Your inputs"},
  // s4
  "s4.trialPeriod":{type:"textarea",label:"Trial period"},
  "s4.subscriptionActivation":{type:"textarea",label:"Subscription activation"},
  "s4.priceChanges":{type:"textarea",label:"Price changes"},
  "s4.refunds":{type:"textarea",label:"Refunds"},
  "s4.taxes":{type:"textarea",label:"Taxes"},
  // s5
  "s5.lawfulUseRequirement":{type:"textarea",label:"Lawful use requirement"},
  "s5.prohibitedActivities":{type:"textarea",label:"Prohibited activities"},
  "s5.staffSupervision":{type:"textarea",label:"Staff supervision"},
  // s6
  "s6.asIsService":{type:"textarea",label:"'As is' / 'as available' service"},
  "s6.statutoryGuaranteesNotExcluded":{type:"textarea",label:"Statutory guarantees not excluded"},
  "s6.thirdPartyServices":{type:"textarea",label:"Third-party services"},
  // s7
  "s7.exclusionOfIndirectLoss":{type:"textarea",label:"Exclusion of indirect / consequential loss"},
  "s7.cap":{type:"textarea",label:"Cap on direct liability"},
  "s7.specificCarveOuts":{type:"textarea",label:"Specific carve-outs"},
  "s7.statutoryGuaranteesAcknowledged":{type:"textarea",label:"Statutory guarantees acknowledged"},
  // s8
  "s8.userIndemnity":{type:"textarea",label:"User indemnity"},
  "s8.indemnityExceptions":{type:"textarea",label:"Indemnity exceptions"},
  "s8.indemnityProcedure":{type:"textarea",label:"Indemnity procedure"},
  // s9
  "s9.notProfessionalAdvice":{type:"textarea",label:"Not professional advice"},
  "s9.userResponsibility":{type:"textarea",label:"User responsibility"},
  "s9.regulatoryReporting":{type:"textarea",label:"Regulatory reporting"},
  // s10
  "s10.terminationByUser":{type:"textarea",label:"Termination by You"},
  "s10.terminationByProvider":{type:"textarea",label:"Termination by Service Provider"},
  "s10.dataAfterTermination":{type:"textarea",label:"Data after termination"},
  "s10.survival":{type:"textarea",label:"Survival of provisions"},
  // s11
  "s11.governingLaw":{type:"textarea",label:"Governing law"},
  "s11.jurisdiction":{type:"textarea",label:"Jurisdiction"},
  // s12
  "s12.entireAgreement":{type:"textarea",label:"Entire agreement"},
  "s12.noReliance":{type:"textarea",label:"No reliance on outside representations"},
  // s13
  "s13.severability":{type:"textarea",label:"Severability"},
  "s13.waiver":{type:"textarea",label:"Waiver"},
  // s14
  "s14.aclAcknowledgment":{type:"textarea",label:"Australian Consumer Law acknowledgment"},
  "s14.statutoryGuaranteesList":{type:"textarea",label:"Non-excludable consumer guarantees"},
  "s14.contactForRights":{type:"textarea",label:"How to claim under the ACL"},
  "s14.policyEffectiveDate":{type:"date",label:"Effective date of this version"},
};

export const SECTION_FIELDS={
  s1:["s1.serviceProviderName","s1.serviceProviderAbn","s1.acceptanceText","s1.acceptanceVersionNote"],
  s2:["s2.serviceDescription","s2.notLegalAdvice","s2.serviceChanges","s2.serviceAvailability"],
  s3:["s3.registrationRequirement","s3.passwordSecurity","s3.unauthorisedAccess","s3.accuracyOfInputs"],
  s4:["s4.trialPeriod","s4.subscriptionActivation","s4.priceChanges","s4.refunds","s4.taxes"],
  s5:["s5.lawfulUseRequirement","s5.prohibitedActivities","s5.staffSupervision"],
  s6:["s6.asIsService","s6.statutoryGuaranteesNotExcluded","s6.thirdPartyServices"],
  s7:["s7.exclusionOfIndirectLoss","s7.cap","s7.specificCarveOuts","s7.statutoryGuaranteesAcknowledged"],
  s8:["s8.userIndemnity","s8.indemnityExceptions","s8.indemnityProcedure"],
  s9:["s9.notProfessionalAdvice","s9.userResponsibility","s9.regulatoryReporting"],
  s10:["s10.terminationByUser","s10.terminationByProvider","s10.dataAfterTermination","s10.survival"],
  s11:["s11.governingLaw","s11.jurisdiction"],
  s12:["s12.entireAgreement","s12.noReliance"],
  s13:["s13.severability","s13.waiver"],
  s14:["s14.aclAcknowledgment","s14.statutoryGuaranteesList","s14.contactForRights","s14.policyEffectiveDate"],
};
