function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

/* ---------- Live news ticker ---------- */

const NEWS_ALERTS = [
  { flag: '🇺🇸', text: "US employers: H-1B cap registration typically opens in March — confirm this year's exact window with USCIS and register early." },
  { flag: '🇺🇸', text: 'F-1 students on OPT: file your STEM OPT extension before your current EAD expires, ideally 90 days ahead.' },
  { flag: '🇬🇧', text: "UK Skilled Worker visa holders: check your Certificate of Sponsorship for its start-work deadline as soon as it's issued." },
  { flag: '🇨🇦', text: 'Canada Express Entry draws happen roughly every two weeks — keep your profile active and updated to stay competitive.' },
  { flag: '🇨🇦', text: "Post-Graduation Work Permit applications must be submitted before your study permit expires — don't wait." },
  { flag: '🌍', text: 'Renew your passport at least 6 months before it expires — many countries deny boarding or entry otherwise.' },
  { flag: '🇺🇸', text: 'Green card holders: file Form I-90 to renew your card about 6 months before it expires.' },
  { flag: '🇬🇧', text: 'ILR applicants: you can apply up to 28 days before your qualifying period ends — mark your calendar.' },
  { flag: '🌍', text: 'Save every immigration document digitally the day you receive it — receipts, notices, and correspondence.' },
  { flag: '🇺🇸', text: 'Received an RFE? Your response deadline is usually 30–90 days from the notice date — check yours immediately.' },
  { flag: '🇨🇦', text: 'LMIA processing takes time — start the employer sponsorship conversation early if your role requires one.' },
  { flag: '🇬🇧', text: 'UK employers: right-to-work share codes expire — refresh yours before it lapses.' },
  { flag: '🇺🇸', text: 'F-1 grads: your 60-day grace period after program completion is strict — plan your next status early.' },
  { flag: '🌍', text: "Biometrics appointments often have limited rescheduling windows — confirm yours the moment it's scheduled." },
];

let newsroomIndex = 0;
let newsroomTimer = null;

function renderNewsroomItem(index) {
  const body = document.getElementById('newsroomBody');
  if (!body) return;
  body.style.opacity = '0';
  setTimeout(() => {
    const item = NEWS_ALERTS[index];
    body.innerHTML = `
      <span class="newsroom-flag">${item.flag}</span>
      <p class="newsroom-text">${escapeHtml(item.text)}</p>
    `;
    body.style.opacity = '1';
  }, 200);

  document.querySelectorAll('.newsroom-dot').forEach((d, i) => d.classList.toggle('active', i === index));
}

function resetNewsroomTimer() {
  if (newsroomTimer) clearInterval(newsroomTimer);
  newsroomTimer = setInterval(() => {
    newsroomIndex = (newsroomIndex + 1) % NEWS_ALERTS.length;
    renderNewsroomItem(newsroomIndex);
  }, 6000);
}

function initNewsroom() {
  const dotsContainer = document.getElementById('newsroomDots');
  if (!dotsContainer) return;

  dotsContainer.innerHTML = NEWS_ALERTS.map(
    (_, i) => `<button type="button" class="newsroom-dot" data-index="${i}" aria-label="Alert ${i + 1}"></button>`
  ).join('');

  dotsContainer.querySelectorAll('.newsroom-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      newsroomIndex = parseInt(dot.dataset.index, 10);
      renderNewsroomItem(newsroomIndex);
      resetNewsroomTimer();
    });
  });

  renderNewsroomItem(newsroomIndex);
  resetNewsroomTimer();
}

initNewsroom();

/* ---------- Employer matching (real DOL LCA/PERM disclosure data) ---------- */

function formatWage(r) {
  const from = Number(r.wage_from);
  const to = Number(r.wage_to);
  const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const period = r.wage_period === 'Year' ? '/yr' : '/' + r.wage_period.toLowerCase();
  if (to && to !== from) return `${fmt(from)}–${fmt(to)}${period}`;
  return `${fmt(from)}${period}`;
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function jobResultCard(r) {
  const visaClass = r.visa_type === 'H-1B' ? 'job-visa-h1b' : 'job-visa-perm';
  return `
    <div class="job-result-card">
      <div class="job-result-top">
        <strong class="job-result-employer">${escapeHtml(r.employer_name)}</strong>
        <span class="job-visa-badge ${visaClass}">${escapeHtml(r.visa_type)}</span>
      </div>
      <p class="job-result-title">${escapeHtml(r.job_title)}</p>
      <div class="job-result-meta">
        <span>${escapeHtml(formatWage(r))}</span>
        <span>${escapeHtml(r.city || '')}${r.city && r.state ? ', ' : ''}${escapeHtml(r.state || '')}</span>
        <span>${escapeHtml(formatDate(r.decision_date))}</span>
      </div>
      <p class="job-result-case">Case ${escapeHtml(r.case_number)} · U.S. Dept. of Labor disclosure data</p>
    </div>
  `;
}

function initJobMatch() {
  const form = document.getElementById('jobMatchForm');
  if (!form) return;

  const note = document.getElementById('jobMatchNote');
  const submitBtn = document.getElementById('jobMatchSubmit');
  const resultsSection = document.getElementById('jobResults');
  const resultsGrid = document.getElementById('jobResultsGrid');
  const resultsTitle = document.getElementById('jobResultsTitle');
  const resetBtn = document.getElementById('jobMatchReset');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    note.textContent = t('jobMatch.matching', 'Searching real sponsorship records…');

    const payload = Object.fromEntries(new FormData(form).entries());

    try {
      const res = await fetch('/api/jobs/match', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        note.textContent = data.error || t('jobMatch.error', 'Something went wrong — please try again.');
        return;
      }

      note.textContent = '';
      if (!data.results.length) {
        resultsGrid.innerHTML = `<p class="widget-empty">${escapeHtml(t('jobMatch.noResults', "No matches yet for this industry — try broadening your search."))}</p>`;
      } else {
        resultsGrid.innerHTML = data.results.map(jobResultCard).join('');
      }
      const titleTpl = t('jobMatch.resultsTitle', 'Real employers matching your {industry} search');
      resultsTitle.textContent = titleTpl.replace('{industry}', payload.industry);
      resultsSection.hidden = false;
      resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      trackEvent('job_match_submitted', { industry: payload.industry, sponsorshipType: payload.sponsorshipType });
    } catch (err) {
      note.textContent = t('jobMatch.errorConnection', "Sorry, we couldn't reach the server. Please check your connection and try again.");
    } finally {
      submitBtn.disabled = false;
    }
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      form.reset();
      resultsSection.hidden = true;
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}

initJobMatch();
