const NOTIFY_EMAIL = 'info@vmocion.com';       // notification inbox
const SHEET_NAME = 'Waitlist';
const SPREADSHEET_ID_KEY = 'WAITLIST_SPREADSHEET_ID';
const SPREADSHEET_NAME_PREFIX = 'VFORCE Waitlist';

function doPost(e) {
  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const name = String(data.name || '').trim();
    const email = String(data.email || '').trim();
    const timestamp = data.timestamp || new Date().toISOString();

    if (!name) throw new Error('Missing name');
    if (!email) throw new Error('Missing email');

    // Create a Drive spreadsheet on first run, then reuse it.
    const ss = getOrCreateSpreadsheet();
    const sheet = getOrCreateSheet(ss);

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['Timestamp', 'Name', 'Email']);
      sheet.getRange(1, 1, 1, 3).setFontWeight('bold');
    }

    sheet.appendRow([timestamp, name, email]);

    GmailApp.sendEmail(
      NOTIFY_EMAIL,
      '🎮 New VFORCE Waitlist Signup!',
      `Someone just joined the VFORCE waitlist!\n\nName:      ${name}\nEmail:     ${email}\nTime:      ${timestamp}\n\nCheck your sheet for the full list.`,
      {
        htmlBody: `
          <div style="font-family:sans-serif;max-width:500px;padding:24px;background:#0d0d1a;border-radius:8px;color:#e8e8f0;">
            <h2 style="color:#9B4DFF;margin-top:0;">🎮 New VFORCE Waitlist Signup!</h2>
            <p style="color:#aaa;">Someone just joined the waitlist:</p>
            <table style="width:100%;border-collapse:collapse;">
              <tr><td style="padding:8px 0;color:#666;width:80px;">Name</td><td style="padding:8px 0;font-weight:bold;">${name}</td></tr>
              <tr><td style="padding:8px 0;color:#666;">Email</td><td style="padding:8px 0;font-weight:bold;">${email}</td></tr>
              <tr><td style="padding:8px 0;color:#666;">Time</td><td style="padding:8px 0;">${timestamp}</td></tr>
            </table>
            <p style="margin-top:24px;font-size:12px;color:#555;">Check your Google Sheet for the full waitlist.</p>
          </div>
        `
      }
    );

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getOrCreateSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const existingId = props.getProperty(SPREADSHEET_ID_KEY);

  if (existingId) {
    try {
      return SpreadsheetApp.openById(existingId);
    } catch (err) {
      props.deleteProperty(SPREADSHEET_ID_KEY);
    }
  }

  const stamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Etc/UTC',
    'yyyy-MM-dd HH:mm:ss'
  );
  const name = `${SPREADSHEET_NAME_PREFIX} ${stamp} ${Utilities.getUuid().slice(0, 8)}`;
  const ss = SpreadsheetApp.create(name);
  const firstSheet = ss.getSheets()[0];
  firstSheet.setName(SHEET_NAME);
  props.setProperty(SPREADSHEET_ID_KEY, ss.getId());
  return ss;
}

function getOrCreateSheet(ss) {
  const existing = ss.getSheetByName(SHEET_NAME);
  if (existing) return existing;

  if (ss.getSheets().length === 1) {
    const firstSheet = ss.getSheets()[0];
    if (firstSheet.getLastRow() === 0) {
      firstSheet.setName(SHEET_NAME);
      return firstSheet;
    }
  }

  return ss.insertSheet(SHEET_NAME);
}
