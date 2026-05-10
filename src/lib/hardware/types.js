// LootLedger — hardware driver types (JSDoc).
// Phase 5.2-A. Each driver implements this interface and is
// reachable through src/lib/hardware/index.js. Internally each
// driver branches on getMode() to call either the Live
// implementation or the Mock implementation. Both branches
// log to hardware_log via src/lib/hardware/log.js.
//
// Per-device toggles (Adjustment 18 from v3.2): the mode for
// each driver is independent — a shop can run printer Live and
// scale Mock simultaneously. The Settings → Hardware section
// surfaces the per-device toggles + "Mock all hardware" /
// "Live all hardware" convenience buttons.

/**
 * @typedef {"live"|"mock"} HardwareMode
 */

/**
 * @typedef {"printer"|"scale"|"scanner"|"signature"|"cashDrawer"} HardwareDeviceType
 */

/**
 * @typedef {Object} DiagnoseResult
 * @property {boolean} ok
 * @property {HardwareMode} mode
 * @property {string} details
 * @property {string} [error]
 * @property {number} latencyMs
 */

/**
 * @typedef {Object} ReceiptObject
 * @property {{shopName?: string, abn?: string, address?: string, phone?: string}} [header]
 * @property {{id?: string, date?: string, vendor?: string, lineItems?: Array<Object>, total?: number}} [transaction]
 * @property {{taxNote?: string, signature?: string, customMessage?: string}} [footer]
 */

/**
 * @typedef {Object} ScaleReading
 * @property {number} weight  - In the unit specified by `unit` below.
 * @property {"g"} unit       - Always grams from the driver; UI converts for display.
 * @property {boolean} stable
 * @property {string} [raw]   - Raw protocol string for debugging.
 */

/**
 * @typedef {Object} BarcodeScan
 * @property {string} barcode
 * @property {string} format
 */

/**
 * @typedef {Object} DriverShape
 * @property {() => Promise<boolean>} isAvailable
 * @property {() => HardwareMode} getMode
 * @property {(mode: HardwareMode) => void} setMode
 * @property {() => Promise<DiagnoseResult>} diagnose
 */

export {};
