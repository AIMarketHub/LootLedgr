/**
 * @file Regional compliance module contract (LootLedger).
 *
 * Each regional compliance module exports an object conforming to
 * the shape described below. New regions implement all required
 * fields; if a region doesn't have a particular concept (e.g. no
 * police hold), it provides a sensible no-op or null.
 *
 * This file is JSDoc-only. It has no runtime exports.
 *
 * Briefing reference: Section 6.4.
 */

/**
 * @typedef {Object} RegionThresholds
 * @property {number} cashWarn               Soft warning threshold (display only).
 * @property {number} bullionCDD             Hard CDD trigger for cash bullion buys.
 * @property {number} cashTTR                Mandatory threshold report.
 * @property {number} [structuringWindow]    Days for rolling structuring detection.
 * @property {number} [structuringThreshold] Total triggering structuring suspicion.
 */

/**
 * @typedef {Object} RegulatorInfo
 * @property {string} name           Short name (e.g. "AUSTRAC").
 * @property {string} fullName       Full agency name.
 * @property {string} ttrFormName    Threshold report form name.
 * @property {string} smrFormName    Suspicious matter report form name.
 */

/**
 * @typedef {Object} IdTypeOption
 * @property {string} code           Internal code (e.g. "DL", "PASSPORT").
 * @property {string} label          Display label.
 * @property {boolean} primary       Whether this is a primary ID document.
 */

/**
 * @typedef {Object} SubJurisdiction
 * @property {string} code                   Internal code (e.g. "VIC", "NSW").
 * @property {string} name                   Display name.
 * @property {number} [policeHoldHours]      Mandatory hold period for this jurisdiction.
 * @property {string} [secondHandDealersAct] Governing legislation.
 */

/**
 * @typedef {Object} RegionContract
 * @property {string} code                       ISO-style region code (e.g. "AU", "CN").
 * @property {string} name                       Human-readable region name.
 * @property {string} currency                   ISO currency code.
 * @property {string} currencySymbol             Display symbol (e.g. "$").
 * @property {RegionThresholds} thresholds
 * @property {number} [holdPeriodHours]          Mandatory hold on bought goods.
 * @property {number} [policeNoticeWindow]       Days a formal police notice extends a hold.
 * @property {number} [policeNoticeReissueGrace] Additional days available on reissue.
 * @property {number} [retentionYears]           Mandatory record retention.
 * @property {number} [policeAccessImmediateMonths] Records remain immediately producible.
 * @property {IdTypeOption[]} [acceptedIdTypes]  Identity documents accepted for CDD.
 * @property {RegulatorInfo} [regulator]         Regulator and report-form names.
 * @property {SubJurisdiction[]} [subJurisdictions] States/provinces/territories.
 * @property {Function} checkCompliance          (transaction, history) => {flags, blocks, warnings}.
 * @property {Function} [generateRegulatorReport] (filter) => CSV/structured data for the regulator.
 * @property {Function} [generatePoliceReport]   (state, filter) => CSV in state's required format.
 * @property {Function} [cddFormSchema]          () => CDD form field definitions.
 * @property {Function} [privacyNoticeText]      (biz, abn) => Privacy notice text.
 */

// (no runtime exports)
