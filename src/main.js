// App State
const state = {
  token: localStorage.getItem('auth_token') || null,
  user: JSON.parse(localStorage.getItem('auth_user')) || null,
  stationData: null,
  document: null,     // Nama file untuk display
  documentId: null,   // ID Dokumen dari API
  paper: 'A4',
  color: 'COLOR',
  copies: 1,
  paymentMethod: 'deposit',
  reportedIssue: null,
  reportedStationId: null,
  orderId: null,
};

const API_BASE = 'https://api-cetak.cerdas.club/api/v1';

// API Helper
async function apiFetch(endpoint, options = {}) {
  const headers = { ...options.headers };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }
  
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });
  
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'API Error');
  }
  return data;
}

// Main App Logic
const app = {
  initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      document.documentElement.setAttribute('data-theme', savedTheme);
      this.updateThemeIcon(savedTheme);
    } else {
      const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
      const theme = prefersLight ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', theme);
      this.updateThemeIcon(theme);
    }

    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
      if (!localStorage.getItem('theme')) {
        const theme = e.matches ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        this.updateThemeIcon(theme);
      }
    });
  },

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    this.updateThemeIcon(newTheme);
  },

  updateThemeIcon(theme) {
    const icon = document.getElementById('theme-icon');
    if (icon) {
      if (theme === 'light') {
        icon.className = 'ph-fill ph-sun';
      } else {
        icon.className = 'ph-fill ph-moon';
      }
    }
  },

  navigate(viewId) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewId}`).classList.add('active');
  },

  async authenticateUser() {
    const btn = document.querySelector('#login-form button');
    try {
      btn.innerText = 'Authenticating...';
      const emailInput = document.querySelector('input[type="email"]').value;
      const passwordInput = document.querySelector('input[type="password"]').value;
      
      const response = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: emailInput, password: passwordInput })
      });
      
      state.token = response.data.token;
      state.user = response.data.user;
      
      localStorage.setItem('auth_token', state.token);
      localStorage.setItem('auth_user', JSON.stringify(state.user));
      
      this.updateDashboardUI();
      btn.innerText = 'Sign In';
      this.navigate('home');
    } catch (error) {
      console.error('API Error:', error);
      alert('Login Gagal: ' + error.message);
      btn.innerText = 'Sign In';
    }
  },

  updateDashboardUI() {
    if (state.user) {
      const username = state.user.username || state.user.email.split('@')[0];
      const displayName = username.charAt(0).toUpperCase() + username.slice(1);
      
      const balance = state.user.balance !== undefined ? state.user.balance : 0;
      
      document.querySelector('.user-info h2').innerText = `Hi, ${displayName}`;
      document.querySelector('.user-info p').innerHTML = `Rp ${balance.toLocaleString('id-ID')} <span class="badge">Deposit</span>`;
    }
  },

  async logout() {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (e) {
      console.warn("Logout error:", e);
    }
    state.token = null;
    state.user = null;
    state.document = null;
    state.documentId = null;
    
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    
    document.querySelector('.user-info h2').innerText = 'Hi, User';
    document.querySelector('.user-info p').innerHTML = 'Rp 0 <span class="badge">Deposit</span>';
    
    const inputs = document.querySelectorAll('#login-form input');
    inputs.forEach(input => input.value = '');
    
    this.navigate('login');
  },

  async uploadDocument(file) {
    try {
      const btn = document.getElementById('upload-btn');
      const originalHtml = btn.innerHTML;
      btn.innerHTML = '<h4>Mengunggah...</h4>';
      
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await apiFetch('/documents/upload', {
        method: 'POST',
        body: formData,
        // Fetch automatically sets multipart boundary when body is FormData
      });
      
      state.document = response.data.filename || file.name;
      state.documentId = response.data.document_id;
      
      btn.innerHTML = originalHtml;
      this.navigate('scan');
    } catch (e) {
      alert("Gagal mengunggah dokumen: " + e.message);
      document.getElementById('upload-btn').innerHTML = `<i class="ph ph-upload-simple upload-icon"></i><h4>Upload Document</h4><p class="text-muted">PDF, DOCX, JPG (Max 10MB)</p>`;
    }
  },

  async startScan() {
    if (window.__TAURI__) {
      try {
        const { invoke } = window.__TAURI__.core;
        try { await invoke("plugin:barcode-scanner|request_permissions"); } catch (e) {}
        
        const result = await invoke("plugin:barcode-scanner|scan", { windowed: false, formats: ["QR_CODE"] });
        
        if (result && result.content) {
          await this.validateStation(result.content);
        }
      } catch (err) {
        if (String(err).toLowerCase().includes("unimplemented")) {
          alert("Scanner native tidak tersedia, mensimulasikan scan...");
          await this.validateStation("STA-MKS-01"); // Simulasi ID
        } else {
          alert("Scan dibatalkan.");
        }
      }
    } else {
      await this.validateStation("STA-MKS-01");
    }
  },

  async validateStation(stationId) {
    try {
      const response = await apiFetch(`/stations/${stationId}`);
      state.stationData = response.data;
      
      document.getElementById('station-name').innerText = state.stationData.name || stationId;
      document.getElementById('station-status').innerText = state.stationData.status === 'ONLINE' ? 'Siap Mencetak' : 'Offline';
      
      this.calculatePrice();
      this.navigate('config');
    } catch (e) {
      alert("Gagal memvalidasi mesin: " + e.message);
    }
  },

  selectOption(type, value, element) {
    state[type] = value;
    const parent = element.parentElement;
    parent.querySelectorAll('.option-card').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    this.calculatePrice();
  },

  updateCopies(change) {
    const newCopies = state.copies + change;
    if (newCopies >= 1 && newCopies <= 100) {
      state.copies = newCopies;
      document.getElementById('copies-count').innerText = state.copies;
      this.calculatePrice();
    }
  },

  async calculatePrice() {
    if (!state.stationData) return;
    
    const formatKey = `${state.paper}_${state.color}`;
    let perPage = 500;
    
    // Ambil harga asli dari station data API jika tersedia
    if (state.stationData.pricing && state.stationData.pricing[formatKey]) {
       perPage = state.stationData.pricing[formatKey];
    } else {
       if (state.color === 'COLOR') perPage = 1000;
    }
    
    // Untuk dummy kita asumsikan 1 halaman (atau bisa di-fetch dari /orders/calculate)
    const pages = 1; 
    const total = perPage * pages * state.copies;
    const formatted = `Rp ${total.toLocaleString('id-ID')}`;
    
    document.getElementById('total-price').innerText = formatted;
    document.getElementById('summary-total').innerText = formatted;
    
    document.getElementById('summary-doc').innerText = state.document || "Dokumen";
    document.getElementById('summary-copies').innerText = state.copies;
    document.getElementById('summary-format').innerText = `${state.paper} ${state.color === 'COLOR' ? 'Color' : 'B&W'}`;
  },

  selectPayment(method, element) {
    state.paymentMethod = method;
    document.querySelectorAll('.payment-method').forEach(el => {
      el.classList.remove('selected');
      el.querySelector('.radio-check').classList.remove('active');
    });
    element.classList.add('selected');
    element.querySelector('.radio-check').classList.add('active');
  },

  async executePayment() {
    try {
      this.navigate('status');
      
      const payload = {
        station_id: state.stationData.station_id,
        document_id: state.documentId || "DOC-DUMMY",
        print_format: `${state.paper}_${state.color}`,
        copies: state.copies,
        payment_method: state.paymentMethod
      };
      
      const response = await apiFetch('/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      state.orderId = response.data.order_id;
      this.pollOrderStatus();
      
    } catch (e) {
      alert("Gagal memproses pesanan: " + e.message);
      this.navigate('payment');
    }
  },

  async pollOrderStatus() {
    const progressCircle = document.getElementById('status-progress');
    const title = document.getElementById('status-title');
    const desc = document.getElementById('status-desc');
    const steps = document.querySelectorAll('.step');
    const circumference = 283;
    
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/orders/${state.orderId}`);
        const status = res.data.status;
        const progress = res.data.progress_percentage || 0;
        
        // Update Circle
        const offset = circumference - (circumference * (progress / 100));
        progressCircle.style.strokeDashoffset = offset;
        
        // Update UI Steps based on status
        if (status === 'DOWNLOADING') {
          steps[1].classList.add('active');
          title.innerText = 'Downloading File...';
          desc.innerText = 'Station is downloading your document';
        } else if (status === 'PRINTING') {
          steps[1].classList.add('active');
          steps[2].classList.add('active');
          title.innerText = 'Printing Document...';
          desc.innerText = 'Please wait, printing in progress';
        } else if (status === 'COMPLETED') {
          clearInterval(interval);
          steps.forEach(s => s.classList.add('active'));
          title.innerText = 'Printing Completed!';
          desc.innerText = 'Please take your document from the tray';
          progressCircle.style.strokeDashoffset = 0;
          document.querySelector('.status-main-icon').classList.replace('ph-printer-duotone', 'ph-check-circle');
          document.querySelector('.status-main-icon').style.color = '#10b981';
          document.getElementById('btn-done').classList.remove('hidden');
        } else if (status === 'FAILED') {
          clearInterval(interval);
          title.innerText = 'Printing Failed!';
          desc.innerText = 'Please contact support';
          document.querySelector('.status-main-icon').style.color = '#ef4444';
          document.getElementById('btn-done').classList.remove('hidden');
        }
      } catch (e) {
        console.warn("Polling error:", e);
      }
    }, 2000);
  },

  async startReportScan() {
    if (window.__TAURI__) {
      try {
        const { invoke } = window.__TAURI__.core;
        try { await invoke("plugin:barcode-scanner|request_permissions"); } catch (e) {}
        const result = await invoke("plugin:barcode-scanner|scan", { windowed: false, formats: ["QR_CODE"] });
        
        if (result && result.content) {
          state.reportedStationId = result.content;
          document.getElementById('report-station-id').innerText = state.reportedStationId;
          this.navigate('report');
        }
      } catch (err) {
        if (!String(err).toLowerCase().includes("unimplemented") && !String(err).toLowerCase().includes("cancel")) {
          alert("Gagal membaca barcode: " + err);
        } else {
          state.reportedStationId = "STA-DEV-1";
          document.getElementById('report-station-id').innerText = state.reportedStationId;
          this.navigate('report');
        }
      }
    } else {
      state.reportedStationId = "STA-DEV-1";
      document.getElementById('report-station-id').innerText = state.reportedStationId;
      this.navigate('report');
    }
  },

  selectIssue(issueType, element) {
    state.reportedIssue = issueType;
    document.querySelectorAll('.report-card').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');

    if (issueType === 'Other') {
      document.getElementById('other-issue-container').classList.remove('hidden');
    } else {
      document.getElementById('other-issue-container').classList.add('hidden');
      document.getElementById('other-issue-text').value = '';
    }
  },

  async submitReport() {
    let issueDetails = state.reportedIssue;
    
    if (!issueDetails) {
      alert('Pilih salah satu masalah terlebih dahulu.');
      return;
    }
    
    let description = "";
    if (issueDetails === 'Other') {
      description = document.getElementById('other-issue-text').value.trim();
      if (!description) {
        alert('Mohon jelaskan masalah yang Anda alami.');
        return;
      }
    }
    
    try {
      await apiFetch(`/stations/${state.reportedStationId}/reports`, {
        method: 'POST',
        body: JSON.stringify({
          issue_category: issueDetails === 'Other' ? 'OTHER' : issueDetails.toUpperCase().replace(' ', '_'),
          description: description,
          order_id: state.orderId
        })
      });
      
      alert(`Terima kasih! Laporan Anda untuk stasiun ${state.reportedStationId} telah kami terima dan tim teknisi akan segera mengecek mesin tersebut.`);
      
      // Reset form
      state.reportedIssue = null;
      document.querySelectorAll('.report-card').forEach(el => el.classList.remove('selected'));
      document.getElementById('other-issue-container').classList.add('hidden');
      document.getElementById('other-issue-text').value = '';

      this.navigate('home');
    } catch (e) {
      alert("Gagal mengirim laporan: " + e.message);
    }
  }
};

// Event Listeners
document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  app.authenticateUser();
});

document.getElementById('upload-btn').addEventListener('click', () => {
  document.getElementById('file-input').click();
});

document.getElementById('file-input').addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    app.uploadDocument(e.target.files[0]);
  }
});

// Expose to window for inline onclick handlers
window.app = app;

window.addEventListener('DOMContentLoaded', async () => {
  app.initTheme();
  
  if (state.token && state.user) {
    app.updateDashboardUI();
    app.navigate('home');
  } else {
    app.navigate('login');
  }
  
  if (window.__TAURI__) {
    try {
      const { check } = window.__TAURI__.updater;
      const update = await check();
      if (update) {
        console.log(`Update tersedia: ${update.version}`);
        if (confirm(`Pembaruan versi ${update.version} tersedia. Apakah Anda ingin mengunduh dan menginstal sekarang?`)) {
          await update.downloadAndInstall();
          console.log('Update terpasang!');
        }
      }
    } catch (err) {
      console.error("Gagal memeriksa pembaruan:", err);
    }
  }
});
