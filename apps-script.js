// ═══════════════════════════════════════════════════════════
// DeLeon Judo Club — Google Apps Script Backend
// ═══════════════════════════════════════════════════════════
//
// Serves both signin (student kiosk) and admin (attendance tracker).
//
// SETUP:
// 1. Create a Google Sheet with tabs: Roster, Attendance, Check-ins, New Students, Cancelled, Dues, Settings
// 2. Extensions > Apps Script > paste this code
// 3. Project Settings > Script Properties > add WRITE_KEY (any secret string)
// 4. Deploy > New Deployment > Web App > Execute as: Me, Access: Anyone
// 5. Copy the deployment URL into both HTML files
//
// ═══════════════════════════════════════════════════════════

const TAB_ROSTER = 'Roster';
const TAB_ATTENDANCE = 'Attendance';
const TAB_CHECKINS = 'Check-ins';
const TAB_NEW_STUDENTS = 'New Students';
const TAB_CANCELLED = 'Cancelled';
const TAB_DUES = 'Dues';
const TAB_SETTINGS = 'Settings';

// ── Helpers ──────────────────────────────────────────────

function getSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;

  // Auto-create tab with headers if missing
  sheet = ss.insertSheet(name);
  var headers = {
    'Roster':       [['Name']],
    'Attendance':   [['Date', 'Names']],
    'Check-ins':    [['Date', 'Name', 'Timestamp', 'Class', 'Paid']],
    'New Students': [['First Name', 'Last Name', 'Date', 'Time', 'Class', 'Status']],
    'Cancelled':    [['Date', 'Timestamp']],
    'Dues':         [['Month', 'Student Name', 'Paid', 'Date Confirmed', 'Source']],
    'Settings':     [['Key', 'Value']]
  };
  if (headers[name]) {
    sheet.getRange(1, 1, 1, headers[name][0].length).setValues(headers[name]);
  }
  return sheet;
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function verifyKey(key) {
  var props = PropertiesService.getScriptProperties();
  var writeKey = props.getProperty('WRITE_KEY');
  if (!writeKey) return true; // No key set = dev mode, allow all
  return key === writeKey;
}

// ── GET ──────────────────────────────────────────────────

function doGet(e) {
  try {
    var action = (e.parameter.action || '').toLowerCase();
    switch (action) {
      case 'roster':         return handleGetRoster();
      case 'attendance':     return handleGetAttendance(e.parameter.date);
      case 'allattendance':  return handleGetAllAttendance();
      case 'cancelled':      return handleGetCancelled();
      case 'newstudents':    return handleGetNewStudents();
      case 'dues':           return handleGetDues();
      case 'settings':       return handleGetSettings();
      case 'ping':           return json({ ok: true, ts: new Date().toISOString() });
      default:               return json({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return json({ error: err.message });
  }
}

function handleGetRoster() {
  var sheet = getSheet(TAB_ROSTER);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return json({ roster: [], students: [] });

  var names = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
    .map(function(r) { return r[0]; })
    .filter(function(n) { return n && n.toString().trim(); });

  // Two formats: "Last, First" array for admin, {firstName, lastName} array for signin
  var students = names.map(function(n) {
    var parts = n.toString().split(',');
    return { firstName: (parts[1] || '').trim(), lastName: (parts[0] || '').trim() };
  });

  return json({ roster: names, students: students });
}

function handleGetAttendance(date) {
  if (!date) return json({ error: 'date parameter required' });

  var sheet = getSheet(TAB_ATTENDANCE);
  var lastRow = sheet.getLastRow();

  // Check Attendance tab first (admin-authored = authoritative)
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === date) {
        try { return json({ date: date, present: JSON.parse(data[i][1]) }); }
        catch (ex) { return json({ date: date, present: [] }); }
      }
    }
  }

  // No admin record — fall back to self-service check-ins
  return json({ date: date, present: getCheckinsForDate(date), source: 'checkins' });
}

function handleGetAllAttendance() {
  var sheet = getSheet(TAB_ATTENDANCE);
  var lastRow = sheet.getLastRow();
  var att = {};
  var attendanceDates = {};

  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) {
      if (data[i][0]) {
        try { att[data[i][0]] = JSON.parse(data[i][1]); }
        catch (ex) { att[data[i][0]] = []; }
        attendanceDates[data[i][0]] = true;
      }
    }
  }

  // For dates WITHOUT an admin attendance record, populate from check-ins
  var ciSheet = getSheet(TAB_CHECKINS);
  var ciLastRow = ciSheet.getLastRow();
  if (ciLastRow >= 2) {
    var ciData = ciSheet.getRange(2, 1, ciLastRow - 1, 2).getValues();
    for (var j = 0; j < ciData.length; j++) {
      var date = ciData[j][0];
      var name = ciData[j][1];
      if (date && name && !attendanceDates[date]) {
        if (!att[date]) att[date] = [];
        if (att[date].indexOf(name) === -1) att[date].push(name);
      }
    }
  }

  return json({ attendance: att });
}

function getCheckinsForDate(date) {
  var sheet = getSheet(TAB_CHECKINS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  var names = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === date && data[i][1] && names.indexOf(data[i][1]) === -1) {
      names.push(data[i][1]);
    }
  }
  return names;
}

function handleGetCancelled() {
  var sheet = getSheet(TAB_CANCELLED);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return json({ cancelled: [] });

  var dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues()
    .map(function(r) { return r[0]; })
    .filter(function(d) { return d; });

  return json({ cancelled: dates });
}

function handleGetNewStudents() {
  var sheet = getSheet(TAB_NEW_STUDENTS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return json({ students: [] });

  var data = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  var students = [];
  for (var i = 0; i < data.length; i++) {
    if (data[i][0]) {
      students.push({
        firstName: data[i][0], lastName: data[i][1],
        date: data[i][2], time: data[i][3],
        class: data[i][4], status: data[i][5] || 'pending'
      });
    }
  }
  return json({ students: students });
}

// ── POST ─────────────────────────────────────────────────

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = (body.action || '').toLowerCase();

    // Public endpoints (from student kiosk — no key required)
    if (action === 'checkin')      return handleCheckin(body);
    if (action === 'new_student')  return handleNewStudent(body);
    if (action === 'recorddues')   return handleRecordDues(body);

    // Protected endpoints (admin — require WRITE_KEY)
    if (!verifyKey(body.key)) return json({ error: 'Invalid write key' });

    switch (action) {
      case 'addstudent':      return handleAddStudent(body);
      case 'removestudent':   return handleRemoveStudent(body);
      case 'editstudent':     return handleEditStudent(body);
      case 'saveattendance':  return handleSaveAttendance(body);
      case 'cancelclass':     return handleCancelClass(body);
      case 'restoreclass':    return handleRestoreClass(body);
      case 'toggledues':      return handleToggleDues(body);
      case 'setsetting':      return handleSetSetting(body);
      default:                return json({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return json({ error: err.message });
  }
}

// ── Student check-in (from signin kiosk) ─────────────────

function handleCheckin(body) {
  var name = body.lastName + ', ' + body.firstName;
  var sheet = getSheet(TAB_CHECKINS);
  sheet.appendRow([
    body.date || '',
    name,
    body.time || new Date().toISOString(),
    body.class || '',
    body.paid || ''
  ]);
  return json({ ok: true, name: name });
}

function handleNewStudent(body) {
  // Record in New Students tab
  var sheet = getSheet(TAB_NEW_STUDENTS);
  sheet.appendRow([
    body.firstName, body.lastName,
    body.date || '', body.time || '',
    body.class || '', 'pending'
  ]);

  // Also record check-in
  var name = body.lastName + ', ' + body.firstName;
  var ciSheet = getSheet(TAB_CHECKINS);
  ciSheet.appendRow([
    body.date || '', name,
    body.time || new Date().toISOString(),
    body.class || '', body.paid || ''
  ]);

  // Auto-add to roster
  addToRoster(name);

  return json({ ok: true });
}

// ── Admin roster management ──────────────────────────────

function addToRoster(name) {
  var sheet = getSheet(TAB_ROSTER);
  var lastRow = sheet.getLastRow();

  // Check for duplicate
  if (lastRow >= 2) {
    var existing = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < existing.length; i++) {
      if (existing[i][0] === name) return; // Already exists
    }
  }

  sheet.appendRow([name]);

  // Re-sort roster alphabetically
  if (sheet.getLastRow() >= 3) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).sort(1);
  }
}

function handleAddStudent(body) {
  var name = body.last + ', ' + body.first;
  addToRoster(name);
  return json({ ok: true, name: name });
}

function handleEditStudent(body) {
  var oldName = body.oldName;
  var newName = body.newLast + ', ' + body.newFirst;
  if (!oldName || !newName) return json({ error: 'oldName, newLast, newFirst required' });

  // Rename in Roster
  var roster = getSheet(TAB_ROSTER);
  var rosterLast = roster.getLastRow();
  if (rosterLast >= 2) {
    var names = roster.getRange(2, 1, rosterLast - 1, 1).getValues();
    for (var i = 0; i < names.length; i++) {
      if (names[i][0] === oldName) {
        roster.getRange(i + 2, 1).setValue(newName);
        break;
      }
    }
    if (roster.getLastRow() >= 3) {
      roster.getRange(2, 1, roster.getLastRow() - 1, 1).sort(1);
    }
  }

  // Update Attendance records
  var att = getSheet(TAB_ATTENDANCE);
  var attLast = att.getLastRow();
  if (attLast >= 2) {
    var data = att.getRange(2, 1, attLast - 1, 2).getValues();
    for (var j = 0; j < data.length; j++) {
      try {
        var present = JSON.parse(data[j][1]);
        var idx = present.indexOf(oldName);
        if (idx !== -1) {
          present[idx] = newName;
          att.getRange(j + 2, 2).setValue(JSON.stringify(present));
        }
      } catch (ex) { /* skip malformed */ }
    }
  }

  // Update Check-ins
  var ci = getSheet(TAB_CHECKINS);
  var ciLast = ci.getLastRow();
  if (ciLast >= 2) {
    var ciData = ci.getRange(2, 2, ciLast - 1, 1).getValues();
    for (var k = 0; k < ciData.length; k++) {
      if (ciData[k][0] === oldName) {
        ci.getRange(k + 2, 2).setValue(newName);
      }
    }
  }

  return json({ ok: true, oldName: oldName, newName: newName });
}

function handleRemoveStudent(body) {
  var sheet = getSheet(TAB_ROSTER);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return json({ ok: true });

  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    if (data[i][0] === body.name) {
      sheet.deleteRow(i + 2);
      break;
    }
  }
  return json({ ok: true });
}

// ── Admin attendance ─────────────────────────────────────

function handleSaveAttendance(body) {
  var sheet = getSheet(TAB_ATTENDANCE);
  var lastRow = sheet.getLastRow();
  var date = body.date;
  var names = body.names || [];

  // Update existing row if present
  if (lastRow >= 2) {
    var dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < dates.length; i++) {
      if (dates[i][0] === date) {
        sheet.getRange(i + 2, 2).setValue(JSON.stringify(names));
        return json({ ok: true });
      }
    }
  }

  // New date
  sheet.appendRow([date, JSON.stringify(names)]);
  return json({ ok: true });
}

// ── Admin cancel / restore ───────────────────────────────

function handleCancelClass(body) {
  var sheet = getSheet(TAB_CANCELLED);
  var lastRow = sheet.getLastRow();

  // Check if already cancelled
  if (lastRow >= 2) {
    var dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < dates.length; i++) {
      if (dates[i][0] === body.date) return json({ ok: true });
    }
  }

  sheet.appendRow([body.date, new Date().toISOString()]);
  return json({ ok: true });
}

function handleRestoreClass(body) {
  var sheet = getSheet(TAB_CANCELLED);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return json({ ok: true });

  var dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = dates.length - 1; i >= 0; i--) {
    if (dates[i][0] === body.date) {
      sheet.deleteRow(i + 2);
      break;
    }
  }
  return json({ ok: true });
}

// ── Dues ────────────────────────────────────────────────

function handleGetDues() {
  var sheet = getSheet(TAB_DUES);
  var lastRow = sheet.getLastRow();
  var dues = {};

  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
    for (var i = 0; i < data.length; i++) {
      var month = data[i][0];
      var name = data[i][1];
      if (!month || !name) continue;
      if (!dues[month]) dues[month] = {};
      dues[month][name] = {
        paid: data[i][2] === true || data[i][2] === 'TRUE' || data[i][2] === true,
        date: data[i][3] || '',
        source: data[i][4] || ''
      };
    }
  }

  return json({ dues: dues });
}

// Public: student self-reports payment from signin kiosk
function handleRecordDues(body) {
  var name = body.lastName + ', ' + body.firstName;
  var month = body.month;
  if (!month) return json({ error: 'month required' });

  var sheet = getSheet(TAB_DUES);
  var lastRow = sheet.getLastRow();

  // Update existing row if present
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === month && data[i][1] === name) {
        sheet.getRange(i + 2, 3).setValue(true);
        sheet.getRange(i + 2, 4).setValue(body.date || new Date().toISOString());
        sheet.getRange(i + 2, 5).setValue('self');
        return json({ ok: true });
      }
    }
  }

  sheet.appendRow([month, name, true, body.date || new Date().toISOString(), 'self']);
  return json({ ok: true });
}

// Protected: admin toggles dues status
function handleToggleDues(body) {
  var name = body.name;
  var month = body.month;
  var paid = body.paid;
  if (!month || !name) return json({ error: 'month and name required' });

  var sheet = getSheet(TAB_DUES);
  var lastRow = sheet.getLastRow();

  // Update existing row
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === month && data[i][1] === name) {
        sheet.getRange(i + 2, 3).setValue(paid);
        sheet.getRange(i + 2, 4).setValue(body.date || new Date().toISOString());
        sheet.getRange(i + 2, 5).setValue('admin');
        return json({ ok: true });
      }
    }
  }

  sheet.appendRow([month, name, paid, body.date || new Date().toISOString(), 'admin']);
  return json({ ok: true });
}

// ── Settings ────────────────────────────────────────────

function handleGetSettings() {
  var sheet = getSheet(TAB_SETTINGS);
  var lastRow = sheet.getLastRow();
  var settings = {};

  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) {
      if (data[i][0]) settings[data[i][0]] = data[i][1];
    }
  }

  return json({ settings: settings });
}

function handleSetSetting(body) {
  var key = body.settingKey;
  var value = body.settingValue;
  if (!key) return json({ error: 'settingKey required' });

  var sheet = getSheet(TAB_SETTINGS);
  var lastRow = sheet.getLastRow();

  // Update existing
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === key) {
        sheet.getRange(i + 2, 2).setValue(value);
        return json({ ok: true });
      }
    }
  }

  sheet.appendRow([key, value]);
  return json({ ok: true });
}
