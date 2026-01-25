const API_BASE = 'http://localhost:5000';
let sessionId = localStorage.getItem('sessionId') || generateUUID();
let currentVerificationId = null;
let currentReportId = null;
let currentPlatformUrl = null;

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
  localStorage.setItem('sessionId', sessionId);
  initializeTabs();
  initializeEventListeners();
  loadStats();
  loadHistory();
});

// ==================== TAB MANAGEMENT ====================

function initializeTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.dataset.tab;
      switchTab(tabName);
    });
  });

  document.querySelectorAll('.verify-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const verify = btn.dataset.verify;
      switchVerifyTab(verify);
    });
  });
}

function switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Deactivate all buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Activate selected tab and button
  document.getElementById(tabName).classList.add('active');
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

  if (tabName === 'history') {
    loadHistory();
  } else if (tabName === 'dashboard') {
    loadStats();
  }
}

function switchVerifyTab(verify) {
  document.querySelectorAll('.verify-tab').forEach(btn => {
    btn.classList.remove('active');
  });

  document.querySelectorAll('.verify-form').forEach(form => {
    form.classList.remove('active');
  });

  document.querySelector(`[data-verify="${verify}"]`).classList.add('active');
  document.getElementById(`verify-form-${verify}`).classList.add('active');
}

// ==================== EVENT LISTENERS ====================

function initializeEventListeners() {
  // Platform tiles on dashboard
  document.querySelectorAll('.platform-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      const platform = tile.dataset.platform;
      showQuickForm(platform);
    });
  });

  // Forms
  document.getElementById('verify-form-standard').addEventListener('submit', (e) => {
    e.preventDefault();
    verifyStandard();
  });

  document.getElementById('verify-form-linkedin').addEventListener('submit', (e) => {
    e.preventDefault();
    verifyLinkedIn();
  });

  document.getElementById('quick-form').addEventListener('submit', (e) => {
    e.preventDefault();
    verifyQuick();
  });

  // Modal
  document.querySelector('.modal-close').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-report').addEventListener('click', closeModal);
  document.getElementById('btn-open-platform').addEventListener('click', openPlatformReport);
  document.getElementById('btn-reported').addEventListener('click', confirmPlatformReport);

  // History filters
  document.getElementById('filter-platform').addEventListener('change', loadHistory);
  document.getElementById('filter-label').addEventListener('change', loadHistory);
  document.getElementById('refresh-history').addEventListener('click', loadHistory);
}

// ==================== VERIFICATION FUNCTIONS ====================

function showQuickForm(platform) {
  switchTab('dashboard');
  const quickForm = document.getElementById('quick-form');
  quickForm.style.display = 'flex';
  document.getElementById('quick-url').dataset.platform = platform;
  document.getElementById('quick-url').focus();
}

function verifyQuick() {
  const url = document.getElementById('quick-url').value;
  const platform = document.getElementById('quick-url').dataset.platform;
  
  verifyProfile(url, platform);
  switchTab('verify');
}

function verifyStandard() {
  const platform = document.getElementById('platform-select').value;
  const url = document.getElementById('profile-url').value;

  if (!platform || !url) {
    alert('Please fill all fields');
    return;
  }

  verifyProfile(url, platform);
}

function verifyLinkedIn() {
  const url = document.getElementById('linkedin-url').value;
  const imageFile = document.getElementById('profile-image').files[0];

  if (!url) {
    alert('Please enter LinkedIn URL');
    return;
  }

  showLoading();

  const formData = new FormData();
  formData.append('url', url);
  if (imageFile) {
    formData.append('image', imageFile);
  }

  fetch(`${API_BASE}/verify-linkedin`, {
    method: 'POST',
    headers: {
      'X-Session-Id': sessionId
    },
    body: formData
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert('Error: ' + data.error);
      } else {
        displayResult(data);
      }
    })
    .catch(err => {
      console.error('Error:', err);
      alert('Verification failed');
    })
    .finally(() => hideLoading());
}

function verifyProfile(url, platform) {
  showLoading();

  fetch(`${API_BASE}/verify-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': sessionId
    },
    body: JSON.stringify({ url, platform })
  })
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        alert('Error: ' + data.error);
      } else {
        displayResult(data);
      }
    })
    .catch(err => {
      console.error('Error:', err);
      alert('Verification failed');
    })
    .finally(() => hideLoading());
}

function displayResult(data) {
  currentVerificationId = data.verification_id;
  currentPlatformUrl = data.profile_url;

  const isFake = data.prediction === 'Fake';
  const resultCard = document.getElementById('result-card');
  const resultContent = document.getElementById('result-content');
  const actionButtons = document.getElementById('action-buttons');

  resultCard.className = isFake ? 'result-card fake' : 'result-card';

  resultContent.innerHTML = `
    <h3>Verification Result</h3>
    <div class="result-label ${isFake ? 'fake' : 'real'}">
      ${isFake ? '⚠️ Fake Profile' : '✓ Real Profile'}
    </div>
    <div class="result-confidence">
      Confidence: <strong>${data.confidence}</strong>
    </div>
    <div style="margin-top: 15px; color: #666;">
      <p><strong>Platform:</strong> ${data.platform}</p>
      <p><strong>URL:</strong> ${data.profile_url}</p>
      <p><strong>Analysis:</strong> ${data.features_analyzed} features analyzed</p>
    </div>
  `;

  if (isFake) {
    actionButtons.innerHTML = `
      <button class="btn btn-primary" onclick="reportSuspicious()">
        Report as Suspicious
      </button>
    `;
  } else {
    actionButtons.innerHTML = '';
  }

  resultCard.style.display = 'block';
}

function reportSuspicious() {
  fetch(`${API_BASE}/report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': sessionId
    },
    body: JSON.stringify({
      verification_id: currentVerificationId,
      profile_url: currentPlatformUrl,
      platform_name: document.getElementById('platform-select')?.value || 'other'
    })
  })
    .then(res => res.json())
    .then(data => {
      if (data.report_id) {
        currentReportId = data.report_id;
        openModal();
      } else {
        alert('Error reporting profile');
      }
    })
    .catch(err => {
      console.error('Error:', err);
      alert('Failed to report');
    });
}

// ==================== MODAL MANAGEMENT ====================

function openModal() {
  document.getElementById('report-modal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('report-modal').style.display = 'none';
  loadHistory();
  loadStats();
}

function openPlatformReport() {
  if (!currentPlatformUrl) return;

  const platform = document.getElementById('platform-select')?.value || 'other';
  let reportUrl = '';

  switch (platform) {
    case 'instagram':
      reportUrl = currentPlatformUrl + '?reported';
      break;
    case 'linkedin':
      reportUrl = currentPlatformUrl + '?reported';
      break;
    default:
      reportUrl = currentPlatformUrl;
  }

  window.open(reportUrl, '_blank');
}

function confirmPlatformReport() {
  if (!currentReportId) return;

  fetch(`${API_BASE}/report-confirm/${currentReportId}`, {
    method: 'PUT',
    headers: {
      'X-Session-Id': sessionId
    }
  })
    .then(res => res.json())
    .then(data => {
      closeModal();
      alert('Thank you for reporting! Your action helps keep the community safe.');
    })
    .catch(err => {
      console.error('Error:', err);
      alert('Failed to confirm report');
    });
}

// ==================== HISTORY & STATS ====================

function loadStats() {
  fetch(`${API_BASE}/stats`, {
    headers: { 'X-Session-Id': sessionId }
  })
    .then(res => res.json())
    .then(data => {
      document.getElementById('stat-total').textContent = data.total_today || 0;
      document.getElementById('stat-fake').textContent = data.fake_today || 0;
      document.getElementById('stat-reports').textContent = data.reports_today || 0;
    })
    .catch(err => console.error('Stats Error:', err));
}

function loadHistory() {
  const platform = document.getElementById('filter-platform')?.value || 'all';
  const label = document.getElementById('filter-label')?.value || 'all';

  let url = `${API_BASE}/history?platform=${platform}&label=${label}`;

  fetch(url, {
    headers: { 'X-Session-Id': sessionId }
  })
    .then(res => res.json())
    .then(data => {
      const tbody = document.getElementById('history-tbody');
      tbody.innerHTML = '';

      if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No records found</td></tr>';
        return;
      }

      data.forEach(row => {
        const tr = document.createElement('tr');
        const url = new URL(row.profile_url);
        const urlLabel = url.hostname || row.profile_url.substring(0, 20);

        let statusBadges = '';
        if (row.internal_reported) {
          statusBadges += '<span class="badge badge-reported">Reported</span>';
        }
        if (row.platform_report_confirmed) {
          statusBadges += '<span class="badge badge-confirmed">Platform Confirmed</span>';
        }

        tr.innerHTML = `
          <td>${urlLabel}</td>
          <td>${row.platform}</td>
          <td><span class="badge ${row.prediction === 'Real' ? 'badge-real' : 'badge-fake'}">${row.prediction}</span></td>
          <td>${(row.confidence * 100).toFixed(1)}%</td>
          <td>${new Date(row.timestamp).toLocaleString()}</td>
          <td>${statusBadges || '-'}</td>
        `;
        tbody.appendChild(tr);
      });
    })
    .catch(err => {
      console.error('History Error:', err);
      document.getElementById('history-tbody').innerHTML = '<tr><td colspan="6" class="text-center">Error loading history</td></tr>';
    });
}

// ==================== HELPER FUNCTIONS ====================

function showLoading() {
  document.getElementById('loading').style.display = 'block';
  document.getElementById('result-card').style.display = 'none';
}

function hideLoading() {
  document.getElementById('loading').style.display = 'none';
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}