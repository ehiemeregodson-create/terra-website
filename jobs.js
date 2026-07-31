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

/* ---------- Company directory ---------- */

const COMPANY_POOL = [
  { name: 'Amazon', country: 'US', visaInfo: 'Frequent H-1B, L-1, and O-1 sponsor across tech and operations roles.' },
  { name: 'Google', country: 'US', visaInfo: 'Sponsors H-1B and O-1 visas; strong track record of PERM labor certification filings.' },
  { name: 'Microsoft', country: 'US', visaInfo: 'Long-standing H-1B and L-1 sponsor, especially for engineering and research roles.' },
  { name: 'Meta', country: 'US', visaInfo: 'Sponsors H-1B and O-1 visas for engineering, research, and product roles.' },
  { name: 'Apple', country: 'US', visaInfo: 'Sponsors H-1B visas, primarily for engineering and design positions.' },
  { name: 'IBM', country: 'US', visaInfo: 'One of the largest historical H-1B filers, across consulting and engineering roles.' },
  { name: 'Deloitte', country: 'US', visaInfo: 'High-volume H-1B sponsor for consulting, tech, and audit roles.' },
  { name: 'Accenture', country: 'US', visaInfo: 'Major H-1B and L-1 sponsor across consulting and technology roles.' },
  { name: 'Cognizant', country: 'US', visaInfo: 'Consistently one of the top H-1B filers, largely in IT services.' },
  { name: 'Infosys', country: 'US', visaInfo: 'Major H-1B sponsor for IT consulting and services roles.' },
  { name: 'TCS', country: 'US', visaInfo: 'One of the largest H-1B filers historically, across IT services.' },
  { name: 'Wipro', country: 'US', visaInfo: 'Regular H-1B sponsor for IT consulting roles.' },
  { name: 'JPMorgan Chase', country: 'US', visaInfo: 'Sponsors H-1B visas for technology and quantitative finance roles.' },
  { name: 'Goldman Sachs', country: 'US', visaInfo: 'Sponsors H-1B and O-1 visas, mainly in technology and finance.' },
  { name: 'Capgemini', country: 'US', visaInfo: 'Frequent H-1B sponsor for consulting and technology roles.' },
  { name: 'HCLTech', country: 'US', visaInfo: 'Regular H-1B filer for IT services and consulting.' },
  { name: 'Intel', country: 'US', visaInfo: 'Sponsors H-1B and L-1 visas for engineering and research roles.' },
  { name: 'Walmart Global Tech', country: 'US', visaInfo: 'Growing H-1B sponsor for its technology division.' },
  { name: 'HSBC', country: 'UK', visaInfo: 'Sponsors Skilled Worker visas across finance and technology roles.' },
  { name: 'Deloitte UK', country: 'UK', visaInfo: 'Registered Skilled Worker visa sponsor for consulting and audit roles.' },
  { name: 'EY UK', country: 'UK', visaInfo: 'Sponsors Skilled Worker visas across consulting, tax, and audit.' },
  { name: 'KPMG UK', country: 'UK', visaInfo: 'Registered sponsor for Skilled Worker visas in consulting and finance.' },
  { name: 'NHS', country: 'UK', visaInfo: 'One of the largest Health and Care Worker visa sponsors in the country.' },
  { name: 'Tesco', country: 'UK', visaInfo: 'Sponsors Skilled Worker visas for management and technology roles.' },
  { name: 'BT Group', country: 'UK', visaInfo: 'Sponsors Skilled Worker visas for engineering and technology roles.' },
  { name: 'Barclays', country: 'UK', visaInfo: 'Registered Skilled Worker sponsor for finance and technology roles.' },
  { name: 'AstraZeneca', country: 'UK', visaInfo: 'Sponsors Skilled Worker visas for research and scientific roles.' },
  { name: 'Amazon UK', country: 'UK', visaInfo: 'Sponsors Skilled Worker visas across operations and technology.' },
  { name: 'Shopify', country: 'CA', visaInfo: 'Supports LMIA and Global Talent Stream applications for tech roles.' },
  { name: 'RBC', country: 'CA', visaInfo: 'Sponsors work permits for specialized finance and technology roles.' },
  { name: 'TD Bank', country: 'CA', visaInfo: 'Supports LMIA applications for technology and finance positions.' },
  { name: 'CGI Group', country: 'CA', visaInfo: 'Frequent LMIA filer for IT consulting roles.' },
  { name: 'Scotiabank', country: 'CA', visaInfo: 'Sponsors work permits for finance and technology roles.' },
  { name: 'Telus', country: 'CA', visaInfo: 'Supports LMIA and Global Talent Stream for tech talent.' },
  { name: 'BlackBerry', country: 'CA', visaInfo: 'Sponsors work permits for engineering and security roles.' },
  { name: 'CIBC', country: 'CA', visaInfo: 'Supports LMIA applications for finance and technology roles.' },
  { name: 'SAP', country: 'DE', visaInfo: 'Sponsors EU Blue Card and skilled worker visas for engineering roles.' },
  { name: 'Siemens', country: 'DE', visaInfo: 'Sponsors EU Blue Card visas across engineering and R&D roles.' },
  { name: 'Atlassian', country: 'AU', visaInfo: 'Sponsors Skilled Employer visas for engineering and product roles.' },
  { name: 'Emirates Group', country: 'AE', visaInfo: 'Sponsors UAE work visas across aviation and corporate roles.' },
];

const COUNTRY_FLAGS = { US: '🇺🇸', UK: '🇬🇧', CA: '🇨🇦', DE: '🇩🇪', AU: '🇦🇺', AE: '🇦🇪' };
const COUNTRY_NAMES = { US: 'United States', UK: 'United Kingdom', CA: 'Canada', DE: 'Germany', AU: 'Australia', AE: 'UAE' };

function shuffle(array) {
  const copy = array.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function renderCompanies() {
  const grid = document.getElementById('companyGrid');
  const picked = shuffle(COMPANY_POOL).slice(0, 20);

  grid.innerHTML = picked
    .map(
      (c) => `
    <div class="company-card">
      <div class="company-card-top">
        <strong>${escapeHtml(c.name)}</strong>
        <span class="company-flag" title="${COUNTRY_NAMES[c.country]}">${COUNTRY_FLAGS[c.country]}</span>
      </div>
      <p>${escapeHtml(c.visaInfo)}</p>
    </div>
  `
    )
    .join('');
}

renderCompanies();
