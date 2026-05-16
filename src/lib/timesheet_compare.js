// LootLedger — weekly timesheet comparison engine.
// Phase 5.2 staff-workspace Commit 2 (2026-05-16).
//
// Compares two independent records of a staff member's hours for
// a given week:
//   - "self edits"  — staff_hours_created / _updated audit_log
//                     rows where actor === user_id (the staff
//                     themselves typed in Profile → Hours).
//   - "admin edits" — same audit events where actor !== user_id
//                     (an owner/manager entered it via the
//                     /staff/today bulk editor).
//
// Per day in the week, we pick the LATEST audit row from each
// source. If both exist and differ in start_time / end_time /
// break_minutes / note, that's a discrepancy.
//
// Semantic note: the original spec assumed EOD-email-embedded
// staff hours as the "boss" source, but Commit 1 (4f0ec1b)
// removed staff hours from the EOD report. audit_log is the
// real source of truth for who-changed-what, so this engine
// uses it directly — same intent ("two independent records
// of the same day disagree"), different plumbing.
//
// Future: an accountant-side reconciliation could compare what
// was sent in each weekly timesheet vs the live audit_log
// state. The timesheet_submissions table (migration 0025)
// captures hours_snapshot + discrepancies at send time to make
// that future surface feasible.
//
// Pure functions — no React, no async. The caller loads
// staff_hours + audit_log rows and passes them in.

import {sS} from "./utils.js";

const DAY_MS = 24 * 3600 * 1000;

function isoDate(d){
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + dd;
}

// The Monday of the week containing `date`. Inputs and outputs
// are Date objects normalised to midnight local time.
export function weekStartMonday(date){
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay();           // 0 = Sunday, 1 = Monday, ...
  const back = dow === 0 ? 6 : dow - 1;
  d.setDate(d.getDate() - back);
  return d;
}

// Return the 7 dates (Mon..Sun) of the week containing the given
// date, as ISO strings.
export function weekDates(date){
  const start = weekStartMonday(date);
  const out = [];
  for(let i = 0; i < 7; i++){
    out.push(isoDate(new Date(start.getTime() + i * DAY_MS)));
  }
  return out;
}

// Normalise an audit_log payload's "after" snapshot into the
// shape the compare logic uses. The upsert_staff_hours RPC
// (migration 0014) writes a `payload.after = {start_time,
// end_time, break_minutes, note}` for both create and update
// events.
function snapshotFromAuditRow(row){
  const p = row && row.payload;
  if(!p)return null;
  const a = p.after || null;
  if(!a)return null;
  return {
    start: a.start_time ? String(a.start_time).slice(0, 5) : "",
    end:   a.end_time   ? String(a.end_time).slice(0, 5)   : "",
    break: (a.break_minutes == null) ? 0 : Number(a.break_minutes),
    note:  sS(a.note),
  };
}

function sameSnapshot(a, b){
  if(!a || !b) return false;
  return a.start === b.start
      && a.end === b.end
      && Number(a.break) === Number(b.break)
      && sS(a.note) === sS(b.note);
}

// Build a Set of staff_hours.id values that belong to the target
// user. Used to filter audit_log rows to just the ones about this
// user's hours.
export function hoursIdsForUser(allHoursRows, userId){
  const set = new Set();
  (allHoursRows || []).forEach(r => {
    if(r && r.user_id === userId && r.id) set.add(r.id);
  });
  return set;
}

// Filter + index audit_log rows by (work_date) and by source
// (self vs admin). Pick the most recent row per (date, source).
//
// auditRows: array of audit_log entries with event_type in
//   ('staff_hours_created', 'staff_hours_updated'). Each row's
//   payload includes payload.work_date and payload.after.
// userId: the target staff's user_id.
//
// Returns: { [date]: { self: snapshot|null, admin: snapshot|null,
//                      selfAt: iso|null, adminAt: iso|null,
//                      adminActor: uuid|null } }
function indexAuditBySource(auditRows, userId){
  const out = {};
  (auditRows || []).forEach(row => {
    if(!row || !row.payload) return;
    const date = row.payload.work_date;
    if(!date) return;
    const snap = snapshotFromAuditRow(row);
    if(!snap) return;
    const bucket = out[date] || {self: null, admin: null, selfAt: null, adminAt: null, adminActor: null};
    const isSelf = row.actor === userId;
    if(isSelf){
      if(!bucket.selfAt || row.created_at > bucket.selfAt){
        bucket.self = snap;
        bucket.selfAt = row.created_at;
      }
    } else {
      if(!bucket.adminAt || row.created_at > bucket.adminAt){
        bucket.admin = snap;
        bucket.adminAt = row.created_at;
        bucket.adminActor = row.actor || null;
      }
    }
    out[date] = bucket;
  });
  return out;
}

// Main entry point. Compute discrepancies for the 7-day window
// ending Sunday of the week containing `weekDate`.
//
// Args:
//   weekDate: any Date inside the target week.
//   userId: the staff member whose hours we're comparing.
//   staffHoursRows: rows from staff_hours for the week (only used
//     to constrain auditRows further if needed; pass [] if not
//     available — the audit rows already carry the date).
//   auditRows: rows from audit_log for the week with event_type
//     in ('staff_hours_created','staff_hours_updated'), already
//     pre-filtered to this staff's hours where possible. If the
//     caller can't pre-filter (e.g. audit_log SELECTs are shop-
//     scoped, not user-scoped), they can pass shop-wide rows and
//     this engine still ignores any row whose payload.target_user_id
//     isn't userId.
//
// Returns an array, one entry per day in the week, with:
//   { date, weekday, status, message, self, admin, adminAt,
//     adminActor }
// status is one of:
//   'match'                — both sources present + identical.
//   'self_only'            — only the staff themselves logged it.
//   'admin_only'           — only an admin logged it (boss-only entry).
//   'differs'              — both present + differ; see self vs admin.
//   'empty'                — neither source has an entry for this day.
export function compareWeek({weekDate, userId, staffHoursRows, auditRows}){
  const dates = weekDates(weekDate || new Date());
  // Constrain to rows for this user. Audit payloads from
  // upsert_staff_hours carry payload.target_user_id which is the
  // row owner — that's the source of truth for "is this row about
  // this user." Fallback: if target_user_id is missing, the row
  // is dropped.
  const myAudits = (auditRows || []).filter(r => {
    if(!r || !r.payload) return false;
    const tu = r.payload.target_user_id;
    if(!tu) return false;
    return String(tu) === String(userId);
  });
  const idx = indexAuditBySource(myAudits, userId);
  const out = [];
  dates.forEach(d => {
    const bucket = idx[d];
    const weekday = new Date(d + "T00:00:00").toLocaleDateString("en-AU", {weekday: "short"});
    if(!bucket){
      out.push({date: d, weekday, status: "empty", message: "No entry", self: null, admin: null, adminAt: null, adminActor: null});
      return;
    }
    const {self, admin, adminAt, adminActor} = bucket;
    if(self && admin){
      if(sameSnapshot(self, admin)){
        out.push({date: d, weekday, status: "match", message: "Match", self, admin, adminAt, adminActor});
      } else {
        out.push({date: d, weekday, status: "differs", message: "Staff edit differs from admin edit", self, admin, adminAt, adminActor});
      }
    } else if(self){
      out.push({date: d, weekday, status: "self_only", message: "Logged by staff only", self, admin: null, adminAt: null, adminActor: null});
    } else if(admin){
      out.push({date: d, weekday, status: "admin_only", message: "Logged by admin only", self: null, admin, adminAt, adminActor});
    } else {
      out.push({date: d, weekday, status: "empty", message: "No entry", self: null, admin: null, adminAt: null, adminActor: null});
    }
  });
  return out;
}

// Convenience — how many rows in the comparison need attention?
// Used by the UI to render a small badge "📊 N discrepancies".
export function attentionCount(rows){
  return (rows || []).filter(r => r && (r.status === "differs" || r.status === "admin_only")).length;
}

// HTML rendering for the discrepancy section embedded in the
// weekly timesheet email. Returns a string ready to splice into
// the email's htmlBody.
export function discrepanciesHtmlSection(rows){
  const att = attentionCount(rows);
  const lines = [];
  lines.push('<div style="font-family:Arial,sans-serif;font-size:13px;color:#222;margin-top:18px;padding-top:10px;border-top:1px solid #eee">');
  lines.push('<div style="font-weight:bold;color:#222;font-size:14px;margin-bottom:6px">📊 Discrepancy report</div>');
  if(att === 0){
    lines.push('<div style="color:#1a7a1a">✓ No discrepancies. Staff and admin entries match (or only one source recorded each day).</div>');
    lines.push('</div>');
    return lines.join("\n");
  }
  lines.push('<div style="color:#666;margin-bottom:8px">Compared the staff-typed entries (Profile → Hours) against the admin-typed entries (Bulk Hours Editor) for each day this week.</div>');
  lines.push('<table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:12px">');
  lines.push('<tr><th style="background:#f5f5f5;border:1px solid #ddd;padding:6px 8px;text-align:left">Day</th><th style="background:#f5f5f5;border:1px solid #ddd;padding:6px 8px;text-align:left">Status</th><th style="background:#f5f5f5;border:1px solid #ddd;padding:6px 8px;text-align:left">Staff entry</th><th style="background:#f5f5f5;border:1px solid #ddd;padding:6px 8px;text-align:left">Admin entry</th></tr>');
  rows.forEach(r => {
    if(r.status === "match" || r.status === "empty" || r.status === "self_only")return;
    const colour = r.status === "differs" ? "#c00" : "#c80";
    const selfStr = r.self ? (r.self.start + "–" + r.self.end + " · " + r.self.break + "m") : "—";
    const adminStr = r.admin ? (r.admin.start + "–" + r.admin.end + " · " + r.admin.break + "m") : "—";
    lines.push('<tr>'
      + '<td style="border:1px solid #ddd;padding:6px 8px"><strong>' + r.weekday + '</strong><br>' + r.date + '</td>'
      + '<td style="border:1px solid #ddd;padding:6px 8px;color:' + colour + ';font-weight:bold">' + (r.status === "differs" ? "Differs" : "Admin only") + '</td>'
      + '<td style="border:1px solid #ddd;padding:6px 8px;font-family:monospace">' + selfStr + '</td>'
      + '<td style="border:1px solid #ddd;padding:6px 8px;font-family:monospace">' + adminStr + '</td>'
      + '</tr>');
  });
  lines.push('</table>');
  lines.push('</div>');
  return lines.join("\n");
}
