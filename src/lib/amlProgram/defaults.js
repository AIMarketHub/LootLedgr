// LootLedger — AML/CTF Program statutory defaults.
// Phase 2.7 follow-up (2026-04-30). Pre-filled text the dealer
// confirms or edits per section. Sources documented at the spec
// site:
//   - AUSTRAC "Develop your AML/CTF program (Reform)"
//   - AML/CTF Amendment Act 2024 + AML/CTF Rules 2025
//   - AUSTRAC sector guidance for precious-metal / stone dealers
//
// The structure mirrors the form's 12 sections. Each field is
// keyed by `${section}.${field}` so the form layer can read /
// write a flat object. Defaults are deliberately verbose — the
// dealer would otherwise have to research and write all of this
// from scratch.

export const SECTION_TITLES={
  s1:"1. Business Details",
  s2:"2. AML/CTF Compliance Officer",
  s3:"3. ML/TF/PF Risk Assessment",
  s4:"4. Customer Due Diligence (CDD)",
  s5:"5. Transaction Monitoring & Reporting",
  s6:"6. Record-keeping",
  s7:"7. Staff Training",
  s8:"8. Independent Review",
  s9:"9. Senior Management Oversight",
  s10:"10. Regulatory Obligations Summary",
  s11:"11. Incident Reporting & Escalation",
  s12:"12. Review & Update",
};

// Build the default form data, optionally seeded from
// app-level settings (business name, ABN, address, phone, dealer
// licence, etc.) so Section 1 isn't redundant data entry.
export function buildDefaults(settings){
  const s=settings||{};
  return{
    // ── Section 1 — Business Details ─────────────────────────────
    "s1.businessName":s.businessName||"",
    "s1.abn":s.abn||"",
    "s1.tradingNames":"",
    "s1.address":s.address||"",
    "s1.phone":s.phone||"",
    "s1.email":"",
    "s1.website":"",
    "s1.dealerLicenceNo":s.dealerLicenceNo||"",
    "s1.austracReNumber":"",
    "s1.austracEnrolmentDate":"",
    "s1.servicesBuyMetals":true,
    "s1.servicesSellMetals":true,
    "s1.servicesBuyStones":true,
    "s1.servicesSellStones":true,
    "s1.servicesPawnbroking":false,
    "s1.servicesBullion":false,
    "s1.servicesOther":"",
    "s1.programPreparedDate":new Date().toISOString().slice(0,10),
    "s1.programApprovedDate":"",
    "s1.seniorManagerName":"",

    // ── Section 2 — AML/CTF Compliance Officer ──────────────────
    "s2.officerName":"",
    "s2.officerTitle":"Owner / Director",
    "s2.officerPhone":s.phone||"",
    "s2.officerEmail":"",
    "s2.officerAppointedDate":new Date().toISOString().slice(0,10),
    "s2.fitAndProperConfirmed":false,
    "s2.backupOfficerName":"",
    "s2.backupOfficerContact":"",

    // ── Section 3 — ML/TF/PF Risk Assessment ────────────────────
    "s3.customerWalkInFreq":"high",
    "s3.customerReturningFreq":"medium-high",
    "s3.customerEstateFreq":"low-medium",
    "s3.customerTouristFreq":"low",
    "s3.customerWholesaleFreq":"low",
    "s3.customerOnlineFreq":"not-applicable",
    "s3.customerOther":"",
    "s3.riskCdd":"medium",
    "s3.riskCddJustification":"Walk-in retail mix means a steady stream of one-off customers with no prior relationship. Mitigated by mandatory ID-on-every-transaction policy enforced in LootLedger and by staff training to recognise evasive customers.",
    "s3.riskGeographic":"low",
    "s3.riskGeographicJustification":"Customer base is overwhelmingly local (Ballarat / regional Victoria). Negligible exposure to high-risk foreign jurisdictions, FATF grey/black list countries, or sanctioned entities. Tourist customers are screened via the same ID + manual TFS check at threshold.",
    "s3.riskProduct":"medium",
    "s3.riskProductJustification":"Precious metals (especially bullion) are inherently attractive to launderers due to high value-density and portability. Mitigated by the 168-hour safety hold on bought items, photo retention, and a dedicated TTR / SMR reporting workflow.",
    "s3.riskChannel":"low",
    "s3.riskChannelJustification":"All transactions are face-to-face in store. No online sale, no remote channel, no agent or intermediary. The in-person channel allows direct ID sighting and behavioural assessment.",
    "s3.riskTransaction":"medium-high",
    "s3.riskTransactionJustification":"Cash transactions are common in second-hand precious-metals retail. AUSTRAC's $10k TTR threshold is enforced at finalisation; the $2k cash-warn prompt requires manager acknowledgement at intermediate values; rolling 30-day structuring detection per customer is in scope for the next compliance pass.",
    "s3.identifiedMlRisks":"Cash transactions $10,000+ trigger TTR reporting per AUSTRAC. Buy-back of high-value items from sellers without proven provenance creates risk of stolen goods being laundered through retail. Bullion / coin transactions are high-value and easily transportable. The shop's customer base is predominantly local retail walk-ins, which lowers some categories of risk but does not eliminate them.",
    "s3.identifiedTfRisks":"Lower probability than ML risk for a regional retail shop. Indicators monitored: unusually high-value cash transactions; customers asking for transactions structured below thresholds; customers requesting cash payments for items shipped internationally; customers presenting ID from sanctioned jurisdictions. The shop has no online channel which removes the most common TF vector.",
    "s3.identifiedPfRisks":"Proliferation financing risk is assessed as LOW. The shop does not deal with high-risk jurisdictions, dual-use goods, or front companies. Precious-metals retail is not a typical PF channel. PF risks are addressed via the same ML/TF customer due diligence controls described in this program.",
    "s3.riskTreatment":"ID required on every transaction (mandatory shop policy enforced in LootLedger Settings → Compliance Thresholds → 'Require ID on every transaction'). Cash transactions $10k+ trigger automated TTR flagging. ID type and number captured digitally with photo retention. Suspicious behaviour escalates to staff training procedures (see Section 7). High-value transactions require senior manager acknowledgement at the $2k cash-warn threshold. All records retained 7 years per AUSTRAC requirement.",

    // ── Section 4 — Customer Due Diligence ──────────────────────
    "s4.initialCdd":"Captured on every transaction via LootLedger Settings → Compliance Thresholds → 'Require ID on every transaction' toggle (set to ON). Minimum dataset: full name, ID type, ID number. ID document is photographed and retained 7 years.",
    "s4.idDriversLicence":true,
    "s4.idPassportAu":true,
    "s4.idPassportForeign":true,
    "s4.idPhotoIdGov":true,
    "s4.idTwoNonPhoto":true,
    "s4.idOther":"",
    "s4.verifyVisualSighting":true,
    "s4.verifyPhotoCapture":true,
    "s4.verifyBiometric":false,
    "s4.enhancedCddTriggers":"Enhanced CDD applies when: transaction amount exceeds $10,000 cash; customer is identified as a Politically Exposed Person (PEP); customer is on AUSTRAC's TFS sanctions list; the customer's source of funds is unclear; the transaction pattern appears structured to avoid reporting thresholds; or the customer's behaviour raises suspicion (see Section 5 indicators).",
    "s4.ongoingCdd":"Returning customers' ID is re-verified at each transaction; if details have changed (address, phone), the system prompts staff to update the client record. Customer records are retained 7 years per AUSTRAC requirement. Risk profile is reassessed if customer behaviour changes or if a new SMR or TTR is filed against them.",
    "s4.pepProcedure":"All transactions exceeding the cash KYC threshold ($10,000 unless tightened in Settings) trigger mandatory PEP screening via the LootLedger Compliance step. Foreign PEPs and domestic PEPs are both screened. Source: manual checklist using AUSTRAC PEP guidance plus a name-and-DOB cross-check against publicly available PEP lists.",
    "s4.tfsProcedure":"All transactions above the cash KYC threshold are screened against the DFAT consolidated sanctions list (https://www.dfat.gov.au/international-relations/security/sanctions/Pages/sanctions). Performed manually by staff via the LootLedger Compliance step. A match → transaction refused, AUSTRAC SMR filed, customer reported to relevant authority.",
    "s4.sourceOfFundsProcedure":"Required when transaction value exceeds the configured Source-of-Funds threshold (default $10,000 cash; can be tightened in Settings). Captured via the LootLedger Compliance step as free text plus supporting documentation where available.",
    "s4.cddFailureProcedure":"If the customer cannot or will not provide acceptable identification, the transaction is refused and the refusal is logged in the staff incident register with date, staff member, and reason. Staff escalate to the AML/CTF Compliance Officer. The refused transaction is logged for pattern analysis (see Section 5 transaction monitoring) — repeat refusals from the same individual are an SMR trigger.",

    // ── Section 5 — Transaction Monitoring & Reporting ──────────
    "s5.monitoringProcedure":"All transactions are recorded in LootLedger. The system automatically flags: cash transactions ≥ $10,000 (TTR required); cash transactions ≥ $2,000 (warning prompt requiring manager acknowledgement); customers on the shop blacklist (admin-PIN override required to proceed); transactions where the customer cannot be identified. The AML/CTF Compliance Officer reviews flagged transactions weekly.\n\nHobby prospector transactions (where a customer sells gold from their own personal recreational prospecting) are flagged in LootLedger for tax categorization purposes. These transactions follow identical KYC/CDD/TTR/SMR requirements as commercial buy transactions — the flag affects accounting treatment only, not compliance posture.",
    "s5.suspiciousIndicators":"Customer behaviour indicators:\n- Customer offers to pay more than market value or accepts much less than market value.\n- Customer cannot or will not provide ID.\n- Customer is nervous, evasive, or unable to explain how they obtained the items.\n- Customer asks about how to structure transactions to avoid reporting thresholds.\n- Customer claims items are 'gifts' or 'inherited' but cannot provide context.\n- Customer asks unusual questions about retention or AUSTRAC disclosure.\n\nItem-related indicators:\n- Items appear new / unworn but the customer claims they are old.\n- Items have serial numbers that have been removed or altered.\n- Items match descriptions of recently-reported stolen property (cross-checked with Vic Police bulletins where available).\n- Multiple identical items being sold separately by the same customer.\n- Items in original packaging being sold for cash well below retail.\n\nPattern indicators:\n- Multiple cash transactions just below $10,000 from the same customer.\n- Customer regularly visits with new high-value items.\n- Multiple unrelated customers selling similar items in quick succession (possible coordinated theft).\n- Sudden change in an existing customer's behaviour or transaction volume.",
    "s5.smrResponsible":"AML/CTF Compliance Officer (see Section 2).",
    "s5.smrSubmissionMethod":"Via AUSTRAC Online (https://online.austrac.gov.au) within 3 business days for ML/TF suspicions, or 24 hours for terrorism financing suspicions.",
    "s5.tippingOff":"Staff are explicitly instructed never to inform a customer that an SMR has been or may be filed. Tipping off is a criminal offence under section 123 of the AML/CTF Act 2006. The instruction is reinforced at every staff training session and at every flagged-transaction debrief.",
    "s5.ttrTrigger":"Cash transactions of $10,000 or more (Australian or foreign currency equivalent) require a TTR. Submitted within 10 business days of the transaction.",
    "s5.ttrAggregation":"Multiple cash transactions from the same customer for the same designated service within 24 hours that total $10,000 or more are treated as a single threshold transaction for TTR purposes.",
    "s5.ttrResponsible":"AML/CTF Compliance Officer (see Section 2).",
    "s5.iftiProcedure":"The shop does not provide international funds transfer services. If this changes, this section will be updated and the shop will register with AUSTRAC for the new designated service.",
    "s5.structuringDetection":"LootLedger monitors for split transactions across rolling 30-day windows per customer. Patterns that appear designed to avoid reporting thresholds are flagged for AML/CTF Compliance Officer review and may be reported to AUSTRAC even when no individual transaction exceeds the threshold.",

    // ── Section 6 — Record-keeping ──────────────────────────────
    "s6.recordsKept":"Transaction records (full LootLedger transaction database). Customer identification records (clients table). Photographs of IDs sighted. Source of funds documentation (where required). PEP / TFS screening results. Training records. AML/CTF Program versions (this very document, all immutable saved versions). SMR records (where filed; held off-system per tipping-off rules). TTR records. Internal incident logs. Blacklist override audit trail.",
    "s6.retentionPeriod":"7 years from the date of transaction or last customer interaction, per AUSTRAC and Privacy Act requirements.",
    "s6.storageMethod":"Digital records stored in LootLedger (local browser storage + Supabase durable backup). Physical records (signed compliance forms, where used) stored in a locked filing cabinet on the shop premises.",
    "s6.accessControls":"Records are accessible only to the AML/CTF Compliance Officer, senior manager, and authorised staff. Sensitive customer data is gated by Admin PIN in LootLedger. The Admin PIN is held by the Compliance Officer and senior manager; no staff member has the PIN by default. Access events are logged in the LootLedger audit trail.",
    "s6.destructionProcedure":"After 7 years from the relevant trigger date, records are securely destroyed: digital records permanently deleted from LootLedger and Supabase; physical records cross-shredded. A short destruction log entry is retained noting what was destroyed, when, and by whom.",

    // ── Section 7 — Staff Training ──────────────────────────────
    "s7.initialTraining":"All new staff complete AML/CTF awareness training before being assigned to till or customer-facing duties. Training covers: identifying suspicious customers and transactions; the SMR procedure (and the tipping-off prohibition); the TTR procedure; using LootLedger for compliance enforcement; the shop's privacy and ID requirements; the blacklist override procedure; the cash-warn and cash hard-block thresholds.",
    "s7.refresherFrequency":"Annual refresher training for all staff. Additional ad-hoc training when AML/CTF Rules change, when AUSTRAC publishes sector guidance, or when new red flags emerge from operational experience.",
    "s7.deliveryMethod":"Combination of: written briefing materials (the docs/sophiie-training/ corpus inside this app); on-the-job training with the AML/CTF Compliance Officer; AUSTRAC online resources; tabletop scenario walkthroughs.",
    "s7.trainingRecords":"All training is documented: date, attendees, content covered, attestation signed by trainee. Records retained 7 years.",
    "s7.preEmploymentScreening":"Background checks for criminal history (police certificate). Reference checks. Identity verification on commencement.",
    "s7.disciplinary":"Failure to follow AML/CTF procedures: verbal warning → written warning → reassignment of duties → termination. Wilful breaches reported to AUSTRAC and to Victoria Police where the conduct is criminal.",

    // ── Section 8 — Independent Review ──────────────────────────
    "s8.reviewFrequency":"Every 3 years, or sooner if there is a material change in business operations, AML/CTF Rules, or regulator guidance.",
    "s8.reviewer":"External AML/CTF consultant — to be appointed before the first review. The reviewer must not be the AML/CTF Compliance Officer or anyone with day-to-day AML/CTF responsibilities at the shop.",
    "s8.firstReviewDue":"",
    "s8.reviewScope":"Whether the program meets statutory requirements; whether it is effectively implemented in day-to-day operations; whether risks are correctly identified and mitigated; staff training records; record-keeping compliance; whether SMR / TTR / IFTI reporting was completed correctly during the period.",
    "s8.findingsHandling":"Findings reviewed by senior management. Action plan developed within 30 days. AML/CTF Program updated where required (creates a new approved version in this app's version history). Material findings disclosed to AUSTRAC if the Rules require.",

    // ── Section 9 — Senior Management Oversight ─────────────────
    "s9.seniorManagerName":"",
    "s9.oversightDescription":"Monthly review of: TTR reports filed; SMRs filed (case-by-case); transaction monitoring flags raised; staff training records; any compliance incidents from the incident register. Quarterly review of the risk assessment to identify changes in customer mix, product mix, or external risk environment.",
    "s9.reportingChannels":"AML/CTF Compliance Officer reports to senior manager monthly with a summary dashboard (transactions, flags, refusals, SMRs filed, TTRs filed, training completed). Material incidents reported to senior manager immediately.",

    // ── Section 10 — Regulatory Obligations Summary ─────────────
    "s10.summary":"This AML/CTF Program addresses our obligations under:\n- Anti-Money Laundering and Counter-Terrorism Financing Act 2006 (Cth) (as amended by the Amendment Act 2024)\n- Anti-Money Laundering and Counter-Terrorism Financing Rules 2025\n- Financial Transaction Reports Act 1988 (where applicable)\n- Privacy Act 1988 (Cth) (data protection)\n- Second-Hand Dealers and Pawnbrokers Act 1989 (Vic) (state-specific obligations)\n- Charter of the United Nations Act 1945 (sanctions)\n\nSpecifically, this program ensures we:\n- Submit TTRs for cash transactions ≥ $10,000 (within 10 business days).\n- Submit SMRs for suspicious matters (within 3 business days; 24 hours for TF).\n- Apply Customer Due Diligence appropriate to assessed risk.\n- Maintain records for 7 years.\n- Train staff appropriately.\n- Have a designated AML/CTF Compliance Officer.\n- Conduct independent review every 3 years.\n- Implement enterprise-wide policies proportionate to our nature, size and complexity.",

    // ── Section 11 — Incident Reporting & Escalation ────────────
    "s11.escalationTriggers":"Suspected stolen goods. Refused customer who appeared aggressive or suspicious. Transactions just below thresholds from repeat customers. Customers requesting unusual payment methods. Any breach of AML/CTF procedures by staff. Any tipping-off concern. Any pattern that could be coordinated activity across multiple customers.",
    "s11.incidentLog":"All incidents recorded in LootLedger's audit log + a separate written incident register kept by the AML/CTF Compliance Officer. Reviewed monthly by senior management.",
    "s11.authorityContact":"Suspected stolen items: contact Victoria Police (state regulator under the Second-Hand Dealers and Pawnbrokers Act 1989). Suspected ML / TF: file SMR with AUSTRAC plus consider Crime Stoppers if criminal activity is in progress. Cyber incident: notify the Office of the Australian Information Commissioner if personal data is involved.",

    // ── Section 12 — Review & Update ────────────────────────────
    "s12.lastReviewDate":"",
    "s12.nextReviewDate":"",
    "s12.adHocTriggers":"AUSTRAC publishes new Rules; AUSTRAC publishes sector-specific guidance; major change in business operations (new services, locations, services); significant ML / TF event in the precious-metals industry; staff change in the AML/CTF Compliance Officer role; any compliance breach identified internally or externally.",
  };
}

// Field metadata — used by the form layer to know which fields are
// textareas vs text vs date vs checkbox, plus helper text. Keys
// align with buildDefaults above. A field absent from this list is
// treated as a single-line text input.
export const FIELD_META={
  // s1
  "s1.businessName":{type:"text",label:"Business name"},
  "s1.abn":{type:"text",label:"ABN"},
  "s1.tradingNames":{type:"text",label:"Trading name(s)",help:"Other names the business operates under, if any."},
  "s1.address":{type:"text",label:"Business address"},
  "s1.phone":{type:"text",label:"Phone"},
  "s1.email":{type:"text",label:"Email"},
  "s1.website":{type:"text",label:"Website"},
  "s1.dealerLicenceNo":{type:"text",label:"Dealer / Pawnbroker licence number"},
  "s1.austracReNumber":{type:"text",label:"AUSTRAC reporting entity number",help:"Issued by AUSTRAC after enrolment. Leave blank until enrolled."},
  "s1.austracEnrolmentDate":{type:"date",label:"AUSTRAC enrolment date"},
  "s1.servicesBuyMetals":{type:"checkbox",label:"Buying precious metals from the public"},
  "s1.servicesSellMetals":{type:"checkbox",label:"Selling precious metals to the public"},
  "s1.servicesBuyStones":{type:"checkbox",label:"Buying precious stones (jewellery, gemstones)"},
  "s1.servicesSellStones":{type:"checkbox",label:"Selling precious stones"},
  "s1.servicesPawnbroking":{type:"checkbox",label:"Pawnbroking (loans secured by precious metals / stones)"},
  "s1.servicesBullion":{type:"checkbox",label:"Bullion dealing"},
  "s1.servicesOther":{type:"text",label:"Other designated services",help:"Free text — describe any service not listed above."},
  "s1.programPreparedDate":{type:"date",label:"Program prepared date"},
  "s1.programApprovedDate":{type:"date",label:"Program approved date"},
  "s1.seniorManagerName":{type:"text",label:"Senior manager name"},
  // s2
  "s2.officerName":{type:"text",label:"Compliance officer name"},
  "s2.officerTitle":{type:"text",label:"Position / title"},
  "s2.officerPhone":{type:"text",label:"Contact phone"},
  "s2.officerEmail":{type:"text",label:"Contact email"},
  "s2.officerAppointedDate":{type:"date",label:"Date of appointment"},
  "s2.fitAndProperConfirmed":{type:"checkbox",label:"I confirm the AML/CTF Compliance Officer has been assessed as fit and proper, with no relevant criminal history, no bankruptcy declarations, and is competent to discharge AML/CTF obligations."},
  "s2.backupOfficerName":{type:"text",label:"Backup compliance officer name (optional)"},
  "s2.backupOfficerContact":{type:"text",label:"Backup compliance officer contact (optional)"},
  // s3
  "s3.customerWalkInFreq":{type:"text",label:"Walk-in retail customers — frequency"},
  "s3.customerReturningFreq":{type:"text",label:"Returning regular customers — frequency"},
  "s3.customerEstateFreq":{type:"text",label:"Estate / deceased estate items — frequency"},
  "s3.customerTouristFreq":{type:"text",label:"Tourist / international visitors — frequency"},
  "s3.customerWholesaleFreq":{type:"text",label:"Trade / wholesale customers — frequency"},
  "s3.customerOnlineFreq":{type:"text",label:"Online customers — frequency"},
  "s3.customerOther":{type:"text",label:"Other customer types"},
  "s3.riskCdd":{type:"text",label:"Customer due-diligence risk rating"},
  "s3.riskCddJustification":{type:"textarea",label:"Justification — CDD risk"},
  "s3.riskGeographic":{type:"text",label:"Geographic risk rating"},
  "s3.riskGeographicJustification":{type:"textarea",label:"Justification — geographic risk"},
  "s3.riskProduct":{type:"text",label:"Service / product risk rating"},
  "s3.riskProductJustification":{type:"textarea",label:"Justification — service/product risk"},
  "s3.riskChannel":{type:"text",label:"Channel risk rating"},
  "s3.riskChannelJustification":{type:"textarea",label:"Justification — channel risk"},
  "s3.riskTransaction":{type:"text",label:"Transaction risk rating"},
  "s3.riskTransactionJustification":{type:"textarea",label:"Justification — transaction risk"},
  "s3.identifiedMlRisks":{type:"textarea",label:"Identified ML risks"},
  "s3.identifiedTfRisks":{type:"textarea",label:"Identified TF risks"},
  "s3.identifiedPfRisks":{type:"textarea",label:"Identified PF (proliferation financing) risks"},
  "s3.riskTreatment":{type:"textarea",label:"Risk treatment / mitigation strategies"},
  // s4
  "s4.initialCdd":{type:"textarea",label:"Initial CDD procedure"},
  "s4.idDriversLicence":{type:"checkbox",label:"Australian Driver's Licence"},
  "s4.idPassportAu":{type:"checkbox",label:"Australian Passport"},
  "s4.idPassportForeign":{type:"checkbox",label:"Foreign Passport"},
  "s4.idPhotoIdGov":{type:"checkbox",label:"Photo ID card / Government issued photo ID"},
  "s4.idTwoNonPhoto":{type:"checkbox",label:"Two non-photo identification documents (combined)"},
  "s4.idOther":{type:"text",label:"Other accepted ID types"},
  "s4.verifyVisualSighting":{type:"checkbox",label:"Visual sighting and recording of ID details"},
  "s4.verifyPhotoCapture":{type:"checkbox",label:"Photo capture of ID document"},
  "s4.verifyBiometric":{type:"checkbox",label:"Biometric verification (Scantek — when activated)"},
  "s4.enhancedCddTriggers":{type:"textarea",label:"Triggers for enhanced CDD"},
  "s4.ongoingCdd":{type:"textarea",label:"Ongoing CDD procedure"},
  "s4.pepProcedure":{type:"textarea",label:"PEP (Politically Exposed Persons) screening"},
  "s4.tfsProcedure":{type:"textarea",label:"TFS (Targeted Financial Sanctions) screening"},
  "s4.sourceOfFundsProcedure":{type:"textarea",label:"Source of funds / source of wealth verification"},
  "s4.cddFailureProcedure":{type:"textarea",label:"What happens if CDD fails"},
  // s5
  "s5.monitoringProcedure":{type:"textarea",label:"Transaction monitoring procedure"},
  "s5.suspiciousIndicators":{type:"textarea",label:"Indicators of suspicious activity"},
  "s5.smrResponsible":{type:"text",label:"SMR — who is responsible"},
  "s5.smrSubmissionMethod":{type:"textarea",label:"SMR submission method"},
  "s5.tippingOff":{type:"textarea",label:"Tipping-off prohibition"},
  "s5.ttrTrigger":{type:"textarea",label:"TTR trigger"},
  "s5.ttrAggregation":{type:"textarea",label:"TTR 24-hour aggregation rule"},
  "s5.ttrResponsible":{type:"text",label:"TTR — who is responsible"},
  "s5.iftiProcedure":{type:"textarea",label:"IFTI procedure"},
  "s5.structuringDetection":{type:"textarea",label:"Structuring detection"},
  // s6
  "s6.recordsKept":{type:"textarea",label:"Records kept"},
  "s6.retentionPeriod":{type:"textarea",label:"Retention period"},
  "s6.storageMethod":{type:"textarea",label:"Storage method"},
  "s6.accessControls":{type:"textarea",label:"Access controls"},
  "s6.destructionProcedure":{type:"textarea",label:"Destruction procedure"},
  // s7
  "s7.initialTraining":{type:"textarea",label:"Initial training"},
  "s7.refresherFrequency":{type:"textarea",label:"Refresher frequency"},
  "s7.deliveryMethod":{type:"textarea",label:"Delivery method"},
  "s7.trainingRecords":{type:"textarea",label:"Training records"},
  "s7.preEmploymentScreening":{type:"textarea",label:"Pre-employment screening"},
  "s7.disciplinary":{type:"textarea",label:"Disciplinary procedures"},
  // s8
  "s8.reviewFrequency":{type:"textarea",label:"Review frequency"},
  "s8.reviewer":{type:"textarea",label:"Reviewer (independent)"},
  "s8.firstReviewDue":{type:"date",label:"First review due date",help:"3 years from program approval. Leave blank to compute on save."},
  "s8.reviewScope":{type:"textarea",label:"Scope of review"},
  "s8.findingsHandling":{type:"textarea",label:"How findings are handled"},
  // s9
  "s9.seniorManagerName":{type:"text",label:"Senior manager name"},
  "s9.oversightDescription":{type:"textarea",label:"How oversight is provided"},
  "s9.reportingChannels":{type:"textarea",label:"Reporting channels"},
  // s10
  "s10.summary":{type:"textarea",label:"Regulatory obligations summary"},
  // s11
  "s11.escalationTriggers":{type:"textarea",label:"When to escalate to management"},
  "s11.incidentLog":{type:"textarea",label:"Internal incident log"},
  "s11.authorityContact":{type:"textarea",label:"When to contact authorities"},
  // s12
  "s12.lastReviewDate":{type:"date",label:"Date of last review"},
  "s12.nextReviewDate":{type:"date",label:"Next scheduled review date",help:"Auto-calculated as approval date + 3 years on save if left blank."},
  "s12.adHocTriggers":{type:"textarea",label:"Triggers for ad-hoc review"},
};

// Section → ordered list of field keys. Drives the form's render
// order and keeps related fields together.
export const SECTION_FIELDS={
  s1:["s1.businessName","s1.abn","s1.tradingNames","s1.address","s1.phone","s1.email","s1.website","s1.dealerLicenceNo","s1.austracReNumber","s1.austracEnrolmentDate","s1.servicesBuyMetals","s1.servicesSellMetals","s1.servicesBuyStones","s1.servicesSellStones","s1.servicesPawnbroking","s1.servicesBullion","s1.servicesOther","s1.programPreparedDate","s1.programApprovedDate","s1.seniorManagerName"],
  s2:["s2.officerName","s2.officerTitle","s2.officerPhone","s2.officerEmail","s2.officerAppointedDate","s2.fitAndProperConfirmed","s2.backupOfficerName","s2.backupOfficerContact"],
  s3:["s3.customerWalkInFreq","s3.customerReturningFreq","s3.customerEstateFreq","s3.customerTouristFreq","s3.customerWholesaleFreq","s3.customerOnlineFreq","s3.customerOther","s3.riskCdd","s3.riskCddJustification","s3.riskGeographic","s3.riskGeographicJustification","s3.riskProduct","s3.riskProductJustification","s3.riskChannel","s3.riskChannelJustification","s3.riskTransaction","s3.riskTransactionJustification","s3.identifiedMlRisks","s3.identifiedTfRisks","s3.identifiedPfRisks","s3.riskTreatment"],
  s4:["s4.initialCdd","s4.idDriversLicence","s4.idPassportAu","s4.idPassportForeign","s4.idPhotoIdGov","s4.idTwoNonPhoto","s4.idOther","s4.verifyVisualSighting","s4.verifyPhotoCapture","s4.verifyBiometric","s4.enhancedCddTriggers","s4.ongoingCdd","s4.pepProcedure","s4.tfsProcedure","s4.sourceOfFundsProcedure","s4.cddFailureProcedure"],
  s5:["s5.monitoringProcedure","s5.suspiciousIndicators","s5.smrResponsible","s5.smrSubmissionMethod","s5.tippingOff","s5.ttrTrigger","s5.ttrAggregation","s5.ttrResponsible","s5.iftiProcedure","s5.structuringDetection"],
  s6:["s6.recordsKept","s6.retentionPeriod","s6.storageMethod","s6.accessControls","s6.destructionProcedure"],
  s7:["s7.initialTraining","s7.refresherFrequency","s7.deliveryMethod","s7.trainingRecords","s7.preEmploymentScreening","s7.disciplinary"],
  s8:["s8.reviewFrequency","s8.reviewer","s8.firstReviewDue","s8.reviewScope","s8.findingsHandling"],
  s9:["s9.seniorManagerName","s9.oversightDescription","s9.reportingChannels"],
  s10:["s10.summary"],
  s11:["s11.escalationTriggers","s11.incidentLog","s11.authorityContact"],
  s12:["s12.lastReviewDate","s12.nextReviewDate","s12.adHocTriggers"],
};

// Compute the next version string after `current`. Minor bump by
// default (1.0 → 1.1, 1.9 → 1.10). Caller can request a major bump
// for structural changes.
export function nextVersion(current,major){
  if(!current)return "1.0";
  const m=String(current).match(/^(\d+)\.(\d+)$/);
  if(!m)return "1.0";
  const maj=parseInt(m[1],10),min=parseInt(m[2],10);
  return major?(maj+1)+".0":maj+"."+(min+1);
}
