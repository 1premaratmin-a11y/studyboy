/* ============================================================
   Cold email generator — $200 website outreach for Halton SMBs
   Reads businesses_with_email_halton.csv, writes personalized
   draft emails to email_drafts/ (one .txt per business) + index.
   You review and send these yourself — nothing is auto-sent.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const IN  = path.join(__dirname, 'businesses_with_email_halton.csv');
const OUT = path.join(__dirname, 'email_drafts');

// ---- Config: EDIT THESE to match your business ----
const YOUR_NAME   = 'Prem';
const YOUR_EMAIL  = 'you@example.com';          // <- change to your real email
const YOUR_PHONE  = '';                          // <- optional, or ''
const PORTFOLIO   = 'https://yourportfolio.com'; // <- link to your work, or ''
const SIGN_OFF    = 'Prem';

// ---- Subject lines (rotated for A/B testing) ----
const SUBJECTS = [
  'A proper website for {name} \u2014 $200 flat',
  'Quick question about {name}\u2019s website',
  'Your website, {name} \u2014 I can help ($200)',
  '{name} online presence \u2014 affordable upgrade',
];

function templateRestaurant(name, city) {
  return {
    subject: 'A proper website for ' + name + ' \u2014 $200 flat',
    body: [
      'Hi ' + name + ' team,',
      '',
      'I was looking for great local spots in ' + (city||'Halton') + ' and came across ' + name + '. ' +
      'Your food looks fantastic \u2014 but honestly, your online presence isn\u2019t doing you justice.',
      '',
      'Most restaurants your size are either paying $50+/month for a clunky template builder, ' +
      'or they got quoted $2,000+ by an agency for a site that still looks like it\u2019s from 2012.',
      '',
      'I build modern, fast, mobile-first websites for small businesses for $200 \u2014 one time, no monthly fees. ' +
      'That includes:',
      '  \u2022 A clean, mobile-friendly design that actually looks good',
      '  \u2022 Your menu, hours, location & map, and contact info',
      '  \u2022 Photos of your food / space',
      '  \u2022 Google Maps integration so people find you',
      '  \u2022 Fast loading (most template sites are painfully slow on phones)',
      '',
      'No subscriptions, no lock-in. You own the site.',
      '',
      'If you\u2019re curious, I\u2019d love to show you a quick mockup of what ' + name + ' could look like. ' +
      'No pressure, no obligation \u2014 just reply here and I\u2019ll send something over.',
      '',
      'Cheers,',
      SIGN_OFF
    ].join('\n')
  };
}

function templateDentist(name, city) {
  return {
    subject: 'New patients start online \u2014 ' + name + ' website ($200)',
    body: [
      'Hi ' + name + ',',
      '',
      'When someone in ' + (city||'Halton') + ' searches for a dentist, the practice with the clearest, ' +
      'most trustworthy website usually wins. I took a quick look and ' + name + '\u2019s could be working harder for you.',
      '',
      'I build modern websites for small practices for $200 \u2014 flat, one-time, no monthly fees. For a dental office that means:',
      '  \u2022 A clean site that makes new patients feel confident booking',
      '  \u2022 Online appointment request form',
      '  \u2022 Services, team bios, and office photos',
      '  \u2022 Google Maps + directions',
      '  \u2022 Fast on phones (where most people search)',
      '',
      'Agencies charge $2,000\u2013$5,000 for this. Template builders cost $40\u2013$80/month forever and still look generic. ' +
      'I do it for $200 once \u2014 and you own it.',
      '',
      'Want me to send a quick mockup of what ' + name + ' could look like? Just reply and I\u2019ll put one together. ' +
      'No commitment.',
      '',
      'Best,',
      SIGN_OFF
    ].join('\n')
  };
}

function templateService(name, city, cat) {
  const trade = cat.replace(/^(shop|craft|amenity|office):/, '').replace(/_/g,' ');
  return {
    subject: 'More ' + trade + ' jobs from Google \u2014 ' + name + ' ($200 website)',
    body: [
      'Hi ' + name + ',',
      '',
      'For a ' + trade + ' business in ' + (city||'Halton') + ', most of your new customers come from Google. ' +
      'But if your website is outdated, broken, or missing, you\u2019re handing jobs to competitors with worse service but a better web presence.',
      '',
      'I build clean, fast websites for small trades and service businesses for $200 \u2014 one time, no monthly fees:',
      '  \u2022 Services + the areas you cover',
      '  \u2022 Easy contact / quote request form',
      '  \u2022 Photos of your work',
      '  \u2022 Google reviews integration',
      '  \u2022 Loads fast on phones',
      '',
      'A lot of guys in your trade are paying a subscription for a template that barely works, ' +
      'or they got quoted thousands by an agency. $200 gets you a real site you own \u2014 no catch.',
      '',
      'If that\u2019s interesting, reply here and I\u2019ll mock up what ' + name + ' could look like. No pressure.',
      '',
      'Thanks,',
      SIGN_OFF
    ].join('\n')
  };
}

function templateGeneral(name, city, cat) {
  const type = cat.replace(/^(shop|craft|amenity|office|tourism|leisure|healthcare):/, '').replace(/_/g,' ');
  return {
    subject: 'A better website for ' + name + ' \u2014 $200, no monthly fees',
    body: [
      'Hi ' + name + ',',
      '',
      'I came across ' + name + ' while looking at ' + type + ' businesses in ' + (city||'Halton') + '. ' +
      'You\u2019ve clearly put work into what you do \u2014 but a lot of small businesses undersell themselves online.',
      '',
      'I build modern, mobile-friendly websites for small businesses for $200 \u2014 flat, one-time, no subscriptions:',
      '  \u2022 Clean design that reflects your brand',
      '  \u2022 Whatever info matters most to your customers',
      '  \u2022 Contact form + Google Maps',
      '  \u2022 Fast on phones',
      '  \u2022 You own it \u2014 no lock-in',
      '',
      'Agencies charge $2,000+. Template builders cost a monthly fee forever and still look generic. ' +
      'I do it for $200 once and you\u2019re done.',
      '',
      'If you\u2019d like to see a quick mockup of what ' + name + ' could look like, just reply here. ' +
      'No obligation at all.',
      '',
      'Cheers,',
      SIGN_OFF
    ].join('\n')
  };
}

function pickTemplate(name, city, cat) {
  if (/(restaurant|cafe|fast_food|pub|bar|bakery|food)/.test(cat)) return templateRestaurant(name, city);
  if (/(dentist|doctors|clinic|pharmacy|healthcare|physiotherapist|massage)/.test(cat)) return templateDentist(name, city);
  if (/(car_repair|plumber|appliance|cleaning|tree|electrician|hvac|locksmith|exterminator|car_rental|atm)/.test(cat)) return templateService(name, city, cat);
  return templateGeneral(name, city, cat);
}

function parseCsvLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) { if (ch === '"') { if (line[i+1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
    else { if (ch === ',') { out.push(cur); cur = ''; } else if (ch === '"') inQ = true; else cur += ch; }
  }
  out.push(cur); return out;
}

function safeFilename(name) {
  return name.replace(/[^a-zA-Z0-9 _-]/g,'').replace(/\s+/g,'_').slice(0, 40);
}

function main() {
  const raw = fs.readFileSync(IN, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.length);
  const headers = parseCsvLine(lines[0]);
  const idx = {};
  headers.forEach((h,i) => idx[h] = i);

  const drafts = [];
  let n = 0;
  for (let i = 1; i < lines.length; i++) {
    const f = parseCsvLine(lines[i]);
    if (f.length < headers.length) continue;
    const name = f[idx.name], cat = f[idx.category], email = f[idx.email];
    const city = f[idx.addr_city] || '';
    if (!email) continue;
    n++;
    const tmpl = pickTemplate(name, city, cat);
    const subject = tmpl.subject;
    const body = tmpl.body;

    const full = [
      'To: ' + name + ' <' + email + '>',
      'From: ' + YOUR_NAME + ' <' + YOUR_EMAIL + '>',
      'Subject: ' + subject,
      '',
      body,
      '',
      (YOUR_PHONE ? 'Phone: ' + YOUR_PHONE : ''),
      (PORTFOLIO ? 'Portfolio: ' + PORTFOLIO : ''),
      '',
      '---',
      'Business: ' + name,
      'Category: ' + cat,
      'Email: ' + email,
      (f[idx.phone] ? 'Phone: ' + f[idx.phone] : ''),
      (f[idx.maps_link] ? 'Maps: ' + f[idx.maps_link] : ''),
      'OSM: ' + (f[idx.osm_link] || '')
    ].filter(l => l !== null).join('\n');

    const fname = String(n).padStart(2,'0') + '_' + safeFilename(name) + '.txt';
    fs.writeFileSync(path.join(OUT, fname), full, 'utf8');
    drafts.push({ file: fname, name, email, subject, cat });
  }

  let indexTxt = 'EMAIL CAMPAIGN INDEX \u2014 $200 Website Outreach\n';
  indexTxt += '===========================================\n';
  indexTxt += 'Generated: ' + new Date().toISOString().slice(0,10) + '\n';
  indexTxt += 'Total drafts: ' + drafts.length + '\n';
  indexTxt += 'From: ' + YOUR_NAME + ' <' + YOUR_EMAIL + '>\n';
  indexTxt += '\nIMPORTANT: Review each draft before sending. Edit YOUR_NAME / YOUR_EMAIL / PORTFOLIO at the top of generate_emails.js and re-run to update.\n';
  indexTxt += '\n--- All drafts ---\n';
  drafts.forEach(d => {
    indexTxt += '\n[' + d.file + ']\n';
    indexTxt += '  To:      ' + d.name + ' <' + d.email + '>\n';
    indexTxt += '  Subject: ' + d.subject + '\n';
    indexTxt += '  Cat:     ' + d.cat + '\n';
  });
  fs.writeFileSync(path.join(OUT, '_INDEX.txt'), indexTxt, 'utf8');

  console.log('============================================================');
  console.log('Email drafts generated: ' + drafts.length);
  console.log('Output folder: ' + OUT);
  console.log('Index file: ' + path.join(OUT, '_INDEX.txt'));
  console.log('============================================================');
  console.log('\nREMINDER: Edit YOUR_NAME / YOUR_EMAIL / PORTFOLIO at the top of');
  console.log('generate_emails.js and re-run before sending. Do NOT auto-send.');
  console.log('\nFirst 5 drafts:');
  drafts.slice(0,5).forEach(d => console.log('  ' + d.file + ' -> ' + d.email + ' | ' + d.subject));
}

main();