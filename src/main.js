// App State
const state = {
  document: null,
  paper: 'A4',
  color: 'COLOR',
  copies: 1,
  pricePerPage: 500, // Rp 500
  paymentMethod: 'deposit',
  reportedIssue: null,
};

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

    // Watch for system changes
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
    try {
      const btn = document.querySelector('#login-form button');
      btn.innerText = 'Authenticating...';
      const emailInput = document.querySelector('input[type="email"]').value;
      const passwordInput = document.querySelector('input[type="password"]').value;
      
      const res = await fetch('https://api-cetak.cerdas.club/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, password: passwordInput })
      });
      
      const data = await res.json();
      const username = data.username || data.user?.username || emailInput.split('@')[0];
      
      // Capitalize first letter of username
      const displayName = username.charAt(0).toUpperCase() + username.slice(1);
      
      // Update UI with fetched username
      document.querySelector('.user-info h2').innerText = `Hi, ${displayName}`;
      
      btn.innerText = 'Sign In';
      this.navigate('home');
    } catch (error) {
      console.error('API Error:', error);
      alert('Failed to connect to backend.');
      document.querySelector('#login-form button').innerText = 'Sign In';
    }
  },

  logout() {
    state.document = null;
    state.reportedIssue = null;
    document.querySelector('.user-info h2').innerText = 'Hi, User';
    
    // Clear login form fields
    const inputs = document.querySelectorAll('#login-form input');
    inputs.forEach(input => input.value = '');
    
    this.navigate('login');
  },

  selectDocument(docName) {
    state.document = docName;
    this.navigate('scan');
  },

  async startScan() {
    if (window.__TAURI__) {
      try {
        const { invoke } = window.__TAURI__.core;
        
        // Meminta izin kamera secara eksplisit ke OS sebelum membuka scanner
        try {
          await invoke("plugin:barcode-scanner|request_permissions");
        } catch (permErr) {
          console.warn("Permissions check error:", permErr);
        }
        
        // Buka kamera secara native
        const result = await invoke("plugin:barcode-scanner|scan", { windowed: false, formats: ["QR_CODE"] });
        
        if (result && result.content) {
          try {
            // Memanggil Backend API Asli untuk memvalidasi/mendapatkan detail printer
            const res = await fetch(`https://api-cetak.cerdas.club/api/v1/printers/${result.content}`);
            const data = await res.json();
            
            // Mengambil data dari Backend API
            let printerName = "Kios Printer";
            let printerStatus = "Siap Mencetak";
            
            if (data.name || data.status) {
                printerName = data.name || printerName;
                printerStatus = data.status || printerStatus;
            } else if (result.content) {
                // Fallback jika API belum diset lengkap oleh user, gunakan ID QR
                printerName = "Kios " + result.content.substring(0, 6);
            }
            
            // Update UI di halaman config
            document.getElementById('station-name').innerText = printerName;
            document.getElementById('station-status').innerText = printerStatus;
            
            // Langsung arahkan ke halaman config dengan mulus
            this.navigate('config');
          } catch (e) {
            console.error(e);
            alert(`Gagal terhubung ke server backend (RandomAPI) untuk verifikasi QR.`);
            this.navigate('home');
          }
        }
      } catch (err) {
        console.error("Scan error:", err);
        // Jika dijalankan di Windows/Linux (desktop), plugin barcode scanner mungkin belum sepenuhnya diimplementasikan (unimplemented)
        if (String(err).toLowerCase().includes("unimplemented") || String(err).toLowerCase().includes("not implemented")) {
          alert("Plugin scanner native belum didukung penuh di OS ini (Desktop). Menggunakan simulasi...");
          this.navigate('config');
        } else {
          alert("Scan dibatalkan.");
        }
      }
    } else {
      // Fallback jika dibuka di browser biasa
      this.navigate('config');
    }
  },

  selectOption(type, value, element) {
    state[type] = value;
    // Update UI
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

  calculatePrice() {
    // Dummy logic: Base 500, Color +1000, F4 +200
    let perPage = 500;
    if (state.color === 'COLOR') perPage += 1000;
    if (state.paper === 'F4') perPage += 200;
    
    // Assume 12 pages for dummy document
    const total = perPage * 12 * state.copies;
    const formatted = `Rp ${total.toLocaleString('id-ID')}`;
    
    document.getElementById('total-price').innerText = formatted;
    document.getElementById('summary-total').innerText = formatted;
    
    // Update Summary
    document.getElementById('summary-doc').innerText = state.document;
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

  executePayment() {
    this.navigate('status');
    this.simulateProcess();
  },

  simulateProcess() {
    const progressCircle = document.getElementById('status-progress');
    const title = document.getElementById('status-title');
    const desc = document.getElementById('status-desc');
    const steps = document.querySelectorAll('.step');
    const circumference = 283;
    
    // Step 1: Payment Confirmed (Immediate)
    progressCircle.style.strokeDashoffset = circumference - (circumference * 0.25);
    
    // Step 2: Downloading
    setTimeout(() => {
      steps[1].classList.add('active');
      title.innerText = 'Downloading File...';
      desc.innerText = 'Station is downloading your document';
      progressCircle.style.strokeDashoffset = circumference - (circumference * 0.50);
    }, 2000);

    // Step 3: Printing
    setTimeout(() => {
      steps[2].classList.add('active');
      title.innerText = 'Printing Document...';
      desc.innerText = 'Please wait, printing in progress';
      progressCircle.style.strokeDashoffset = circumference - (circumference * 0.85);
    }, 4500);

    // Step 4: Completed
    setTimeout(() => {
      steps[3].classList.add('active');
      title.innerText = 'Printing Completed!';
      desc.innerText = 'Please take your document from the tray';
      progressCircle.style.strokeDashoffset = 0;
      document.querySelector('.status-main-icon').classList.replace('ph-printer-duotone', 'ph-check-circle');
      document.querySelector('.status-main-icon').style.color = '#10b981'; // success color
      document.getElementById('btn-done').classList.remove('hidden');
    }, 7500);
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

  submitReport() {
    let issueDetails = state.reportedIssue;
    
    if (!issueDetails) {
      alert('Pilih salah satu masalah terlebih dahulu.');
      return;
    }
    
    if (issueDetails === 'Other') {
      const otherText = document.getElementById('other-issue-text').value.trim();
      if (!otherText) {
        alert('Mohon jelaskan masalah yang Anda alami.');
        return;
      }
      issueDetails = `Lainnya: ${otherText}`;
    }

    // Simulasi pengiriman data
    console.log('Mengirim Laporan Masalah:', issueDetails, 'Station ID:', state.reportedStationId);
    
    alert(`Terima kasih! Laporan Anda untuk stasiun ${state.reportedStationId} telah kami terima dan tim teknisi akan segera mengecek mesin tersebut.`);
    
    // Reset form
    state.reportedIssue = null;
    document.querySelectorAll('.report-card').forEach(el => el.classList.remove('selected'));
    document.getElementById('other-issue-container').classList.add('hidden');
    document.getElementById('other-issue-text').value = '';

    this.navigate('home');
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
    app.selectDocument(e.target.files[0].name);
  }
});

// Expose to window for inline onclick handlers
window.app = app;

window.addEventListener('DOMContentLoaded', async () => {
  app.initTheme();
  
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
