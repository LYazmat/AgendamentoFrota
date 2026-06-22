/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Vehicle, Booking, MaintenanceRecord, QuickStats, Driver } from './types';
import { INITIAL_VEHICLES, INITIAL_BOOKINGS, INITIAL_MAINTENANCE, INITIAL_DRIVERS } from './initialData';
import { 
  checkBookingConflict, 
  formatDateTime, 
  formatDateShort, 
  getVehicleTypeLabel, 
  maskCPF, 
  formatPlate 
} from './utils';

// --- MAIN CONTROLLER STATE ---
let vehicles: Vehicle[] = [];
let bookings: Booking[] = [];
let maintenances: MaintenanceRecord[] = [];
let drivers: Driver[] = [];

// Navigation active tab
type AppTab = 'dashboard' | 'timeline' | 'bookings' | 'fleet' | 'newBooking' | 'newVehicle' | 'maintenance' | 'drivers' | 'newDriver';
let activeTab: AppTab = 'dashboard';

// Timline timelineOffset
let timelineViewMode: 'today' | 'week' = 'today';
let timelineDayOffset: number = 0; // Offsets in days/weeks

// Search state filters
let bookingsSearchQuery: string = '';
let bookingsFilterStatus: string = 'all';

let fleetSearchQuery: string = '';
let fleetFilterType: string = 'all';
let fleetFilterStatus: string = 'all';
let fleetFilterActive: string = 'active';

let driversSearchQuery: string = '';
let driversFilterActive: string = 'active';
let driverToEdit: Driver | null = null;

// Django Integration Toggle state
let useDjangoApi: boolean = false;
let apiLoading: boolean = false;
let apiErrorMessage: string | null = null;

// Target vehicle parameters for deep-linking
let prefilledVehicleId: string = '';
let prefilledStartDate: string = '';
let vehicleToEdit: Vehicle | null = null;
let maintenanceToEdit: MaintenanceRecord | null = null;

// Constant reference date representing UTC (2026-06-18)
const SYSTEM_REFERENCE_DATE = new Date('2026-06-18T10:00:00');

// --- LOCAL STORAGE HELPERS ---
function loadLocalState() {
  const savedVehicles = localStorage.getItem('fleet_vehicles_v1');
  vehicles = savedVehicles ? JSON.parse(savedVehicles) : [...INITIAL_VEHICLES];

  const savedBookings = localStorage.getItem('fleet_bookings_v1');
  bookings = savedBookings ? JSON.parse(savedBookings) : [...INITIAL_BOOKINGS];

  const savedMaintenances = localStorage.getItem('fleet_maintenance_v1');
  maintenances = savedMaintenances ? JSON.parse(savedMaintenances) : [...INITIAL_MAINTENANCE];

  const savedDrivers = localStorage.getItem('fleet_drivers_v1');
  drivers = savedDrivers ? JSON.parse(savedDrivers) : [...INITIAL_DRIVERS];
}

function saveLocalState() {
  localStorage.setItem('fleet_vehicles_v1', JSON.stringify(vehicles));
  localStorage.setItem('fleet_bookings_v1', JSON.stringify(bookings));
  localStorage.setItem('fleet_maintenance_v1', JSON.stringify(maintenances));
  localStorage.setItem('fleet_drivers_v1', JSON.stringify(drivers));
}

function autoUpdateVehiclePreventive(vehicleId: string, maintDate: string) {
  const car = vehicles.find(v => v.id === vehicleId);
  if (car && car.preventivePeriodMonth && car.preventivePeriodMonth > 0) {
    const parsedDate = new Date(maintDate + 'T12:00:00');
    parsedDate.setMonth(parsedDate.getMonth() + car.preventivePeriodMonth);
    const year = parsedDate.getFullYear();
    const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const day = String(parsedDate.getDate()).padStart(2, '0');
    car.nextPreventiveDate = `${year}-${month}-${day}`;
    showToast(`Próxima preventiva de ${car.brand} ${car.model} recalculada para ${formatDateShort(car.nextPreventiveDate)} (+${car.preventivePeriodMonth} meses).`, 'success');
  }
}

// --- DYNAMIC SYSTEM TIMER ---
function initSystemClock() {
  const timeEl = document.getElementById('sysTime');
  const dateEl = document.getElementById('sysDate');
  if (!timeEl || !dateEl) return;

  // Render static simulated system time centered on June 18, 2026 or real date
  const updateTimer = () => {
    const rawLocale = new Date();
    timeEl.textContent = rawLocale.toLocaleTimeString('pt-BR');
    
    // Simulate June 18, 2026 as the reference date or today
    dateEl.textContent = new Date('2026-06-18').toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };
  
  updateTimer();
  setInterval(updateTimer, 1000);
}

// --- DJANGO REST SYNC SERVICE ---
async function fetchFromDjangoAPI(path: string, options?: RequestInit) {
  const API_BASE_URL = ''; // Matches proxy / root URL
  
  // Get CSRF Token
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  const csrfToken = match ? match[1] : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken;
  }

  const res = await fetch(`${API_BASE_URL}/api/${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers || {})
    }
  });

  if (!res.ok) {
    throw new Error(`Erro na API Django: Código ${res.status}`);
  }

  if (options?.method === 'DELETE') return;
  return res.json();
}

async function syncWithDjangoBackend() {
  if (!useDjangoApi) {
    loadLocalState();
    hideGlobalLoader();
    renderCurrentView();
    return;
  }

  showGlobalLoader('Sincronizando com Django...');
  try {
    const [djangoVehicles, djangoBookings, djangoMaintenances, djangoDrivers] = await Promise.all([
      fetchFromDjangoAPI('vehicles/'),
      fetchFromDjangoAPI('bookings/'),
      fetchFromDjangoAPI('maintenance/'),
      fetchFromDjangoAPI('drivers/').catch(() => null)
    ]);

    if (djangoVehicles && djangoVehicles.length > 0) vehicles = djangoVehicles;
    if (djangoBookings && djangoBookings.length > 0) bookings = djangoBookings;
    if (djangoMaintenances && djangoMaintenances.length > 0) maintenances = djangoMaintenances;
    if (djangoDrivers && djangoDrivers.length > 0) drivers = djangoDrivers;

    apiErrorMessage = null;
    showToast('Conectado ao Django com sucesso!', 'info');
    updateDjangoBadge(true);
  } catch (err: any) {
    console.error('Erro de Sync Django', err);
    apiErrorMessage = 'Falha ao sincronizar com o Django REST API. Carregando dados offline/locais.';
    showGlobalNotification(apiErrorMessage);
    updateDjangoBadge(false);
    
    // Fallback offline
    loadLocalState();
  } finally {
    hideGlobalLoader();
    renderCurrentView();
  }
}

function updateDjangoBadge(online: boolean) {
  const indicator = document.getElementById('djangoConnectionStatus');
  if (!indicator) return;

  if (online) {
    indicator.innerHTML = `
      <span class="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
      <span class="text-emerald-400 font-bold">API Django Ativa</span>
    `;
  } else {
    indicator.innerHTML = `
      <span class="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
      <span class="text-amber-400">Offline / Local</span>
    `;
  }
}

// --- TOAST NOTIFICATIONS ---
function showToast(message: string, type: 'success' | 'error' | 'info' = 'success') {
  const toast = document.getElementById('toastIndicator');
  const toastText = document.getElementById('toastIndicatorText');
  const toastSrc = document.getElementById('toastIndicatorSource');
  const toastIcon = document.getElementById('toastIndicatorIcon');

  if (!toast || !toastText || !toastSrc || !toastIcon) return;

  toastText.textContent = message;
  toastSrc.textContent = type === 'success' ? 'SUCESSO' : type === 'error' ? 'ALERTA DE ERRO' : 'SISTEMA';

  // Toggle colors
  if (type === 'success') {
    toastIcon.className = 'bg-emerald-500 p-1.5 rounded-full text-white';
    toastIcon.innerHTML = '<i data-lucide="check" class="h-4 w-4"></i>';
  } else if (type === 'error') {
    toastIcon.className = 'bg-rose-500 p-1.5 rounded-full text-white';
    toastIcon.innerHTML = '<i data-lucide="alert-triangle" class="h-4 w-4"></i>';
  } else {
    toastIcon.className = 'bg-blue-500 p-1.5 rounded-full text-white';
    toastIcon.innerHTML = '<i data-lucide="info" class="h-4 w-4"></i>';
  }

  toast.classList.remove('hidden');
  
  // Re-trigger icon creation
  if ((window as any).lucide) {
    (window as any).lucide.createIcons();
  }

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

// --- CUSTOM MODALS FOR CONFIRM & ALERT ---
let confirmModalCallback: (() => void) | null = null;

function showConfirmModal(title: string, message: string, onConfirm: () => void) {
  const modal = document.getElementById('modalConfirm');
  const titleEl = document.getElementById('confirmTitle');
  const msgEl = document.getElementById('confirmMessage');

  if (!modal || !titleEl || !msgEl) return;

  titleEl.textContent = title;
  msgEl.textContent = message;
  confirmModalCallback = onConfirm;

  modal.classList.remove('hidden');
  
  if ((window as any).lucide) {
    (window as any).lucide.createIcons();
  }
}

function showAlertModal(title: string, message: string) {
  const modal = document.getElementById('modalAlert');
  const titleEl = document.getElementById('alertTitle');
  const msgEl = document.getElementById('alertMessage');

  if (!modal || !titleEl || !msgEl) return;

  titleEl.textContent = title;
  msgEl.textContent = message;

  modal.classList.remove('hidden');
  
  if ((window as any).lucide) {
    (window as any).lucide.createIcons();
  }
}

// --- GLOBAL NOTIFICATION BAR ---
function showGlobalNotification(msg: string) {
  const area = document.getElementById('globalNotificationArea');
  const text = document.getElementById('globalNotificationText');
  if (!area || !text) return;

  text.textContent = msg;
  area.classList.remove('hidden');
}

function hideGlobalNotification() {
  const area = document.getElementById('globalNotificationArea');
  if (area) area.classList.add('hidden');
}

function showGlobalLoader(label: string = 'Carregando...') {
  // Can just show progress on title or buttons
}

function hideGlobalLoader() {
  // Clear any spinners
}

// --- VIEW CONTROLLER: ACTIVE TAB RENDERING ---
function navigateTo(tab: AppTab) {
  activeTab = tab;
  
  // Scroll to top of window slightly
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Update navbar items visually
  document.querySelectorAll('.nav-item').forEach(btn => {
    const btnTab = btn.getAttribute('data-tab');
    if (btnTab === tab) {
      btn.className = 'nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all bg-blue-600 text-white shadow-md shadow-blue-500/10';
    } else {
      btn.className = 'nav-item flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all text-slate-300 hover:bg-slate-800 hover:text-white';
    }
  });

  // Render view
  renderCurrentView();
}

function setupSearchableSelect(
  containerId: string,
  selectId: string,
  optionsContainerId: string,
  triggerId: string,
  selectedTextId: string,
  searchId: string,
  allOptions: { id: string; label: string }[],
  placeholder: string
) {
  const container = document.getElementById(containerId);
  const selectEl = document.getElementById(selectId) as HTMLSelectElement;
  const optionsContainer = document.getElementById(optionsContainerId);
  const trigger = document.getElementById(triggerId);
  const selectedText = document.getElementById(selectedTextId);
  const searchInput = document.getElementById(searchId) as HTMLInputElement;

  if (!container || !selectEl || !optionsContainer || !trigger || !selectedText || !searchInput) return;

  // Toggle dropdown on trigger click
  trigger.onclick = (e) => {
    e.stopPropagation();
    
    // Close other dropdowns
    document.querySelectorAll('[id$="DropdownPanel"]').forEach(panel => {
      if (panel.id !== `${selectId}DropdownPanel` && panel.id !== containerId.replace('Container', 'Panel')) {
        panel.classList.add('hidden');
      }
    });

    const panel = document.getElementById(containerId.replace('Container', 'Panel'));
    if (panel) {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        searchInput.focus();
        // Clear search on open to show all options
        searchInput.value = '';
        renderOptions();
      }
    }
  };

  // Close dropdown on click outside
  if (!(container as any)._outsideClickBound) {
    document.addEventListener('click', (e) => {
      const panel = document.getElementById(containerId.replace('Container', 'Panel'));
      if (panel && !container.contains(e.target as Node)) {
        panel.classList.add('hidden');
      }
    });
    (container as any)._outsideClickBound = true;
  }

  // Handle search input inside panel
  const renderOptions = () => {
    const query = searchInput.value.toLowerCase().trim();
    const filtered = allOptions.filter(opt => opt.label.toLowerCase().includes(query));

    if (filtered.length === 0) {
      optionsContainer.innerHTML = `<div class="px-3 py-2 text-xs text-slate-400 italic">Nenhum resultado encontrado</div>`;
      return;
    }

    optionsContainer.innerHTML = filtered.map(opt => `
      <div data-value="${opt.id}" class="px-3 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-750 cursor-pointer transition-colors truncate flex items-center justify-between">
        <span>${opt.label}</span>
        ${selectEl.value === opt.id ? '<span class="text-blue-600 font-bold">✓</span>' : ''}
      </div>
    `).join('');

    // Bind option click
    optionsContainer.querySelectorAll('[data-value]').forEach(el => {
      const optionEl = el as HTMLElement;
      optionEl.onclick = (e) => {
        e.stopPropagation();
        const val = optionEl.getAttribute('data-value') || '';
        
        // Update original select Box
        selectEl.value = val;
        
        // Update trigger text
        const found = allOptions.find(o => o.id === val);
        selectedText.textContent = found ? found.label : placeholder;
        if (found && val !== '') {
          selectedText.classList.remove('text-slate-400');
          selectedText.classList.add('text-slate-800');
        } else {
          selectedText.classList.remove('text-slate-800');
          selectedText.classList.add('text-slate-400');
        }

        // Close panel
        const panel = document.getElementById(containerId.replace('Container', 'Panel'));
        if (panel) panel.classList.add('hidden');

        // Fire change event
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
      };
    });
  };

  // Listen to search
  if (!(searchInput as any)._searchBound) {
    searchInput.oninput = () => {
      renderOptions();
    };
    (searchInput as any)._searchBound = true;
  }

  // Sync back standard value setting from code
  const syncSelection = () => {
    const val = selectEl.value;
    const found = allOptions.find(o => o.id === val);
    selectedText.textContent = found ? found.label : placeholder;
    if (found && val !== '') {
      selectedText.classList.remove('text-slate-400');
      selectedText.classList.add('text-slate-800');
    } else {
      selectedText.classList.remove('text-slate-800');
      selectedText.classList.add('text-slate-400');
    }
  };

  // Allow forcing sync from external code
  (selectEl as any).syncCustomSelect = () => {
    syncSelection();
    renderOptions();
  };

  // Perform initial render
  syncSelection();
  renderOptions();
}

function renderCurrentView() {
  const pageTitle = document.getElementById('pageTitle');
  if (pageTitle) {
    const titles: Record<AppTab, string> = {
      dashboard: 'Painel Geral de Controle',
      timeline: 'Cronograma de Reservas (Ocupação)',
      bookings: 'Registro e Gestão de Reservas',
      fleet: 'Controle de Veículos / Frota',
      maintenance: 'Plano de Manutenção e Custos',
      newBooking: 'Fazer Nova Reserva',
      newVehicle: vehicleToEdit ? `Editar Veículo: ${vehicleToEdit.plate}` : 'Cadastrar Novo Veículo',
      drivers: 'Controle de Motoristas',
      newDriver: driverToEdit ? `Editar Motorista: ${driverToEdit.name}` : 'Cadastrar Novo Motorista'
    };
    pageTitle.textContent = titles[activeTab];
  }

  // Toggle Tab Sections
  document.querySelectorAll('.tab-content').forEach(sect => {
    if (sect.id === `tab-${activeTab}`) {
      sect.classList.remove('hidden');
    } else {
      sect.classList.add('hidden');
    }
  });

  // Execute sub-tab rendering logic
  if (activeTab === 'dashboard') {
    renderDashboard();
  } else if (activeTab === 'timeline') {
    renderTimeline();
  } else if (activeTab === 'bookings') {
    renderBookings();
  } else if (activeTab === 'fleet') {
    renderFleet();
  } else if (activeTab === 'maintenance') {
    renderMaintenance();
  } else if (activeTab === 'newBooking') {
    renderNewBookingForm();
  } else if (activeTab === 'newVehicle') {
    renderNewVehicleForm();
  } else if (activeTab === 'drivers') {
    renderDrivers();
  } else if (activeTab === 'newDriver') {
    renderNewDriverForm();
  }

  // Bind universal action buttons
  document.querySelectorAll('.action-btn[data-nav]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      const tabTarget = el.getAttribute('data-nav') as AppTab;
      navigateTo(tabTarget);
    });
  });

  // Initialize/refresh Lucide Vector Icons
  if ((window as any).lucide) {
    (window as any).lucide.createIcons();
  }
}

// --- SUB-VIEW: DASHBOARD PANEL ---
function renderDashboard() {
  // Aggregate stats
  const referenceDayISOStr = '2026-06-18';
  
  const activeBookingsCount = bookings.filter(b => b.status === 'pendente' || b.status === 'ativo').length;
  const bookingsToday = bookings.filter(b => b.status !== 'cancelado' && b.startDate.startsWith(referenceDayISOStr));

  const activeVehicles = vehicles.filter(v => v.active !== false);
  const countTotal = activeVehicles.length;
  const countAvailable = activeVehicles.filter(v => v.status === 'disponivel').length;
  const countInUse = activeVehicles.filter(v => v.status === 'uso').length;
  const countCanteiro = activeVehicles.filter(v => v.status === 'canteiro').length;
  const countMaintenance = activeVehicles.filter(v => v.status === 'manutencao').length;

  const statsContainer = document.getElementById('statsContainer');
  if (statsContainer) {
    statsContainer.innerHTML = `
      <!-- Total -->
      <div class="bg-white rounded-2xl border border-slate-200/85 p-4 shadow-2xs flex items-center gap-3">
        <div class="bg-slate-100 p-2.5 rounded-xl text-slate-700">
          <i data-lucide="car" class="h-5 w-5"></i>
        </div>
        <div>
          <span class="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Frota Ativa</span>
          <span class="text-lg font-bold font-mono text-slate-800">${countTotal}</span>
        </div>
      </div>

      <!-- Disponiveis -->
      <div class="bg-white rounded-2xl border border-slate-200/85 p-4 shadow-2xs flex items-center gap-3">
        <div class="bg-emerald-50 p-2.5 rounded-xl text-emerald-600">
          <i data-lucide="check-circle" class="h-5 w-5"></i>
        </div>
        <div>
          <span class="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Disponíveis</span>
          <span class="text-lg font-bold font-mono text-emerald-600">${countAvailable}</span>
        </div>
      </div>

      <!-- Em Canteiro -->
      <div class="bg-white rounded-2xl border border-slate-200/85 p-4 shadow-2xs flex items-center gap-3">
        <div class="bg-amber-50 p-2.5 rounded-xl text-amber-600">
          <i data-lucide="building" class="h-5 w-5"></i>
        </div>
        <div>
          <span class="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">No Canteiro</span>
          <span class="text-lg font-bold font-mono text-amber-600">${countCanteiro}</span>
        </div>
      </div>

      <!-- Em Uso -->
      <div class="bg-white rounded-2xl border border-slate-200/85 p-4 shadow-2xs flex items-center gap-3">
        <div class="bg-sky-50 p-2.5 rounded-xl text-sky-600">
          <i data-lucide="trending-up" class="h-5 w-5"></i>
        </div>
        <div>
          <span class="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Em Viagem</span>
          <span class="text-lg font-bold font-mono text-sky-600">${countInUse}</span>
        </div>
      </div>

      <!-- Em Manutencao -->
      <div class="bg-white rounded-2xl border border-slate-200/85 p-4 shadow-2xs flex items-center gap-3">
        <div class="bg-rose-50 p-2.5 rounded-xl text-rose-600">
          <i data-lucide="wrench" class="h-5 w-5"></i>
        </div>
        <div>
          <span class="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Oficina</span>
          <span class="text-lg font-bold font-mono text-rose-600">${countMaintenance}</span>
        </div>
      </div>

      <!-- Reservas Ativas -->
      <div class="bg-white rounded-2xl border border-slate-200/85 p-4 shadow-2xs flex items-center gap-3">
        <div class="bg-indigo-50 p-2.5 rounded-xl text-indigo-600">
          <i data-lucide="clipboard-list" class="h-5 w-5"></i>
        </div>
        <div>
          <span class="text-[10px] text-slate-400 font-bold block uppercase tracking-wider">Reservas</span>
          <span class="text-lg font-bold font-mono text-indigo-600">${activeBookingsCount}</span>
        </div>
      </div>
    `;
  }

  // Renders "Proximos Eventos da Frota"
  const dashList = document.getElementById('dashNextBookings');
  if (dashList) {
    const nonCanceled = bookings
      .filter(b => b.status === 'pendente' || b.status === 'ativo')
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
      .slice(0, 4);

    if (nonCanceled.length === 0) {
      dashList.innerHTML = `
        <div class="p-6 text-center text-slate-400">
          Nenhuma reserva pendente ou ativa no momento.
        </div>
      `;
    } else {
      dashList.innerHTML = nonCanceled.map(b => {
        const car = vehicles.find(v => v.id === b.vehicleId);
        const carLabel = car ? `${car.brand} ${car.model} (${car.plate})` : 'Carro não cadastrado';
        const isCurrentlyAtivo = b.status === 'ativo';

        return `
          <div class="py-3 flex items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors">
            <div class="flex items-start gap-2.5">
              <div class="h-7 w-7 rounded-lg ${isCurrentlyAtivo ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-500'} flex items-center justify-center font-bold text-xs uppercase shrink-0 mt-0.5">
                ${isCurrentlyAtivo ? '<i data-lucide="play" class="h-3.5 w-3.5"></i>' : '<i data-lucide="clock" class="h-3.5 w-3.5"></i>'}
              </div>
              <div>
                <div class="font-bold text-slate-800">${b.driverName}</div>
                <div class="text-[11px] text-slate-500 mt-0.2">${carLabel} • ${b.purpose}</div>
              </div>
            </div>
            
            <div class="text-right shrink-0">
              <span class="text-[10px] font-mono text-slate-400 block">${formatDateTime(b.startDate)}</span>
              <span class="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${isCurrentlyAtivo ? 'bg-sky-100 text-sky-800' : 'bg-amber-100 text-amber-800'}">
                ${isCurrentlyAtivo ? 'Em viagem' : 'Reservado'}
              </span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Renders "Alertas da Frota" (Alerta de km e manutenções)
  const dashAlerts = document.getElementById('dashAlertsArea');
  if (dashAlerts) {
    const overdueMaint = maintenances.filter(m => m.status === 'agendado');
    const inOficina = vehicles.filter(v => v.status === 'manutencao');

    let alertsHtml = '';

    if (overdueMaint.length > 0) {
      alertsHtml += overdueMaint.map(m => {
        const car = vehicles.find(v => v.id === m.vehicleId);
        const carLabel = car ? `${car.brand} (${car.plate})` : 'Veículo';
        return `
          <div class="bg-amber-50/60 border border-amber-200/50 rounded-xl p-3 flex items-start gap-2 text-amber-900">
            <i data-lucide="wrench" class="h-4 w-4 text-amber-600 shrink-0 mt-0.5 animate-pulse"></i>
            <div>
              <div class="font-bold [font-size:11px]">Manutenção Agendada</div>
              <p class="text-[10px] text-amber-800 mt-0.5">${carLabel}: ${m.description} • Previsto: ${formatDateShort(m.date)}</p>
            </div>
          </div>
        `;
      }).join('');
    }

    if (inOficina.length > 0) {
      alertsHtml += inOficina.map(v => {
        return `
          <div class="bg-rose-50/55 border border-rose-100 rounded-xl p-3 flex items-start gap-2 text-rose-900">
            <i data-lucide="alert-circle" class="h-4 w-4 text-rose-500 shrink-0 mt-0.5"></i>
            <div>
              <div class="font-bold [font-size:11px]">Veículo Indisponível</div>
              <p class="text-[10px] text-rose-800 mt-0.5">${v.brand} ${v.model} (${v.plate}) está na oficina recebendo reparos técnicos.</p>
            </div>
          </div>
        `;
      }).join('');
    }

    if (!alertsHtml) {
      alertsHtml = `
        <div class="p-4 rounded-xl border border-slate-100 bg-slate-50/50 text-slate-400 text-center text-xs">
          Nenhum alerta pendente. Frota funcionando 100%.
        </div>
      `;
    }

    dashAlerts.innerHTML = alertsHtml;
  }
}

// --- SUB-VIEW: TIMELINE CRONOGRAMA ---
function renderTimeline() {
  const container = document.getElementById('timelineViewPlaceholder');
  if (!container) return;

  // Set reference dates around 2026-06-18
  const baseDate = new Date('2026-06-18T12:00:00');
  baseDate.setDate(baseDate.getDate() + timelineDayOffset);

  const activeDateISOStr = baseDate.toISOString().split('T')[0];

  const formatDateLabel = (d: Date): string => {
    return d.toLocaleDateString('pt-BR', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    });
  };

  const hours = Array.from({ length: 12 }, (_, i) => i + 8); // 8:00 to 19:00

  // 7 days of the week starting from activeDate
  const getWeekDates = (): Date[] => {
    const dates: Date[] = [];
    const b = new Date(baseDate);
    b.setHours(12, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const nd = new Date(b);
      nd.setDate(b.getDate() + i);
      dates.push(nd);
    }
    return dates;
  };

  const weekDates = getWeekDates();

  // Overlap helper per hour slot
  const getActiveBookingForHour = (vehicleId: string, dateStr: string, hour: number): Booking | null => {
    const cellStart = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`).getTime();
    const cellEnd = new Date(`${dateStr}T${String(hour).padStart(2, '0')}:59:59`).getTime();

    return bookings.find(b => {
      if (b.vehicleId !== vehicleId) return false;
      if (b.status === 'cancelado') return false;

      const start = new Date(b.startDate).getTime();
      const end = new Date(b.endDate).getTime();

      return start < cellEnd && end > cellStart;
    }) || null;
  };

  // Check if a vehicle is booked on a specific date (any part of it)
  const getActiveBookingForDate = (vehicleId: string, dateStr: string): Booking | null => {
    const dayStart = new Date(`${dateStr}T00:00:00`).getTime();
    const dayEnd = new Date(`${dateStr}T23:59:59`).getTime();

    return bookings.find(b => {
      if (b.vehicleId !== vehicleId) return false;
      if (b.status === 'cancelado') return false;

      const start = new Date(b.startDate).getTime();
      const end = new Date(b.endDate).getTime();

      return start <= dayEnd && end >= dayStart;
    }) || null;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ativo':
        return 'bg-blue-600 hover:bg-blue-700 text-white';
      case 'pendente':
        return 'bg-amber-400 text-slate-900';
      case 'concluido':
        return 'bg-emerald-600 text-white';
      default:
        return 'bg-slate-400 text-white';
    }
  };

  const gridColumnsCount = timelineViewMode === 'today' ? hours.length : 7;

  let gridHeadersHtml = '';
  if (timelineViewMode === 'today') {
    gridHeadersHtml = hours.map(h => `
      <div class="text-center font-mono font-bold text-slate-600">${String(h).padStart(2, '0')}:00</div>
    `).join('');
  } else {
    gridHeadersHtml = weekDates.map(d => `
      <div class="text-center">
        <span class="text-slate-400 lowercase italic">${d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</span>
        <div class="font-mono font-bold text-slate-700 text-xs">${d.getDate()}</div>
      </div>
    `).join('');
  }

  container.innerHTML = `
    <!-- Card Root -->
    <div class="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-5">
      <!-- Toolbar controls -->
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 class="text-sm font-bold text-slate-800">Cronograma de Utilização da Frota</h3>
          <p class="text-[11px] text-slate-400">Verifique horários e cruzamento de reservas por carro e motorista.</p>
        </div>

        <div class="flex items-center gap-2 flex-wrap">
          <div class="inline-flex rounded-xl border border-slate-200 p-0.5 bg-slate-50">
            <button id="toggleTimelineToday" class="px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${timelineViewMode === 'today' ? 'bg-white text-slate-800 shadow-2xs font-bold border border-slate-200/40' : 'text-slate-500 hover:text-slate-800'}">
              Agenda Diária
            </button>
            <button id="toggleTimelineWeek" class="px-3.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${timelineViewMode === 'week' ? 'bg-white text-slate-800 shadow-2xs font-bold border border-slate-200/40' : 'text-slate-500 hover:text-slate-800'}">
              Semana Inteira
            </button>
          </div>

          <div class="flex items-center gap-1 border border-slate-200 rounded-xl p-0.5 bg-slate-50">
            <button id="timelinePrev" class="p-1 px-1.5 rounded-lg hover:bg-white text-slate-600 transition-colors" title="Anterior">
              <i data-lucide="chevron-left" class="h-4 w-4"></i>
            </button>
            <button id="timelineToday" class="px-2.5 py-1 text-[10px] font-semibold hover:bg-white rounded-lg text-slate-700 transition-all">
              Hoje
            </button>
            <button id="timelineNext" class="p-1 px-1.5 rounded-lg hover:bg-white text-slate-600 transition-colors" title="Próximo">
              <i data-lucide="chevron-right" class="h-4 w-4"></i>
            </button>
          </div>
        </div>
      </div>

      <!-- Date Banner Header -->
      <div class="bg-blue-50/30 rounded-xl p-3 border border-blue-100/20 flex items-center justify-between text-xs font-semibold">
        <div class="flex items-center gap-2 text-blue-950">
          <i data-lucide="clock" class="h-4.5 w-4.5 text-blue-500 animate-pulse"></i>
          <span class="uppercase tracking-wide">
            ${timelineViewMode === 'today' 
              ? formatDateLabel(baseDate) 
              : `Semana de ${formatDateShort(weekDates[0].toISOString())} a ${formatDateShort(weekDates[6].toISOString())}`
            }
          </span>
        </div>
        <div class="text-[9px] font-semibold text-blue-700 bg-blue-100/60 px-2 py-0.5 rounded-md font-mono">
          ${timelineViewMode === 'today' ? 'Foco por hora' : 'Foco Semanal'}
        </div>
      </div>

      <!-- Visual Grid Table -->
      <div class="overflow-x-auto border border-slate-150 rounded-xl bg-white">
        <div class="min-w-[800px] divide-y divide-slate-100">
          
          <!-- Header Row -->
          <div class="grid grid-cols-12 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-widest py-3 px-4 items-center">
            <div class="col-span-3 border-r border-slate-200 pr-2">Veículo</div>
            <div class="col-span-9 grid gap-1" style="grid-template-columns: repeat(${gridColumnsCount}, minmax(0, 1fr))">
              ${gridHeadersHtml}
            </div>
          </div>

          <!-- Vehicles Rows -->
          ${vehicles.filter(v => v.active !== false).length === 0 ? `
            <div class="p-8 text-center text-slate-400 text-xs">
              Nenhum veículo ativo cadastrado. Adicione ou reative veículos na aba de frota.
            </div>
          ` : vehicles.filter(v => v.active !== false).map(vehicle => {
            return `
              <div class="grid grid-cols-12 hover:bg-slate-50/30 py-3.5 px-4 items-center">
                <!-- Vehicle Card -->
                <div class="col-span-3 border-r border-slate-100/80 pr-3 flex flex-col justify-center">
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-xs text-slate-800 leading-tight">${vehicle.brand} ${vehicle.model}</span>
                    <span class="text-[8px] font-bold uppercase tracking-wider px-1 block rounded ${
                      vehicle.status === 'uso' ? 'bg-sky-50 text-sky-700 border' :
                      vehicle.status === 'manutencao' ? 'bg-rose-50 text-rose-700 border' :
                      'bg-emerald-50 text-emerald-700 border'
                    }">${vehicle.status === 'uso' ? 'Ruas' : vehicle.status === 'disponivel' ? 'Livre' : 'Oficina'}</span>
                  </div>
                  <div class="flex items-center gap-2 mt-1 text-[10px] font-mono text-slate-405">
                    <span class="bg-slate-100 text-slate-600 px-1 py-0.2 rounded border text-[9px] font-semibold">${vehicle.plate}</span>
                    <span>${vehicle.km.toLocaleString('pt-BR')} KM</span>
                  </div>
                </div>

                <!-- Hours / Day Slots -->
                <div class="col-span-9 grid relative select-none h-10 gap-1.5" style="grid-template-columns: repeat(${gridColumnsCount}, minmax(0, 1fr))">
                  ${timelineViewMode === 'today' ? 
                    // Hourly blocks
                    hours.map(h => {
                      const b = getActiveBookingForHour(vehicle.id, activeDateISOStr, h);
                      if (vehicle.status === 'manutencao') {
                        return `<div class="bg-rose-50/20 border border-rose-100/20 rounded text-[9px] flex items-center justify-center text-rose-500 font-semibold uppercase leading-none">Oficina</div>`;
                      }
                      if (b) {
                        return `
                          <div data-booking-id="${b.id}" class="booking-block mx-0.5 p-1 rounded border overflow-hidden flex flex-col justify-center cursor-pointer transition-all shadow-3xs ${getStatusColor(b.status)}" title="${b.driverName}: ${b.purpose}">
                            <span class="font-bold text-[9px] truncate leading-tight">${b.driverName.split(' ')[0]}</span>
                            <span class="opacity-80 text-[8px] truncate leading-none mt-0.5">${b.purpose}</span>
                          </div>
                        `;
                      }
                      // Empty Slot, clicking initiates a booking link
                      return `
                        <button data-vehicle-id="${vehicle.id}" data-time="${activeDateISOStr}T${String(h).padStart(2, '0')}:00" class="new-timeline-booking rounded border border-dashed border-slate-205 hover:bg-blue-50/50 hover:border-blue-300 transition-colors cursor-pointer flex items-center justify-center" title="Clique para agendar às ${String(h).padStart(2, '0')}:00"></button>
                      `;
                    }).join('')
                    :
                    // Weekly blocks
                    weekDates.map(d => {
                      const dateStr = d.toISOString().split('T')[0];
                      const b = getActiveBookingForDate(vehicle.id, dateStr);
                      if (vehicle.status === 'manutencao') {
                        return `<div class="bg-rose-50/20 border border-rose-100/20 rounded text-[9px] flex items-center justify-center text-rose-500 font-semibold uppercase leading-none">Oficina</div>`;
                      }
                      if (b) {
                        return `
                          <div data-booking-id="${b.id}" class="booking-block p-1 rounded border overflow-hidden flex flex-col justify-center cursor-pointer transition-all ${getStatusColor(b.status)}" title="${b.driverName}: ${b.purpose}">
                            <span class="font-bold text-[9px] truncate">${b.driverName.split(' ')[0]}</span>
                            <span class="opacity-80 text-[8px] truncate mt-0.5">${b.purpose}</span>
                          </div>
                        `;
                      }
                      return `
                        <button data-vehicle-id="${vehicle.id}" data-time="${dateStr}T08:00" class="new-timeline-booking rounded border border-dashed border-slate-205 hover:bg-blue-50/50 hover:border-blue-300 transition-all cursor-pointer"></button>
                      `;
                    }).join('')
                  }
                </div>
              </div>
            `;
          }).join('')}

        </div>
      </div>

      <!-- Quick Indicator Legends -->
      <div class="flex items-center gap-4 text-[10px] text-slate-500 font-medium border-t pt-3 border-slate-100">
        <span class="flex items-center gap-1.5 min-w-[90px]"><span class="h-2.5 w-2.5 rounded bg-blue-600 block"></span> Em Trânsito</span>
        <span class="flex items-center gap-1.5 min-w-[90px]"><span class="h-2.5 w-2.5 rounded bg-amber-400 block"></span> Aut. Retirada</span>
        <span class="flex items-center gap-1.5 min-w-[90px]"><span class="h-2.5 w-2.5 rounded bg-emerald-600 block"></span> Concluído</span>
        <span class="flex items-center gap-1.5 min-w-[90px]"><span class="h-2.5 w-2.5 rounded-lg border-2 border-dashed border-slate-300 block"></span> Livre (Agendar)</span>
      </div>
    </div>
  `;

  // --- BIND LOCAL TIMELINE EVENTS ---
  document.getElementById('toggleTimelineToday')!.onclick = () => {
    timelineViewMode = 'today';
    timelineDayOffset = 0;
    renderTimeline();
  };
  document.getElementById('toggleTimelineWeek')!.onclick = () => {
    timelineViewMode = 'week';
    timelineDayOffset = 0;
    renderTimeline();
  };
  document.getElementById('timelinePrev')!.onclick = () => {
    timelineDayOffset -= (timelineViewMode === 'today' ? 1 : 7);
    renderTimeline();
  };
  document.getElementById('timelineNext')!.onclick = () => {
    timelineDayOffset += (timelineViewMode === 'today' ? 1 : 7);
    renderTimeline();
  };
  document.getElementById('timelineToday')!.onclick = () => {
    timelineDayOffset = 0;
    renderTimeline();
  };

  // Click on a booking bar to expand its detail or view details
  document.querySelectorAll('.booking-block').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const bId = el.getAttribute('data-booking-id');
      const b = bookings.find(item => item.id === bId);
      if (b) {
        // Redraw bookings list with specific filters or show detailed alert
        bookingsSearchQuery = b.driverName;
        bookingsFilterStatus = 'all';
        navigateTo('bookings');
        
        // Populate inputs
        const searchInput = document.getElementById('bookingsSearchInput') as HTMLInputElement;
        if (searchInput) searchInput.value = b.driverName;
        const filterStatusEl = document.getElementById('bookingsFilterStatus') as HTMLSelectElement;
        if (filterStatusEl) filterStatusEl.value = 'all';
      }
    });
  });

  // Deep-link click to schedule booking directly
  document.querySelectorAll('.new-timeline-booking').forEach(el => {
    el.addEventListener('click', () => {
      const vId = el.getAttribute('data-vehicle-id') || '';
      const timeVal = el.getAttribute('data-time') || '';
      
      // Setup prefills
      prefilledVehicleId = vId;
      prefilledStartDate = timeVal;
      
      navigateTo('newBooking');
    });
  });

  if ((window as any).lucide) (window as any).lucide.createIcons();
}

// --- SUB-VIEW: BOOKINGS PANEL ---
function renderBookings() {
  const container = document.getElementById('bookingsListContainer');
  if (!container) return;

  const query = bookingsSearchQuery.toLowerCase().trim();
  const filtered = bookings.filter(b => {
    const car = vehicles.find(v => v.id === b.vehicleId);
    const carLabel = car ? `${car.brand} ${car.model} ${car.plate}` : '';

    const matchesSearch = 
      b.driverName.toLowerCase().includes(query) ||
      b.purpose.toLowerCase().includes(query) ||
      carLabel.toLowerCase().includes(query);

    const matchesStatus = bookingsFilterStatus === 'all' || b.status === bookingsFilterStatus;

    return matchesSearch && matchesStatus;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400 text-sm">
        <i data-lucide="inbox" class="h-8 w-8 mx-auto text-slate-300 block mb-3"></i>
        Nenhuma reserva encontrada correspondente aos filtros atuais.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(b => {
    const car = vehicles.find(v => v.id === b.vehicleId);
    const carName = car ? `${car.brand} ${car.model}` : 'Veículo não localizado';
    const carDetails = car ? `${car.color} • Placa: ${car.plate}` : '';

    // Calculate progress indicators if active
    let progressHtml = '';
    if (b.status === 'ativo') {
      const totalTime = new Date(b.endDate).getTime() - new Date(b.startDate).getTime();
      const elapsed = SYSTEM_REFERENCE_DATE.getTime() - new Date(b.startDate).getTime();
      const pct = Math.min(Math.max((elapsed / totalTime) * 100, 5), 100);

      progressHtml = `
        <div class="space-y-1 mt-2.5">
          <div class="flex justify-between items-center text-[9px] text-slate-400 font-mono">
            <span>TEMPO EM VIAGEM</span>
            <span>${Math.round(pct)}% Decorrido</span>
          </div>
          <div class="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div class="bg-sky-500 h-full rounded-full" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }

    // Dynamic actions buttons based of status
    let actionsHtml = '';
    if (b.status === 'pendente') {
      actionsHtml = `
        <button data-action="start" data-id="${b.id}" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-3xs">
          <i data-lucide="play-circle" class="h-3.5 w-3.5"></i> Iniciar Viagem
        </button>
        <button data-action="cancel" data-id="${b.id}" class="border border-slate-200 hover:bg-slate-50 text-rose-500 font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-colors">
          Cancelar
        </button>
      `;
    } else if (b.status === 'ativo') {
      actionsHtml = `
        <button data-action="finish" data-id="${b.id}" class="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-3xs">
          <i data-lucide="check-circle" class="h-3.5 w-3.5"></i> Finalizar Viagem
        </button>
      `;
    }

    const badgeClasses: Record<string, string> = {
      pendente: 'bg-amber-50 text-amber-800 border-amber-250',
      ativo: 'bg-sky-50 text-sky-800 border-sky-250',
      concluido: 'bg-emerald-50 text-emerald-800 border-emerald-250',
      cancelado: 'bg-slate-50 text-slate-400 border-slate-200'
    };

    const statusLabel: Record<string, string> = {
      pendente: 'Aguardando Retirada',
      ativo: 'Em Trânsito',
      concluido: 'Finalizada / Devolvido',
      cancelado: 'Cancelada'
    };

    const cnhBadge = `<span class="bg-slate-100 text-slate-655 font-mono font-bold px-1.5 py-0.2 rounded border text-[9px] uppercase ml-1.5">CAT ${b.driverCnhCategory}</span>`;

    return `
      <!-- Booking Item Row Card -->
      <div class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-3 border-slate-100">
          <div class="flex items-start gap-3">
            <div class="bg-slate-50 border p-2.5 rounded-xl text-slate-700 font-medium">
              <i data-lucide="car" class="h-5 w-5"></i>
            </div>
            <div>
              <h4 class="font-bold text-xs text-slate-900">${carName}</h4>
              <p class="text-[10px] text-slate-405 font-mono uppercase mt-0.5">${carDetails}</p>
            </div>
          </div>

          <div class="text-left sm:text-right">
            <span class="px-2 py-0.8 rounded-md text-[10px] font-bold border uppercase tracking-wider block sm:inline-block ${badgeClasses[b.status] || 'bg-slate-100 text-slate-700'}">
              ${statusLabel[b.status] || b.status}
            </span>
            <span class="text-[10px] text-slate-400 font-mono block mt-1.5">Reserva ID: #${b.id.substring(0, 7)}</span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <!-- Column 1: Driver -->
          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wide font-mono block">Condutor Comercial</span>
            <div class="font-bold text-slate-800 flex items-center leading-snug">
              ${b.driverName} ${cnhBadge}
            </div>
            <p class="text-[10px] text-slate-500 font-mono">CPF: ${maskCPF(b.driverCpf)} • CNH: ${b.driverCnh}</p>
          </div>

          <!-- Column 2: Period -->
          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wide font-mono block">Cronograma Retirada/Retorno</span>
            <div class="text-slate-800 leading-normal">
              <div class="flex items-center gap-1 font-semibold text-[11px]"><span class="w-1.5 h-1.5 rounded-full bg-blue-500 block"></span> Saída: ${formatDateTime(b.startDate)}</div>
              <div class="flex items-center gap-1 font-semibold text-[11px] mt-0.5"><span class="w-1.5 h-1.5 rounded-full bg-slate-400 block"></span> Volta: ${formatDateTime(b.endDate)}</div>
            </div>
          </div>

          <!-- Column 3: Purpose -->
          <div class="space-y-1">
            <span class="text-[10px] uppercase font-bold text-slate-400 tracking-wide font-mono block">Justificativa de Viagem</span>
            <p class="text-slate-800 text-xs italic font-medium leading-relaxed bg-slate-50/50 p-2 border border-slate-100 rounded-lg">"${b.purpose}"</p>
          </div>
        </div>

        ${progressHtml}

        <!-- Outward travel indicators like Kilometer, Return dates -->
        ${(b.actualStartKm || b.actualEndDate || b.notes) ? `
          <div class="bg-slate-50/60 p-3 rounded-xl border border-slate-100 text-[11px] text-slate-600 grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1.5">
            <div>
              ${b.actualStartKm ? `<div class="font-mono"><strong>KM Inicial:</strong> ${b.actualStartKm} km ${b.actualEndKm ? `• <strong>KM Final:</strong> ${b.actualEndKm} km` : ''}</div>` : ''}
              ${b.actualStartDate ? `<div><strong>Entrega Efetivada:</strong> ${formatDateTime(b.actualStartDate)}</div>` : ''}
              ${b.actualEndDate ? `<div><strong>Devolução Registrada:</strong> ${formatDateTime(b.actualEndDate)}</div>` : ''}
            </div>
            <div>
              ${b.notes ? `<div><strong>Notas de Viagem:</strong> <span class="italic text-slate-500 font-semibold">"${b.notes}"</span></div>` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Actions -->
        ${actionsHtml ? `
          <div class="flex items-center gap-2 pt-1 border-t border-slate-100">
            ${actionsHtml}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  // --- BIND BOOKING CTA ACTIONS ---
  document.querySelectorAll('[data-action="start"]').forEach(el => {
    el.addEventListener('click', () => {
      const bId = el.getAttribute('data-id') || '';
      const b = bookings.find(item => item.id === bId);
      if (!b) return;

      const car = vehicles.find(v => v.id === b.vehicleId);
      
      // Populate Modal Fields
      document.getElementById('startTripBookingId')!.setAttribute('value', bId);
      document.getElementById('startTripCarLabel')!.textContent = car ? `${car.brand} ${car.model} (${car.plate})` : 'Carro';
      document.getElementById('startTripDriverLabel')!.textContent = `Motorista: ${b.driverName}`;
      
      // Prefill KM with current car odometer
      (document.getElementById('startTripKm') as HTMLInputElement).value = car ? String(car.km) : '0';
      
      // Display Modal
      document.getElementById('modalStartTrip')!.classList.remove('hidden');
    });
  });

  document.querySelectorAll('[data-action="finish"]').forEach(el => {
    el.addEventListener('click', () => {
      const bId = el.getAttribute('data-id') || '';
      const b = bookings.find(item => item.id === bId);
      if (!b) return;

      const car = vehicles.find(v => v.id === b.vehicleId);
      const outputStartKm = b.actualStartKm || (car ? car.km : 0);

      // Populate Modal
      document.getElementById('finishTripBookingId')!.setAttribute('value', bId);
      document.getElementById('finishTripBaseKm')!.setAttribute('value', String(outputStartKm));
      document.getElementById('finishTripCarLabel')!.textContent = car ? `${car.brand} ${car.model} (${car.plate})` : 'Carro';
      document.getElementById('finishTripDriverLabel')!.textContent = `Motorista: ${b.driverName}`;
      document.getElementById('finishTripOdometerStart')!.textContent = String(outputStartKm);
      
      // Pre-fill target km
      (document.getElementById('finishTripKm') as HTMLInputElement).value = String(outputStartKm + 10);
      (document.getElementById('finishTripNotes') as HTMLTextAreaElement).value = '';

      // Open Modal
      document.getElementById('modalFinishTrip')!.classList.remove('hidden');
    });
  });

  document.querySelectorAll('[data-action="cancel"]').forEach(el => {
    el.addEventListener('click', () => {
      const bId = el.getAttribute('data-id') || '';
      const b = bookings.find(item => item.id === bId);
      if (!b) return;

      showConfirmModal(
        'Cancelar Viagem',
        `Deseja realmente confirmar o cancelamento definitivo da viagem programada de ${b.driverName}?`,
        async () => {
          // Update Booking status
          b.status = 'cancelado';

          // Release car back to disponivel if it was reserved
          const car = vehicles.find(v => v.id === b.vehicleId);
          if (car && car.status === 'uso') {
            car.status = 'disponivel';
          }

          try {
            if (useDjangoApi) {
              await fetchFromDjangoAPI(`bookings/${bId}/`, {
                method: 'PUT',
                body: JSON.stringify(b)
              });
              if (car) {
                await fetchFromDjangoAPI(`vehicles/${car.id}/`, {
                  method: 'PUT',
                  body: JSON.stringify(car)
                });
              }
            }
            showToast('Reserva de viagem cancelada.', 'info');
            saveLocalState();
            renderCurrentView();
          } catch (err) {
            showToast('Cancelado localmente. Sem sincronismo Django.', 'error');
            saveLocalState();
            renderCurrentView();
          }
        }
      );
    });
  });

  if ((window as any).lucide) (window as any).lucide.createIcons();
}

// --- SUB-VIEW: FLEET PANEL ---
function renderFleet() {
  const container = document.getElementById('fleetContainer');
  if (!container) return;

  const query = fleetSearchQuery.toLowerCase().trim();
  const filtered = vehicles.filter(v => {
    const matchesSearch = 
      v.brand.toLowerCase().includes(query) ||
      v.model.toLowerCase().includes(query) ||
      v.plate.toLowerCase().includes(query) ||
      v.color.toLowerCase().includes(query);

    const matchesType = fleetFilterType === 'all' || v.type === fleetFilterType;
    const matchesStatus = fleetFilterStatus === 'all' || v.status === fleetFilterStatus;

    let matchesActive = true;
    if (fleetFilterActive === 'active') {
      matchesActive = v.active !== false;
    } else if (fleetFilterActive === 'inactive') {
      matchesActive = v.active === false;
    }

    return matchesSearch && matchesType && matchesStatus && matchesActive;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="col-span-full bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-slate-400 text-sm">
        <i data-lucide="inbox" class="h-8 w-8 mx-auto text-slate-300 block mb-3"></i>
        Nenhum veículo localizado. Adicione registros de carros.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(v => {
    // Get active/pending booking for this car to add warnings
    const activeB = bookings.find(b => b.vehicleId === v.id && (b.status === 'ativo' || b.status === "pendente"));

    let overlayBadge = '';
    if (v.active === false) {
      overlayBadge = '<span class="bg-amber-500 text-white font-bold text-[9px] uppercase tracking-wider py-1 px-2.5 rounded-full shadow-2xs">Desativado</span>';
    } else if (v.status === 'disponivel') {
      overlayBadge = '<span class="bg-emerald-500 text-white font-bold text-[9px] uppercase tracking-wider py-1 px-2.5 rounded-full shadow-2xs">Disponível</span>';
    } else if (v.status === 'uso') {
      overlayBadge = '<span class="bg-sky-500 text-white font-bold text-[9px] uppercase tracking-wider py-1 px-2.5 rounded-full shadow-2xs">Em Trânsito</span>';
    } else if (v.status === 'canteiro') {
      overlayBadge = `<span class="bg-amber-600 text-white font-bold text-[9px] uppercase tracking-wider py-1 px-2.5 rounded-full shadow-2xs" title="Canteiro: ${v.constructionSite || ''}">Canteiro</span>`;
    } else {
      overlayBadge = '<span class="bg-red-500 text-white font-bold text-[9px] uppercase tracking-wider py-1 px-2.5 rounded-full shadow-2xs font-semibold">Oficina</span>';
    }

    const fuelLabel = v.fuel;
    const vehicleIcon = v.type === 'van' ? 'truck' : 'car';

    return `
      <!-- Vehicle Grid Card -->
      <div id="vehicle_card_${v.id}" class="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between space-y-4">
        <div class="space-y-3.5">
          <!-- Top plate & state indicators -->
          <div class="flex justify-between items-start">
            <span class="bg-slate-900 border text-slate-200 font-mono tracking-wider font-bold text-[10px] px-2 py-0.8 rounded-md uppercase">${v.plate}</span>
            ${overlayBadge}
          </div>

          <!-- Car image/details mockup layout -->
          <div class="rounded-xl bg-slate-50 border p-4 flex items-center justify-between text-slate-700">
            <div>
              <h4 class="font-bold text-sm text-slate-900 leading-tight">${v.brand}</h4>
              <p class="font-semibold text-xs text-slate-500 mt-0.5">${v.model}</p>
            </div>
            <div class="text-slate-400">
              <i data-lucide="${vehicleIcon}" class="h-10 w-10"></i>
            </div>
          </div>

          <!-- Inline statistics odometer, passenger cap, fuel -->
          <div class="grid grid-cols-3 gap-2 text-center border-y py-2.5 border-slate-100">
            <div>
              <span class="text-[9px] text-slate-400 block font-bold uppercase">Quilometragem</span>
              <span class="font-mono text-[11px] font-bold text-slate-700 mt-0.5 block">${v.km.toLocaleString('pt-BR')} KM</span>
            </div>
            <div>
              <span class="text-[9px] text-slate-400 block font-bold uppercase">Combustível</span>
              <span class="text-[11px] font-bold text-slate-700 mt-0.5 block">${fuelLabel}</span>
            </div>
            <div>
              <span class="text-[9px] text-slate-400 block font-bold uppercase">Assentos</span>
              <span class="text-[11px] font-bold text-slate-700 mt-0.5 block">${v.capacity} slots</span>
            </div>
          </div>

          <!-- Notes or active driver warning blocks -->
          ${activeB ? `
            <div class="bg-blue-50/40 p-2.5 rounded-xl border border-blue-100/20 text-[10px] leading-relaxed text-blue-900 flex gap-1.5 items-start">
              <i data-lucide="info" class="h-3.5 w-3.5 text-blue-500 shrink-0 mt-0.5"></i>
              <span>O motorista <strong>${activeB.driverName}</strong> reservou este veículo para: "${activeB.purpose}".</span>
            </div>
          ` : v.status === 'canteiro' ? `
            <div class="bg-amber-50/40 p-2.5 rounded-xl border border-amber-100/25 text-[10px] leading-relaxed text-amber-900 flex gap-1.5 items-start">
              <i data-lucide="building" class="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5"></i>
              <span>Instalado no <strong>${v.constructionSite || 'Canteiro de Obras'}</strong> para uso comum local.</span>
            </div>
          ` : v.notes ? `
            <p class="text-[10px] text-slate-405 leading-relaxed bg-slate-50/50 p-2.5 rounded-xl italic">"${v.notes}"</p>
          ` : ''}
        </div>

        <!-- Custom Action CTAs -->
        <div class="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-1.5 justify-between">
          <div class="flex items-center gap-1.5">
            <button data-edit-id="${v.id}" class="v-edit border border-slate-200 hover:bg-slate-100 p-2 text-slate-550 hover:text-slate-800 rounded-xl transition-all" title="Editar Veículo">
              <i data-lucide="edit" class="h-4 w-4"></i>
            </button>
            <button data-toggle-active-id="${v.id}" class="v-toggle-active border border-slate-200 hover:bg-slate-100 p-2 text-slate-550 hover:text-slate-800 rounded-xl transition-all" title="${v.active === false ? 'Reativar Veículo' : 'Desativar Veículo'}">
              <i data-lucide="${v.active === false ? 'eye' : 'eye-off'}" class="h-4 w-4"></i>
            </button>
            <button data-delete-id="${v.id}" class="v-delete border border-slate-200 hover:bg-rose-50 p-2 text-rose-500 hover:text-rose-700 rounded-xl transition-all" title="Remover Veículo">
              <i data-lucide="trash-2" class="h-4 w-4"></i>
            </button>
          </div>

          <div class="flex items-center gap-1.5">
            <button data-maint-id="${v.id}" class="v-maint border border-slate-205 hover:bg-indigo-50/50 text-slate-600 hover:text-indigo-800 font-semibold text-[11px] px-2.5 py-2 rounded-xl flex items-center gap-1 cursor-pointer transition-colors" title="Lançar Manutenção">
              <i data-lucide="wrench" class="h-3.5 w-3.5"></i> Manutenção
            </button>
            ${v.status === 'disponivel' ? `
              <button data-alloc-canteiro-id="${v.id}" class="bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-bold text-[11px] px-2.5 py-2 rounded-xl flex items-center gap-1 transition-colors" title="Alocar para Canteiro">
                <i data-lucide="building" class="h-3.5 w-3.5"></i> Canteiro
              </button>
              <button data-m-booking-id="${v.id}" class="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] px-3.5 py-2 rounded-xl flex items-center gap-1 transition-all shadow-3xs cursor-pointer">
                Agendar
              </button>
            ` : v.status === 'canteiro' ? `
              <button data-quick-run-id="${v.id}" class="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] px-3 py-2 rounded-xl flex items-center gap-1 transition-all shadow-3xs cursor-pointer" title="Registrar Corrida Interna">
                <i data-lucide="play" class="h-3.5 w-3.5"></i> Corrida Rápida
              </button>
              <button data-free-canteiro-id="${v.id}" class="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold text-[11px] px-2.5 py-2 rounded-xl flex items-center gap-1 cursor-pointer transition-colors" title="Retirar do Canteiro">
                Liberar
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // --- BIND FLEET CARD CTAs ---
  document.querySelectorAll('[data-edit-id]').forEach(el => {
    el.addEventListener('click', () => {
      const vId = el.getAttribute('data-edit-id');
      const v = vehicles.find(item => item.id === vId);
      if (v) {
        vehicleToEdit = v;
        navigateTo('newVehicle');
      }
    });
  });

  document.querySelectorAll('[data-toggle-active-id]').forEach(el => {
    el.addEventListener('click', () => {
      const vId = el.getAttribute('data-toggle-active-id');
      const v = vehicles.find(item => item.id === vId);
      if (v) {
        const action = v.active === false ? 'reativar' : 'desativar';
        showConfirmModal(
          `${v.active === false ? 'Reativar' : 'Desativar'} Veículo`,
          `Deseja realmente ${action} o veículo ${v.brand} ${v.model} [${v.plate}]?`,
          () => {
            v.active = v.active === false ? true : false;
            showToast(`Veículo ${v.brand} ${v.model} [${v.plate}] ${v.active ? 'reativado' : 'desativado'}.`, 'success');
            saveLocalState();
            renderFleet();
          }
        );
      }
    });
  });

  document.querySelectorAll('[data-delete-id]').forEach(el => {
    el.addEventListener('click', () => {
      const vId = el.getAttribute('data-delete-id') || '';
      const v = vehicles.find(item => item.id === vId);
      if (!v) return;

      // Look for active bookings to alert
      const inUseBookings = bookings.some(b => b.vehicleId === vId && (b.status === 'ativo' || b.status === 'pendente'));
      if (inUseBookings) {
        showAlertModal('Aviso de Agendamentos', 'ATENÇÃO: Este veículo possui agendamentos em trânsito ou reservados. Cancele ou conclua os agendamentos antes de excluir.');
        return;
      }

      showConfirmModal(
        'Excluir Veículo',
        `Deseja realmente excluir permanentemente o veículo comercial ${v.brand} ${v.model} (${v.plate})?`,
        async () => {
          vehicles = vehicles.filter(item => item.id !== vId);

          try {
            if (useDjangoApi) {
              await fetchFromDjangoAPI(`vehicles/${vId}/`, {
                method: 'DELETE'
              });
            }
            showToast(`Veículo [${v.plate}] excluído de forma definitiva.`, 'info');
            saveLocalState();
            renderCurrentView();
          } catch (err) {
            showToast('Removido localmente. Sem sincronismo Django.', 'error');
            saveLocalState();
            renderCurrentView();
          }
        }
      );
    });
  });

  // CTA to quickly create maintenance log for a vehicle
  document.querySelectorAll('[data-maint-id]').forEach(el => {
    el.addEventListener('click', () => {
      const vId = el.getAttribute('data-maint-id') || '';
      const v = vehicles.find(item => item.id === vId);
      if (!v) return;

      // Populate Quick modal fields
      document.getElementById('quickMaintVehicleId')!.setAttribute('value', vId);
      document.getElementById('quickMaintCarLabel')!.textContent = `${v.brand} ${v.model} (${v.plate})`;
      
      // Default inputs
      (document.getElementById('quickMaintDesc') as HTMLInputElement).value = '';
      (document.getElementById('quickMaintCost') as HTMLInputElement).value = '150.00';
      (document.getElementById('quickMaintDate') as HTMLInputElement).value = SYSTEM_REFERENCE_DATE.toISOString().split('T')[0];

      // Open Modal
      document.getElementById('modalMaint')!.classList.remove('hidden');
    });
  });

  // Booking deep link
  document.querySelectorAll('[data-m-booking-id]').forEach(el => {
    el.addEventListener('click', () => {
      const vId = el.getAttribute('data-m-booking-id') || '';
      prefilledVehicleId = vId;
      prefilledStartDate = '';
      navigateTo('newBooking');
    });
  });

  // Bind Canteiro Alloc Click
  document.querySelectorAll('[data-alloc-canteiro-id]').forEach(el => {
    el.addEventListener('click', () => {
      const vId = el.getAttribute('data-alloc-canteiro-id') || '';
      const v = vehicles.find(item => item.id === vId);
      if (v) {
        const modal = document.getElementById('modalAllocCanteiro');
        const carLabel = document.getElementById('allocCanteiroCarLabel');
        const kmInput = document.getElementById('allocCanteiroKm') as HTMLInputElement;
        const vIdInput = document.getElementById('allocCanteiroVehicleId') as HTMLInputElement;
        const siteInput = document.getElementById('allocCanteiroSite') as HTMLInputElement;
        const notesInput = document.getElementById('allocCanteiroNotes') as HTMLTextAreaElement;

        if (modal && carLabel && kmInput && vIdInput) {
          vIdInput.value = v.id;
          carLabel.textContent = `${v.brand} ${v.model} (${v.plate})`;
          kmInput.value = String(v.km);
          if (siteInput) siteInput.value = '';
          if (notesInput) notesInput.value = '';
          modal.classList.remove('hidden');
          if ((window as any).lucide) (window as any).lucide.createIcons();
        }
      }
    });
  });

  // Bind Canteiro Free Click
  document.querySelectorAll('[data-free-canteiro-id]').forEach(el => {
    el.addEventListener('click', () => {
      const vId = el.getAttribute('data-free-canteiro-id') || '';
      const v = vehicles.find(item => item.id === vId);
      if (v) {
        showConfirmModal(
          'Liberar do Canteiro',
          `Deseja realmente retirar o veículo comercial ${v.brand} ${v.model} (${v.plate}) do canteiro e reintegrá-lo à frota disponível?`,
          async () => {
            v.status = 'disponivel';
            const siteName = v.constructionSite || 'Canteiro';
            v.constructionSite = undefined;

            try {
              if (useDjangoApi) {
                await fetchFromDjangoAPI(`vehicles/${v.id}/`, {
                  method: 'PUT',
                  body: JSON.stringify(v)
                });
              }
              showToast(`Veículo [${v.plate}] liberado do ${siteName} e reincorporado à frota.`, 'success');
              saveLocalState();
              renderCurrentView();
            } catch (err) {
              showToast('Liberado localmente. Sem sincronismo Django.', 'info');
              saveLocalState();
              renderCurrentView();
            }
          }
        );
      }
    });
  });

  // Bind Canteiro Quick Run Click
  document.querySelectorAll('[data-quick-run-id]').forEach(el => {
    el.addEventListener('click', () => {
      const vId = el.getAttribute('data-quick-run-id') || '';
      const v = vehicles.find(item => item.id === vId);
      if (v) {
        const modal = document.getElementById('modalCanteiroQuickRun');
        const carLabel = document.getElementById('canteiroQuickRunCarLabel');
        const siteLabel = document.getElementById('canteiroQuickRunSiteLabel');
        const vIdInput = document.getElementById('canteiroQuickRunVehicleId') as HTMLInputElement;
        const startKmInput = document.getElementById('canteiroQuickRunStartKm') as HTMLInputElement;
        const endKmInput = document.getElementById('canteiroQuickRunEndKm') as HTMLInputElement;
        const purposeInput = document.getElementById('canteiroQuickRunPurpose') as HTMLInputElement;
        const select = document.getElementById('canteiroQuickRunDriverSelect') as HTMLSelectElement;

        if (modal && carLabel && siteLabel && vIdInput && startKmInput && endKmInput && select) {
          vIdInput.value = v.id;
          carLabel.textContent = `${v.brand} ${v.model} (${v.plate})`;
          siteLabel.textContent = v.constructionSite || 'Uso Coletivo';
          startKmInput.value = String(v.km);
          endKmInput.value = String(v.km + 2); // default end KM slightly higher
          if (purposeInput) purposeInput.value = '';

          // Populate drivers dropdown
          select.innerHTML = '<option value="">-- Selecione o Motorista --</option>' + 
            drivers.filter(d => d.active !== false).map(d => `<option value="${d.id}">${d.name} (CNH ${d.cnh})</option>`).join('');

          modal.classList.remove('hidden');
          if ((window as any).lucide) (window as any).lucide.createIcons();
        }
      }
    });
  });

  if ((window as any).lucide) (window as any).lucide.createIcons();
}

// --- SUB-VIEW: MAINTENANCE TAB PANEL ---
function renderMaintenance() {
  const container = document.getElementById('maintenanceTableBody');
  if (!container) return;

  // Render selection options of maintenance form
  const selectBox = document.getElementById('mFormVehicleId') as HTMLSelectElement;
  if (selectBox) {
    const listOpts = vehicles.map(v => ({ id: v.id, label: `${v.brand} ${v.model} (${v.plate})` }));
    setupSearchableSelect(
      'mFormVehicleDropdownContainer',
      'mFormVehicleId',
      'mFormVehicleOptions',
      'mFormVehicleTrigger',
      'mFormVehicleSelectedText',
      'mFormVehicleSearch',
      listOpts,
      'Selecione o veículo...'
    );
  }

  // Populate vehicle filter dropdown as well
  const filterVehicleSelect = document.getElementById('mFilterVehicleId') as HTMLSelectElement;
  if (filterVehicleSelect) {
    const listOpts = [
      { id: '', label: 'Todos os veículos' },
      ...vehicles.map(v => ({ id: v.id, label: `${v.brand} ${v.model} (${v.plate})` }))
    ];
    setupSearchableSelect(
      'mFilterVehicleDropdownContainer',
      'mFilterVehicleId',
      'mFilterVehicleOptions',
      'mFilterVehicleTrigger',
      'mFilterVehicleSelectedText',
      'mFilterVehicleSearch',
      listOpts,
      'Todos os veículos'
    );
  }

  // Get current active filter values
  const filterStartDateInput = document.getElementById('mFilterStartDate') as HTMLInputElement;
  const filterEndDateInput = document.getElementById('mFilterEndDate') as HTMLInputElement;

  const filterVehicleId = filterVehicleSelect ? filterVehicleSelect.value : '';
  const filterStartDate = filterStartDateInput ? filterStartDateInput.value : '';
  const filterEndDate = filterEndDateInput ? filterEndDateInput.value : '';

  // Filter the list
  let filteredMaintenances = [...maintenances];
  if (filterVehicleId) {
    filteredMaintenances = filteredMaintenances.filter(m => m.vehicleId === filterVehicleId);
  }
  if (filterStartDate) {
    filteredMaintenances = filteredMaintenances.filter(m => m.date >= filterStartDate);
  }
  if (filterEndDate) {
    filteredMaintenances = filteredMaintenances.filter(m => m.date <= filterEndDate);
  }

  // Cost totalizer indicator updater (using ONLY filtered list!)
  const spentSum = filteredMaintenances.reduce((acc, curr) => acc + Number(curr.cost), 0);
  const totalValElement = document.getElementById('mTotalExpensesLabel');
  if (totalValElement) {
    totalValElement.textContent = spentSum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  if (filteredMaintenances.length === 0) {
    container.innerHTML = `
      <tr>
        <td colspan="7" class="p-8 text-center text-slate-400">
          Nenhum registro de manutenção encontrado para os filtros selecionados.
        </td>
      </tr>
    `;
  } else {
    container.innerHTML = filteredMaintenances.map(m => {
    const car = vehicles.find(v => v.id === m.vehicleId);
    const carLabel = car ? `${car.brand} (${car.plate})` : 'Desconhecido';

    const statusBadge = m.status === 'concluido' 
      ? '<span class="bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded uppercase text-[8px] border border-emerald-250">Concluído</span>'
      : '<span class="bg-amber-50 text-amber-700 font-bold px-1.5 py-0.5 rounded uppercase text-[8px] border border-amber-250 animate-pulse">Agendado</span>';

    const completeBtn = m.status === 'agendado' 
      ? `<button data-m-complete-id="${m.id}" class="bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 text-[10px] font-bold px-1.5 py-0.8 rounded-lg cursor-pointer transition-colors animate-none" title="Marcar como Completo">Finalizar</button>`
      : '';

    const editBtn = `<button data-m-edit-id="${m.id}" class="text-blue-600 hover:text-blue-800 p-1.5 rounded-lg border border-slate-200 hover:bg-blue-50/55 transition-colors animate-none" title="Editar Registro"><i data-lucide="edit-3" class="h-3.5 w-3.5 animate-none"></i></button>`;

    const deleteBtn = `<button data-m-delete-id="${m.id}" class="text-rose-500 hover:text-rose-750 p-1.5 rounded-lg border border-slate-200 hover:bg-rose-50/55 transition-colors animate-none" title="Deletar Registro"><i data-lucide="trash-2" class="h-3.5 w-3.5 animate-none"></i></button>`;

    const actionBtn = `
      <div class="flex items-center justify-center gap-1.5">
        ${completeBtn}
        ${editBtn}
        ${deleteBtn}
      </div>
    `;

    return `
      <!-- Table entry -->
      <tr class="hover:bg-slate-50/65 text-slate-700 font-medium">
        <td class="px-4 py-3.5 font-bold text-slate-900 border-b border-slate-100">${carLabel}</td>
        <td class="px-4 py-3.5 border-b border-slate-100">
          <div>${m.description}</div>
          ${m.notes ? `<div class="text-[10px] text-slate-400 font-light italic mt-0.5">"${m.notes}"</div>` : ''}
        </td>
        <td class="px-3 py-3.5 capitalize border-b border-slate-100"><span class="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-[9px] font-semibold text-slate-600">${m.type}</span></td>
        <td class="px-3 py-3.5 font-mono font-semibold text-right text-rose-650 border-b border-slate-100">${m.cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td>
        <td class="px-3 py-3.5 font-mono text-slate-500 border-b border-slate-100">${formatDateShort(m.date)}</td>
        <td class="px-3 py-3.5 border-b border-slate-100">${statusBadge}</td>
        <td class="px-4 py-3.5 border-b border-slate-100 text-center">${actionBtn}</td>
      </tr>
    `;
  }).join('');
  }

  // Handle Maintenance Form state (Add vs. Edit)
  if (maintenanceToEdit) {
    (document.getElementById('mFormVehicleId') as HTMLSelectElement).value = maintenanceToEdit.vehicleId;
    (document.getElementById('mFormDescription') as HTMLInputElement).value = maintenanceToEdit.description;
    (document.getElementById('mFormCost') as HTMLInputElement).value = String(maintenanceToEdit.cost);
    (document.getElementById('mFormDate') as HTMLInputElement).value = maintenanceToEdit.date;
    (document.getElementById('mFormType') as HTMLSelectElement).value = maintenanceToEdit.type;
    (document.getElementById('mFormStatus') as HTMLSelectElement).value = maintenanceToEdit.status;
    (document.getElementById('mFormNotes') as HTMLTextAreaElement).value = maintenanceToEdit.notes || '';

    const titleEl = document.getElementById('mFormTitle');
    const subtitleEl = document.getElementById('mFormSubtitle');
    const submitBtn = document.getElementById('mFormSubmitBtn');
    const cancelBtn = document.getElementById('mFormCancelBtn');

    if (titleEl) titleEl.textContent = 'Editar Registro de Manutenção';
    if (subtitleEl) subtitleEl.textContent = 'Alterando os dados da ordem de serviço ou manutenção.';
    if (submitBtn) submitBtn.textContent = 'Salvar Alterações';
    if (cancelBtn) cancelBtn.classList.remove('hidden');
  } else {
    const titleEl = document.getElementById('mFormTitle');
    const subtitleEl = document.getElementById('mFormSubtitle');
    const submitBtn = document.getElementById('mFormSubmitBtn');
    const cancelBtn = document.getElementById('mFormCancelBtn');

    if (titleEl) titleEl.textContent = 'Lançar Registro de Manutenção';
    if (subtitleEl) subtitleEl.textContent = 'Guarde o histórico de despesas e reparos da frota.';
    if (submitBtn) submitBtn.textContent = 'Gravar Registro';
    if (cancelBtn) cancelBtn.classList.add('hidden');

    const dateInput = document.getElementById('mFormDate') as HTMLInputElement;
    if (dateInput) {
      dateInput.value = SYSTEM_REFERENCE_DATE.toISOString().split('T')[0];
    }
  }

  // --- BIND TABLE BUTTON ACTIVITIES ---
  document.querySelectorAll('[data-m-complete-id]').forEach(el => {
    el.addEventListener('click', async () => {
      const mId = el.getAttribute('data-m-complete-id');
      const record = maintenances.find(item => item.id === mId);
      if (!record) return;

      record.status = 'concluido';

      if (record.type === 'preventiva') {
        autoUpdateVehiclePreventive(record.vehicleId, record.date);
      }

      // Restore vehicle to disponivel status if it was in maintenance
      const car = vehicles.find(v => v.id === record.vehicleId);
      if (car && car.status === 'manutencao') {
        car.status = 'disponivel';
      }

      try {
        if (useDjangoApi) {
          await fetchFromDjangoAPI(`maintenance/${mId}/`, {
            method: 'PUT',
            body: JSON.stringify(record)
          });
          if (car) {
            await fetchFromDjangoAPI(`vehicles/${car.id}/`, {
              method: 'PUT',
              body: JSON.stringify(car)
            });
          }
        }
        showToast('Manutenção marcada como encerrada.', 'success');
        saveLocalState();
        renderCurrentView();
      } catch (err) {
        showToast('Encerramento local efetuado.', 'info');
        saveLocalState();
        renderCurrentView();
      }
    });
  });

  document.querySelectorAll('[data-m-delete-id]').forEach(el => {
    el.addEventListener('click', () => {
      const mId = el.getAttribute('data-m-delete-id') || '';
      showConfirmModal(
        'Excluir Manutenção',
        'Deseja realmente excluir este histórico fiscal de manutenção?',
        async () => {
          maintenances = maintenances.filter(item => item.id !== mId);

          try {
            if (useDjangoApi) {
              await fetchFromDjangoAPI(`maintenance/${mId}/`, {
                method: 'DELETE'
              });
            }
            showToast('Histórico fiscal de manutenção removido.', 'info');
            saveLocalState();
            renderCurrentView();
          } catch (err) {
            showToast('Histórico removido localmente.', 'info');
            saveLocalState();
            renderCurrentView();
          }
        }
      );
    });
  });

  // --- BIND EDIT AND CANCEL ACTIVITIES ---
  document.querySelectorAll('[data-m-edit-id]').forEach(el => {
    el.addEventListener('click', () => {
      const mId = el.getAttribute('data-m-edit-id');
      const record = maintenances.find(item => item.id === mId);
      if (record) {
        maintenanceToEdit = record;
        renderMaintenance();
        // Rolar suavemente até o topo do formulário
        document.getElementById('formMaintenance')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });

  const mCancelBtn = document.getElementById('mFormCancelBtn');
  if (mCancelBtn) {
    mCancelBtn.onclick = (e) => {
      e.preventDefault();
      maintenanceToEdit = null;
      
      // Limpar formulário de manutenção
      (document.getElementById('mFormVehicleId') as HTMLSelectElement).value = '';
      (document.getElementById('mFormDescription') as HTMLInputElement).value = '';
      (document.getElementById('mFormCost') as HTMLInputElement).value = '';
      (document.getElementById('mFormDate') as HTMLInputElement).value = SYSTEM_REFERENCE_DATE.toISOString().split('T')[0];
      (document.getElementById('mFormType') as HTMLSelectElement).value = 'preventiva';
      (document.getElementById('mFormStatus') as HTMLSelectElement).value = 'concluido';
      (document.getElementById('mFormNotes') as HTMLTextAreaElement).value = '';
      
      renderMaintenance();
    };
  }

  if ((window as any).lucide) (window as any).lucide.createIcons();
}

// --- SUB-VIEW: BOOKING CREATE FORM ---
function renderNewBookingForm() {
  const selectBox = document.getElementById('nbVehicleId') as HTMLSelectElement;
  if (!selectBox) return;

  // Load vehicles lists
  const listOpts = vehicles.filter(v => v.active !== false).map(v => ({
    id: v.id,
    label: `${getVehicleTypeLabel(v.type)}: ${v.brand} ${v.model} (${v.plate})`
  }));

  // Force prefilled selected value if present
  if (prefilledVehicleId) {
    selectBox.value = prefilledVehicleId;
  }

  setupSearchableSelect(
    'nbVehicleDropdownContainer',
    'nbVehicleId',
    'nbVehicleOptions',
    'nbVehicleTrigger',
    'nbVehicleSelectedText',
    'nbVehicleSearch',
    listOpts,
    'Selecione um carro da frota...'
  );

  // Handle default preset datetimes: today 09:00, dev-ending today 17:00
  const inputStartDate = document.getElementById('nbStartDate') as HTMLInputElement;
  const inputEndDate = document.getElementById('nbEndDate') as HTMLInputElement;

  if (inputStartDate && inputEndDate) {
    if (prefilledStartDate) {
      inputStartDate.value = prefilledStartDate;
      
      const parts = prefilledStartDate.split('T');
      inputEndDate.value = `${parts[0]}T18:00`;
    } else {
      const targetDay = SYSTEM_REFERENCE_DATE.toISOString().split('T')[0];
      inputStartDate.value = `${targetDay}T09:00`;
      inputEndDate.value = `${targetDay}T17:00`;
    }
  }

  // Clear helper inputs
  (document.getElementById('nbPurpose') as HTMLInputElement).value = '';
  (document.getElementById('nbDriverName') as HTMLInputElement).value = '';
  (document.getElementById('nbDriverCpf') as HTMLInputElement).value = '';
  (document.getElementById('nbDriverCnh') as HTMLInputElement).value = '';
  (document.getElementById('nbNotes') as HTMLTextAreaElement).value = '';

  const quickSelect = document.getElementById('nbQuickDriverSelect') as HTMLSelectElement;
  if (quickSelect) {
    quickSelect.innerHTML = '<option value="">-- Selecione para preencher automaticamente --</option>';
    drivers.filter(d => d.active !== false).forEach(d => {
      const option = document.createElement('option');
      option.value = d.id;
      option.textContent = `${d.name} (${d.cnh})`;
      quickSelect.appendChild(option);
    });
  }

  // Trigger real-time checking validation logs
  nbCheckOverlapAvailability();
}

function nbCheckOverlapAvailability() {
  const vehicleId = (document.getElementById('nbVehicleId') as HTMLSelectElement).value;
  const startDateStr = (document.getElementById('nbStartDate') as HTMLInputElement).value;
  const endDateStr = (document.getElementById('nbEndDate') as HTMLInputElement).value;

  const alertContainer = document.getElementById('nbConflictAlert');
  const submitBtn = document.getElementById('nbSubmitBtn') as HTMLButtonElement;

  if (!alertContainer || !submitBtn) return;

  if (!vehicleId || !startDateStr || !endDateStr) {
    alertContainer.className = 'hidden';
    submitBtn.disabled = true;
    return;
  }

  const startMs = new Date(startDateStr).getTime();
  const endMs = new Date(endDateStr).getTime();

  if (endMs <= startMs) {
    alertContainer.className = 'bg-red-50 text-red-900 border-red-200 border p-4 rounded-xl block text-xs';
    alertContainer.innerHTML = '<strong>Data de Devolução Inválida:</strong> O horário de retorno de uso deve ser superior ao de saída.';
    submitBtn.disabled = true;
    return;
  }

  // Check if vehicle is in maintenance status right now
  const matchedCar = vehicles.find(v => v.id === vehicleId);
  if (matchedCar && matchedCar.status === 'manutencao') {
    alertContainer.className = 'bg-rose-50 text-rose-900 border-rose-200 border p-4 rounded-xl block text-xs';
    alertContainer.innerHTML = `🚨 <strong>Impedido:</strong> O carro <strong>${matchedCar.brand} ${matchedCar.model}</strong> está atualmente em manutenção técnica e não pode ser agendado.`;
    submitBtn.disabled = true;
    return;
  }

  // Real overlap check with helper algorithm in utils
  const conflict = checkBookingConflict(vehicleId, startDateStr, endDateStr, bookings);

  if (conflict) {
    alertContainer.className = 'bg-amber-50 text-amber-900 border-amber-250 border p-4 rounded-xl block text-xs';
    alertContainer.innerHTML = `
      <div class="font-bold text-amber-700 mb-1 flex items-center gap-1.5 uppercase tracking-wide">
        <i data-lucide="alert-triangle" class="h-4.5 w-4.5"></i> Conflito de Agenda Identificado!
      </div>
      <p class="mb-1">Este utilitário já está pré-reservado por <strong>${conflict.driverName}</strong> para "${conflict.purpose}".</p>
      <span class="bg-white/80 border py-0.5 px-1.5 rounded text-[10px] font-mono font-semibold">Reservado de ${formatDateTime(conflict.startDate)} até ${formatDateTime(conflict.endDate)}</span>
    `;
    submitBtn.disabled = true;
  } else {
    alertContainer.className = 'bg-emerald-50 text-emerald-800 border-emerald-200 border p-3.5 rounded-xl block text-xs';
    alertContainer.innerHTML = `
      <div class="font-bold text-emerald-650 flex items-center gap-1.5">
        <i data-lucide="check-circle" class="h-4.5 w-4.5"></i> Horário Disponível para Reserva!
      </div>
      <span class="text-[11px] block mt-0.5 text-emerald-700">O veículo está livre para novos agendamentos neste bloco de datas selecionado.</span>
    `;
    submitBtn.disabled = false;
  }

  if ((window as any).lucide) (window as any).lucide.createIcons();
}

// --- SUB-VIEW: VEHICLE CADASTRE FORM ---
function renderNewVehicleForm() {
  const formHeader = document.getElementById('vehicleFormHeader');
  if (formHeader) {
    formHeader.textContent = vehicleToEdit ? `Editar Veículo: ${vehicleToEdit.plate}` : 'Cadastrar Novo Veículo';
  }

  if (vehicleToEdit) {
    (document.getElementById('nvVehicleId') as HTMLInputElement).value = vehicleToEdit.id;
    (document.getElementById('nvBrand') as HTMLInputElement).value = vehicleToEdit.brand;
    (document.getElementById('nvModel') as HTMLInputElement).value = vehicleToEdit.model;
    (document.getElementById('nvPlate') as HTMLInputElement).value = vehicleToEdit.plate;
    (document.getElementById('nvYear') as HTMLInputElement).value = String(vehicleToEdit.year);
    (document.getElementById('nvType') as HTMLSelectElement).value = vehicleToEdit.type;
    (document.getElementById('nvFuel') as HTMLSelectElement).value = vehicleToEdit.fuel;
    (document.getElementById('nvKm') as HTMLInputElement).value = String(vehicleToEdit.km);
    (document.getElementById('nvCapacity') as HTMLInputElement).value = String(vehicleToEdit.capacity);
    (document.getElementById('nvColor') as HTMLInputElement).value = vehicleToEdit.color;
    (document.getElementById('nvNotes') as HTMLTextAreaElement).value = vehicleToEdit.notes || '';
    (document.getElementById('nvNextPreventiveDate') as HTMLInputElement).value = vehicleToEdit.nextPreventiveDate || '';
    (document.getElementById('nvPreventivePeriodMonth') as HTMLInputElement).value = vehicleToEdit.preventivePeriodMonth ? String(vehicleToEdit.preventivePeriodMonth) : '';
    (document.getElementById('nvActive') as HTMLInputElement).checked = vehicleToEdit.active !== false;
  } else {
    // Clear form inputs
    (document.getElementById('nvVehicleId') as HTMLInputElement).value = '';
    (document.getElementById('nvBrand') as HTMLInputElement).value = '';
    (document.getElementById('nvModel') as HTMLInputElement).value = '';
    (document.getElementById('nvPlate') as HTMLInputElement).value = '';
    (document.getElementById('nvYear') as HTMLInputElement).value = '2024';
    (document.getElementById('nvType') as HTMLSelectElement).value = 'sedan';
    (document.getElementById('nvFuel') as HTMLSelectElement).value = 'Flex';
    (document.getElementById('nvKm') as HTMLInputElement).value = '10000';
    (document.getElementById('nvCapacity') as HTMLInputElement).value = '5';
    (document.getElementById('nvColor') as HTMLInputElement).value = '';
    (document.getElementById('nvNotes') as HTMLTextAreaElement).value = '';
    (document.getElementById('nvNextPreventiveDate') as HTMLInputElement).value = '';
    (document.getElementById('nvPreventivePeriodMonth') as HTMLInputElement).value = '';
    (document.getElementById('nvActive') as HTMLInputElement).checked = true;
  }
}

function getDriverCnhStatus(expiryDateStr: string) {
  const expiry = new Date(expiryDateStr + 'T12:00:00');
  const ref = new Date(SYSTEM_REFERENCE_DATE);
  ref.setHours(12, 0, 0, 0);
  
  if (expiry.getTime() < ref.getTime()) {
    return 'Vencida';
  }
  
  const thirtyDaysLater = new Date(ref);
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
  
  if (expiry.getTime() <= thirtyDaysLater.getTime()) {
    return 'Vencendo em breve';
  }
  
  return 'Regular';
}

function renderDrivers() {
  const countTotalEl = document.getElementById('driversCountTotal');
  const countActiveEl = document.getElementById('driversCountActive');
  const countExpiringEl = document.getElementById('driversCountExpiring');
  const countExpiredEl = document.getElementById('driversCountExpired');

  let total = drivers.length;
  let expiringSoon = 0;
  let expired = 0;

  drivers.forEach(d => {
    const isDeactivated = d.active === false;
    const expiry = new Date(d.cnhExpiry + 'T12:00:00');
    const ref = new Date(SYSTEM_REFERENCE_DATE);
    ref.setHours(12, 0, 0, 0);
    
    if (expiry.getTime() < ref.getTime()) {
      expired++;
    } else {
      const thirtyDaysLater = new Date(ref);
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
      if (expiry.getTime() <= thirtyDaysLater.getTime()) {
        expiringSoon++;
      }
    }
  });

  const activeRegular = drivers.filter(d => {
    const isDeactivated = d.active === false;
    const status = getDriverCnhStatus(d.cnhExpiry);
    return !isDeactivated && status === 'Regular';
  }).length;
  
  if (countTotalEl) countTotalEl.textContent = String(total);
  if (countActiveEl) countActiveEl.textContent = String(activeRegular);
  if (countExpiringEl) countExpiringEl.textContent = String(expiringSoon);
  if (countExpiredEl) countExpiredEl.textContent = String(expired);

  const tbody = document.getElementById('driversTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const filtered = drivers.filter(d => {
    const query = driversSearchQuery.toLowerCase().trim();
    let matchesSearch = true;
    if (query) {
      matchesSearch = d.name.toLowerCase().includes(query) || 
                      d.cpf.replace(/[^a-zA-Z0-9]/g, '').includes(query) ||
                      d.cpf.includes(query) ||
                      d.cnh.includes(query);
    }

    let matchesActive = true;
    if (driversFilterActive === 'active') {
      matchesActive = d.active !== false;
    } else if (driversFilterActive === 'inactive') {
      matchesActive = d.active === false;
    }

    return matchesSearch && matchesActive;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="p-6 text-center text-slate-400 font-medium">Nenhum motorista encontrado.</td>
      </tr>
    `;
    return;
  }

  filtered.forEach(d => {
    const isDeactivated = d.active === false;
    const cnhStatus = getDriverCnhStatus(d.cnhExpiry);
    
    let statusClass = 'bg-slate-100 text-slate-700';
    let statusText = 'Inativo';
    
    if (!isDeactivated) {
      if (cnhStatus === 'Vencida') {
        statusClass = 'bg-rose-50 text-rose-700 border border-rose-150';
        statusText = 'CNH Vencida';
      } else if (cnhStatus === 'Vencendo em breve') {
        statusClass = 'bg-amber-50 text-amber-700 border border-amber-150';
        statusText = 'Vencendo CNH (30d)';
      } else {
        statusClass = 'bg-emerald-50 text-emerald-700 border border-emerald-150';
        statusText = 'Ativo / Regular';
      }
    } else {
      statusClass = 'bg-slate-100 text-slate-400 border border-slate-200 line-through';
      statusText = 'Desativado';
    }

    const tr = document.createElement('tr');
    tr.className = 'hover:bg-slate-50/40 transition-colors';
    tr.innerHTML = `
      <td class="p-3.5 font-semibold text-slate-800">
        <div class="flex items-center gap-2">
          <span>${d.name}</span>
          ${isDeactivated ? '<span class="bg-red-50 text-red-600 text-[9px] font-bold px-1 rounded">DESATIVADO</span>' : ''}
        </div>
      </td>
      <td class="p-3.5 font-mono text-slate-500">${maskCPF(d.cpf)}</td>
      <td class="p-3.5 font-mono text-slate-500">${d.cnh}</td>
      <td class="p-3.5">${formatDateShort(d.cnhExpiry)}</td>
      <td class="p-3.5">
        <span class="inline-flex px-2 py-1 rounded-full text-[10px] font-bold ${statusClass}">${statusText}</span>
      </td>
      <td class="p-3.5 text-right space-x-1.5 whitespace-nowrap">
        <button data-driver-edit-id="${d.id}" class="bg-white border border-slate-200 text-slate-600 font-bold text-[10px] px-2 py-1 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors" title="Editar dados">Editar</button>
        <button data-driver-toggle-id="${d.id}" class="bg-white border text-[10px] font-bold px-2 py-1 rounded-lg cursor-pointer transition-colors ${isDeactivated ? 'border-emerald-200 text-emerald-600 hover:bg-emerald-50' : 'border-rose-200 text-rose-600 hover:bg-rose-50'}" title="${isDeactivated ? 'Ativar' : 'Desativar'}">
          ${isDeactivated ? 'Reativar' : 'Desativar'}
        </button>
        <button data-driver-delete-id="${d.id}" class="bg-white border border-rose-200 text-rose-500 hover:text-rose-700 hover:bg-rose-50 text-[10px] font-bold px-2 py-1 rounded-lg cursor-pointer transition-colors" title="Excluir motorista">Excluir</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-driver-edit-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-driver-edit-id');
      const found = drivers.find(d => d.id === id);
      if (found) {
        driverToEdit = found;
        navigateTo('newDriver');
      }
    });
  });

  tbody.querySelectorAll('[data-driver-toggle-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-driver-toggle-id');
      const found = drivers.find(d => d.id === id);
      if (found) {
        const action = found.active === false ? 'reativar' : 'desativar';
        showConfirmModal(
          `${found.active === false ? 'Reativar' : 'Desativar'} Motorista`,
          `Deseja realmente ${action} o motorista ${found.name}?`,
          () => {
            found.active = found.active === false ? true : false;
            showToast(`Motorista ${found.name} ${found.active ? 'reativado' : 'desativado'}.`, 'success');
            saveLocalState();
            renderDrivers();
          }
        );
      }
    });
  });

  tbody.querySelectorAll('[data-driver-delete-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-driver-delete-id');
      const found = drivers.find(d => d.id === id);
      if (found) {
        // Look for active bookings to alert
        const inUseBookings = bookings.some(b => b.driverName === found.name && (b.status === 'ativo' || b.status === "pendente"));
        if (inUseBookings) {
          showAlertModal('Aviso de Agendamentos', 'ATENÇÃO: Este motorista possui agendamentos em trânsito ou reservados. Cancele ou conclua os agendamentos antes de excluir.');
          return;
        }

        showConfirmModal(
          'Excluir Motorista',
          `Deseja realmente excluir permanentemente o motorista ${found.name}?`,
          () => {
            drivers = drivers.filter(d => d.id !== id);

            try {
              if (useDjangoApi) {
                fetchFromDjangoAPI(`drivers/${id}/`, {
                  method: 'DELETE'
                });
              }
              showToast(`Motorista [${found.name}] excluído de forma definitiva.`, 'info');
              saveLocalState();
              renderDrivers();
            } catch (err) {
              showToast('Removido localmente. Sem sincronismo Django.', 'error');
              saveLocalState();
              renderDrivers();
            }
          }
        );
      }
    });
  });
}

function renderNewDriverForm() {
  const formHeader = document.getElementById('driverFormHeader');
  if (formHeader) {
    formHeader.textContent = driverToEdit ? `Editar Motorista: ${driverToEdit.name}` : 'Cadastrar Motorista';
  }

  if (driverToEdit) {
    (document.getElementById('ndDriverId') as HTMLInputElement).value = driverToEdit.id;
    (document.getElementById('ndName') as HTMLInputElement).value = driverToEdit.name;
    (document.getElementById('ndCpf') as HTMLInputElement).value = driverToEdit.cpf;
    (document.getElementById('ndCnh') as HTMLInputElement).value = driverToEdit.cnh;
    (document.getElementById('ndCnhExpiry') as HTMLInputElement).value = driverToEdit.cnhExpiry;
    (document.getElementById('ndActive') as HTMLInputElement).checked = driverToEdit.active !== false;
  } else {
    (document.getElementById('ndDriverId') as HTMLInputElement).value = '';
    (document.getElementById('ndName') as HTMLInputElement).value = '';
    (document.getElementById('ndCpf') as HTMLInputElement).value = '';
    (document.getElementById('ndCnh') as HTMLInputElement).value = '';
    (document.getElementById('ndCnhExpiry') as HTMLInputElement).value = '';
    (document.getElementById('ndActive') as HTMLInputElement).checked = true;
  }
}

// --- APP INITIALIZATION & MASTER EVENT BINDINGS ---
document.addEventListener('DOMContentLoaded', () => {
  // 1. Setup Time and System Reference Date
  initSystemClock();

  // 2. Load Local Sync Cash or Start Sync
  loadLocalState();
  updateDjangoBadge(false);

  // 3. Tab Routing triggers
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = btn.getAttribute('data-tab') as AppTab;
      navigateTo(tabName);
    });
  });

  // Mobile menu toggle
  document.getElementById('mobileNavToggle')!.onclick = (e) => {
    e.stopPropagation();
    const nav = document.getElementById('sidebarNav');
    if (nav) nav.classList.toggle('hidden');
  };

  // Close notification banner
  const closeNotice = document.getElementById('closeGlobalNotification');
  if (closeNotice) {
    closeNotice.onclick = () => hideGlobalNotification();
  }

  // Bind Confirm and Alert Modal actions
  const btnConfirmCancel = document.getElementById('btnConfirmCancel');
  const btnConfirmOk = document.getElementById('btnConfirmOk');
  const modalConfirm = document.getElementById('modalConfirm');
  const btnAlertOk = document.getElementById('btnAlertOk');
  const modalAlert = document.getElementById('modalAlert');

  if (btnConfirmCancel && modalConfirm) {
    btnConfirmCancel.addEventListener('click', () => {
      modalConfirm.classList.add('hidden');
      confirmModalCallback = null;
    });
  }

  if (btnConfirmOk && modalConfirm) {
    btnConfirmOk.addEventListener('click', () => {
      modalConfirm.classList.add('hidden');
      if (confirmModalCallback) {
        confirmModalCallback();
        confirmModalCallback = null;
      }
    });
  }

  if (btnAlertOk && modalAlert) {
    btnAlertOk.addEventListener('click', () => {
      modalAlert.classList.add('hidden');
    });
  }

  // --- FORM SUBMIT HANDLERS ---

  // Canteiro Allocation Form Submit
  const allocFormEl = document.getElementById('allocCanteiroForm');
  if (allocFormEl) {
    allocFormEl.onsubmit = async (e) => {
      e.preventDefault();
      const vId = (document.getElementById('allocCanteiroVehicleId') as HTMLInputElement).value;
      const siteName = (document.getElementById('allocCanteiroSite') as HTMLInputElement).value.trim();
      const notes = (document.getElementById('allocCanteiroNotes') as HTMLInputElement).value.trim();

      const car = vehicles.find(v => v.id === vId);
      if (!car) return;

      car.status = 'canteiro';
      car.constructionSite = siteName;
      if (notes) {
        car.notes = notes;
      }

      try {
        if (useDjangoApi) {
          await fetchFromDjangoAPI(`vehicles/${car.id}/`, {
            method: 'PUT',
            body: JSON.stringify(car)
          });
        }
        showToast(`Veículo [${car.plate}] alocado no canteiro "${siteName}" com sucesso.`, 'success');
        saveLocalState();
        document.getElementById('modalAllocCanteiro')!.classList.add('hidden');
        renderCurrentView();
      } catch (err) {
        showToast('Alocado localmente. Erro no sincronismo Django.', 'error');
        saveLocalState();
        document.getElementById('modalAllocCanteiro')!.classList.add('hidden');
        renderCurrentView();
      }
    };
  }

  // Canteiro Quick Run Form Submit
  const quickRunFormEl = document.getElementById('canteiroQuickRunForm');
  if (quickRunFormEl) {
    quickRunFormEl.onsubmit = async (e) => {
      e.preventDefault();
      const vId = (document.getElementById('canteiroQuickRunVehicleId') as HTMLInputElement).value;
      const driverId = (document.getElementById('canteiroQuickRunDriverSelect') as HTMLSelectElement).value;
      const startKm = Number((document.getElementById('canteiroQuickRunStartKm') as HTMLInputElement).value);
      const endKm = Number((document.getElementById('canteiroQuickRunEndKm') as HTMLInputElement).value);
      const purposeInput = (document.getElementById('canteiroQuickRunPurpose') as HTMLInputElement).value.trim();

      const car = vehicles.find(v => v.id === vId);
      if (!car) return;

      const driverObj = drivers.find(d => d.id === driverId);
      if (!driverObj) {
        showAlertModal('Motorista Requerido', 'Por favor, selecione o motorista.');
        return;
      }

      if (endKm <= startKm) {
        showAlertModal('Quilometragem Inválida', `Por favor insira um valor superior à quilometragem de saída (${startKm} KM).`);
        return;
      }

      // Update vehicle KM
      car.km = endKm;

      // Create completed booking for the logs of canteiro
      const bookingId = `b_${Date.now()}`;
      const newBooking: Booking = {
        id: bookingId,
        vehicleId: car.id,
        driverName: driverObj.name,
        driverCpf: driverObj.cpf,
        driverCnh: driverObj.cnh,
        driverCnhCategory: driverObj.cnhCategory || 'B',
        purpose: purposeInput || `Uso no canteiro - ${car.constructionSite || 'Uso Coletivo'}`,
        startDate: SYSTEM_REFERENCE_DATE.toISOString().split('.')[0],
        endDate: SYSTEM_REFERENCE_DATE.toISOString().split('.')[0],
        status: 'concluido',
        notes: `Uso local simplificado no canteiro de obras.`,
        actualStartKm: startKm,
        actualEndKm: endKm,
        actualStartDate: SYSTEM_REFERENCE_DATE.toISOString().split('.')[0],
        actualEndDate: SYSTEM_REFERENCE_DATE.toISOString().split('.')[0],
        createdAt: SYSTEM_REFERENCE_DATE.toISOString().split('.')[0]
      };

      bookings = [newBooking, ...bookings];

      try {
        if (useDjangoApi) {
          await Promise.all([
            fetchFromDjangoAPI(`bookings/`, {
              method: 'POST',
              body: JSON.stringify(newBooking)
            }),
            fetchFromDjangoAPI(`vehicles/${car.id}/`, {
              method: 'PUT',
              body: JSON.stringify(car)
            })
          ]);
        }
        showToast(`Corrida rápida de ${driverObj.name} registrada. Veículo atualizado para ${endKm} KM.`, 'success');
        saveLocalState();
        document.getElementById('modalCanteiroQuickRun')!.classList.add('hidden');
        renderCurrentView();
      } catch (err) {
        showToast('Salvo localmente. Erro no sincronismo Django.', 'error');
        saveLocalState();
        document.getElementById('modalCanteiroQuickRun')!.classList.add('hidden');
        renderCurrentView();
      }
    };
  }

  // A. Start trip form submission
  document.getElementById('formStartTrip')!.onsubmit = async (e) => {
    e.preventDefault();
    const bId = (document.getElementById('startTripBookingId') as HTMLInputElement).value;
    const kmStr = (document.getElementById('startTripKm') as HTMLInputElement).value;
    const kmNum = Number(kmStr);

    const b = bookings.find(item => item.id === bId);
    if (!b) return;

    const car = vehicles.find(v => v.id === b.vehicleId);
    if (car && kmNum < car.km) {
      showAlertModal('Quilometragem Inválida', `Impossível: A quilometragem inicial (${kmNum} KM) não pode ser menor que a da última devolução do veículo (${car.km} KM).`);
      return;
    }

    // Update state variables
    b.status = 'ativo';
    b.actualStartKm = kmNum;
    b.actualStartDate = SYSTEM_REFERENCE_DATE.toISOString().split('.')[0]; // Format clean string ISO

    if (car) {
      car.status = 'uso';
      car.km = kmNum; // Align starting distance
    }

    // Attempt Django execution
    try {
      if (useDjangoApi) {
        await Promise.all([
          fetchFromDjangoAPI(`bookings/${bId}/`, {
            method: 'PUT',
            body: JSON.stringify(b)
          }),
          fetchFromDjangoAPI(`vehicles/${car!.id}/`, {
            method: 'PUT',
            body: JSON.stringify(car)
          })
        ]);
      }
      showToast('Saída do veículo autorizada com sucesso!', 'success');
    } catch (err) {
      showToast('Saída salva off-line (Local Storage).', 'info');
    }

    saveLocalState();
    document.getElementById('modalStartTrip')!.classList.add('hidden');
    renderCurrentView();
  };

  // B. Complete/finish trip form submission
  document.getElementById('formFinishTrip')!.onsubmit = async (e) => {
    e.preventDefault();
    const bId = (document.getElementById('finishTripBookingId') as HTMLInputElement).value;
    const startKm = Number((document.getElementById('finishTripBaseKm') as HTMLInputElement).value);
    const endKm = Number((document.getElementById('finishTripKm') as HTMLInputElement).value);
    const returnNotes = (document.getElementById('finishTripNotes') as HTMLTextAreaElement).value;

    if (endKm <= startKm) {
      showAlertModal('Quilometragem Inválida', `Por favor insira um valor superior à quilometragem de saída (${startKm} KM).`);
      return;
    }

    const b = bookings.find(item => item.id === bId);
    if (!b) return;

    const car = vehicles.find(v => v.id === b.vehicleId);

    // Save final specs
    b.status = 'concluido';
    b.actualEndKm = endKm;
    b.notes = returnNotes.trim() ? returnNotes : undefined;
    b.actualEndDate = SYSTEM_REFERENCE_DATE.toISOString().split('.')[0];

    if (car) {
      car.status = 'disponivel';
      car.km = endKm; // Save final odometer reading
    }

    try {
      if (useDjangoApi) {
        await Promise.all([
          fetchFromDjangoAPI(`bookings/${bId}/`, {
            method: 'PUT',
            body: JSON.stringify(b)
          }),
          fetchFromDjangoAPI(`vehicles/${car!.id}/`, {
            method: 'PUT',
            body: JSON.stringify(car)
          })
        ]);
      }
      showToast('Retorno de veículo registrado com sucesso!', 'success');
    } catch (err) {
      showToast('Devolução salva off-line (Local Storage).', 'info');
    }

    saveLocalState();
    document.getElementById('modalFinishTrip')!.classList.add('hidden');
    renderCurrentView();
  };

  // C. Quick maintenance form modal submission
  document.getElementById('formQuickMaint')!.onsubmit = async (e) => {
    e.preventDefault();
    const vId = (document.getElementById('quickMaintVehicleId') as HTMLInputElement).value;
    const desc = (document.getElementById('quickMaintDesc') as HTMLInputElement).value;
    const cost = Number((document.getElementById('quickMaintCost') as HTMLInputElement).value);
    const date = (document.getElementById('quickMaintDate') as HTMLInputElement).value;

    const car = vehicles.find(item => item.id === vId);
    if (!car) return;

    // Change status
    car.status = 'manutencao';

    // Create record
    const recordId = `m_${Date.now()}`;
    const newRecord: MaintenanceRecord = {
      id: recordId,
      vehicleId: vId,
      description: desc,
      cost,
      date,
      type: 'corretiva',
      status: 'concluido'
    };

    maintenances = [newRecord, ...maintenances];

    try {
      if (useDjangoApi) {
        await Promise.all([
          fetchFromDjangoAPI('maintenance/', {
            method: 'POST',
            body: JSON.stringify(newRecord)
          }),
          fetchFromDjangoAPI(`vehicles/${vId}/`, {
            method: 'PUT',
            body: JSON.stringify(car)
          })
        ]);
      }
      showToast('Veículo sob manutenção. Retirado de uso temporário.', 'success');
    } catch (err) {
      showToast('Registrado off-line e retirado da escala.', 'info');
    }

    saveLocalState();
    document.getElementById('modalMaint')!.classList.add('hidden');
    renderCurrentView();
  };

  // D. Create new booking main form submission
  document.getElementById('formNewBooking')!.onsubmit = async (e) => {
    e.preventDefault();
    
    const vehicleId = (document.getElementById('nbVehicleId') as HTMLSelectElement).value;
    const startDate = (document.getElementById('nbStartDate') as HTMLInputElement).value;
    const endDate = (document.getElementById('nbEndDate') as HTMLInputElement).value;
    const purpose = (document.getElementById('nbPurpose') as HTMLInputElement).value;
    const driverName = (document.getElementById('nbDriverName') as HTMLInputElement).value;
    const driverCpf = (document.getElementById('nbDriverCpf') as HTMLInputElement).value;
    const driverCnh = (document.getElementById('nbDriverCnh') as HTMLInputElement).value;
    const driverCnhCategory = (document.getElementById('nbDriverCnhCategory') as HTMLSelectElement).value;
    const notes = (document.getElementById('nbNotes') as HTMLTextAreaElement).value;

    // Check again
    const conflict = checkBookingConflict(vehicleId, startDate, endDate, bookings);
    if (conflict) {
      showAlertModal('Conflito de Horário', 'Impossível prosseguir: Conflito de data/horário detectado após o preenchimento. Por favor, reveja as datas.');
      return;
    }

    const bookingId = `b_${Date.now()}`;
    const newBooking: Booking = {
      id: bookingId,
      vehicleId,
      driverName,
      driverCpf,
      driverCnh,
      driverCnhCategory,
      purpose,
      startDate,
      endDate,
      status: 'pendente',
      notes: notes.trim() ? notes : undefined,
      createdAt: SYSTEM_REFERENCE_DATE.toISOString().split('.')[0]
    };

    bookings = [newBooking, ...bookings];

    try {
      if (useDjangoApi) {
        await fetchFromDjangoAPI('bookings/', {
          method: 'POST',
          body: JSON.stringify(newBooking)
        });
      }
      showToast('Reserva de veículo efetuada com sucesso!', 'success');
    } catch (err) {
      showToast('Reserva adicionada localmente.', 'info');
    }

    saveLocalState();
    
    // Clear deep prefills
    prefilledVehicleId = '';
    prefilledStartDate = '';
    
    navigateTo('bookings');
  };

  // E. Create or Edit vehicle main form submission
  document.getElementById('formNewVehicle')!.onsubmit = async (e) => {
    e.preventDefault();

    const existingId = (document.getElementById('nvVehicleId') as HTMLInputElement).value;
    const brand = (document.getElementById('nvBrand') as HTMLInputElement).value;
    const model = (document.getElementById('nvModel') as HTMLInputElement).value;
    const plate = (document.getElementById('nvPlate') as HTMLInputElement).value;
    const year = Number((document.getElementById('nvYear') as HTMLInputElement).value);
    const type = (document.getElementById('nvType') as HTMLSelectElement).value as any;
    const fuel = (document.getElementById('nvFuel') as HTMLSelectElement).value as any;
    const km = Number((document.getElementById('nvKm') as HTMLInputElement).value);
    const capacity = Number((document.getElementById('nvCapacity') as HTMLInputElement).value);
    const color = (document.getElementById('nvColor') as HTMLInputElement).value;
    const notes = (document.getElementById('nvNotes') as HTMLTextAreaElement).value;
    
    const nextPreventiveDateVal = (document.getElementById('nvNextPreventiveDate') as HTMLInputElement).value;
    const preventivePeriodMonthVal = (document.getElementById('nvPreventivePeriodMonth') as HTMLInputElement).value;
    const nextPreventiveDate = nextPreventiveDateVal.trim() ? nextPreventiveDateVal : undefined;
    const preventivePeriodMonth = preventivePeriodMonthVal ? Number(preventivePeriodMonthVal) : undefined;
    const active = (document.getElementById('nvActive') as HTMLInputElement).checked;

    let finalVehicle: Vehicle;
    if (existingId) {
      const match = vehicles.find(v => v.id === existingId);
      finalVehicle = {
        id: existingId,
        brand,
        model,
        plate: formatPlate(plate),
        year,
        type,
        fuel,
        km,
        capacity,
        color,
        notes: notes.trim() ? notes : undefined,
        nextPreventiveDate,
        preventivePeriodMonth,
        status: match ? match.status : 'disponivel',
        active
      };
    } else {
      finalVehicle = {
        id: `v_${Date.now()}`,
        brand,
        model,
        plate: formatPlate(plate),
        year,
        type,
        fuel,
        km,
        capacity,
        color,
        notes: notes.trim() ? notes : undefined,
        nextPreventiveDate,
        preventivePeriodMonth,
        status: 'disponivel',
        active
      };
    }

    try {
      if (useDjangoApi) {
        if (existingId) {
          await fetchFromDjangoAPI(`vehicles/${existingId}/`, {
            method: 'PUT',
            body: JSON.stringify(finalVehicle)
          });
        } else {
          await fetchFromDjangoAPI('vehicles/', {
            method: 'POST',
            body: JSON.stringify(finalVehicle)
          });
        }
      }
      showToast(existingId ? `Veículo [${finalVehicle.plate}] atualizado.` : `Novo veículo [${finalVehicle.plate}] cadastrado.`, 'success');
    } catch (err) {
      showToast('Dados salvos off-line localmente.', 'info');
    }

    if (existingId) {
      vehicles = vehicles.map(v => v.id === existingId ? finalVehicle : v);
    } else {
      vehicles = [finalVehicle, ...vehicles];
    }

    saveLocalState();
    vehicleToEdit = null; // Clear edit param
    navigateTo('fleet');
  };

  // Standalone Driver Form Submission
  const formNewDriverEl = document.getElementById('formNewDriver');
  if (formNewDriverEl) {
    formNewDriverEl.onsubmit = async (e) => {
      e.preventDefault();

      const existingId = (document.getElementById('ndDriverId') as HTMLInputElement).value;
      const name = (document.getElementById('ndName') as HTMLInputElement).value;
      const cpf = (document.getElementById('ndCpf') as HTMLInputElement).value;
      const cnh = (document.getElementById('ndCnh') as HTMLInputElement).value;
      const cnhExpiry = (document.getElementById('ndCnhExpiry') as HTMLInputElement).value;
      const active = (document.getElementById('ndActive') as HTMLInputElement).checked;

      let cnhCategory = 'B';
      if (existingId) {
        const matching = drivers.find(d => d.id === existingId);
        if (matching && matching.cnhCategory) {
          cnhCategory = matching.cnhCategory;
        }
      }

      let finalDriver: Driver;
      if (existingId) {
        finalDriver = {
          id: existingId,
          name,
          cpf,
          cnh,
          cnhExpiry,
          cnhCategory,
          active
        };
      } else {
        finalDriver = {
          id: `d_${Date.now()}`,
          name,
          cpf,
          cnh,
          cnhExpiry,
          cnhCategory,
          active
        };
      }

      try {
        if (useDjangoApi) {
          if (existingId) {
            await fetchFromDjangoAPI(`drivers/${existingId}/`, {
              method: 'PUT',
              body: JSON.stringify(finalDriver)
            });
          } else {
            await fetchFromDjangoAPI('drivers/', {
              method: 'POST',
              body: JSON.stringify(finalDriver)
            });
          }
        }
        showToast(existingId ? `Motorista [${finalDriver.name}] atualizado.` : `Novo motorista [${finalDriver.name}] cadastrado.`, 'success');
      } catch (err) {
        showToast('Dados salvos off-line localmente.', 'info');
      }

      if (existingId) {
        drivers = drivers.map(d => d.id === existingId ? finalDriver : d);
      } else {
        drivers = [finalDriver, ...drivers];
      }

      saveLocalState();
      driverToEdit = null;
      navigateTo('drivers');
    };
  }

  // F. Create or Edit standalone Maintenance Record from Maintenance Tab
  document.getElementById('formMaintenance')!.onsubmit = async (e) => {
    e.preventDefault();
    
    const vehicleId = (document.getElementById('mFormVehicleId') as HTMLSelectElement).value;
    const description = (document.getElementById('mFormDescription') as HTMLInputElement).value;
    const cost = Number((document.getElementById('mFormCost') as HTMLInputElement).value);
    const date = (document.getElementById('mFormDate') as HTMLInputElement).value;
    const type = (document.getElementById('mFormType') as HTMLSelectElement).value as any;
    const status = (document.getElementById('mFormStatus') as HTMLSelectElement).value as any;
    const notes = (document.getElementById('mFormNotes') as HTMLTextAreaElement).value;

    if (maintenanceToEdit) {
      // MODALIDADE DE EDIÇÃO
      const recordId = maintenanceToEdit.id;
      const updatedRecord: MaintenanceRecord = {
        id: recordId,
        vehicleId,
        description,
        cost,
        date,
        type,
        status,
        notes: notes.trim() ? notes : undefined
      };

      maintenances = maintenances.map(item => item.id === recordId ? updatedRecord : item);

      if (status === 'concluido' && type === 'preventiva') {
        autoUpdateVehiclePreventive(vehicleId, date);
      }

      // Tratamento do status do veículo se alterado de agendado para concluído ou vice-versa
      const car = vehicles.find(v => v.id === vehicleId);
      if (status === 'agendado') {
        if (car && car.status === 'disponivel') {
          car.status = 'manutencao';
        }
      } else {
        // Se mudou de agendado para concluído, restaura se não houver outros agendados para este veículo
        if (maintenanceToEdit.status === 'agendado' && car && car.status === 'manutencao') {
          const otherScheduled = maintenances.some(m => m.vehicleId === vehicleId && m.status === 'agendado' && m.id !== recordId);
          if (!otherScheduled) {
            car.status = 'disponivel';
          }
        }
      }

      try {
        if (useDjangoApi) {
          await fetchFromDjangoAPI(`maintenance/${recordId}/`, {
            method: 'PUT',
            body: JSON.stringify(updatedRecord)
          });
          if (car) {
            await fetchFromDjangoAPI(`vehicles/${car.id}/`, {
              method: 'PUT',
              body: JSON.stringify(car)
            });
          }
        }
        showToast('Registro de manutenção editado com sucesso.', 'success');
      } catch (err) {
        showToast('Alteração salva localmente em modo off-line.', 'info');
      }

      maintenanceToEdit = null;
    } else {
      // MODALIDADE DE CRIAÇÃO
      const recordId = `m_${Date.now()}`;
      const newRecord: MaintenanceRecord = {
        id: recordId,
        vehicleId,
        description,
        cost,
        date,
        type,
        status,
        notes: notes.trim() ? notes : undefined
      };

      maintenances = [newRecord, ...maintenances];

      if (status === 'concluido' && type === 'preventiva') {
        autoUpdateVehiclePreventive(vehicleId, date);
      }

      // If scheduled and future, pull vehicle if chosen to maintenance
      if (status === 'agendado') {
        const car = vehicles.find(v => v.id === vehicleId);
        if (car && car.status === 'disponivel') {
          car.status = 'manutencao';
        }
      }

      try {
        if (useDjangoApi) {
          await fetchFromDjangoAPI('maintenance/', {
            method: 'POST',
            body: JSON.stringify(newRecord)
          });
        }
        showToast('Nova lançamento fiscal de manutenção efetuado.', 'success');
      } catch (err) {
        showToast('Salva off-line no livro de registro.', 'info');
      }
    }

    saveLocalState();
    
    // Clear form inputs
    (document.getElementById('mFormVehicleId') as HTMLSelectElement).value = '';
    (document.getElementById('mFormDescription') as HTMLInputElement).value = '';
    (document.getElementById('mFormCost') as HTMLInputElement).value = '';
    (document.getElementById('mFormNotes') as HTMLTextAreaElement).value = '';
    
    renderCurrentView();
  };


  // --- REAL-TIME LISTENERS AND INLINE HANDLERS ---

  // Django Sync toggler
  const toggleCheckbox = document.getElementById('apiToggle') as HTMLInputElement;
  if (toggleCheckbox) {
    toggleCheckbox.addEventListener('change', () => {
      useDjangoApi = toggleCheckbox.checked;
      syncWithDjangoBackend();
    });
  }

  // Real-time checking on reservations form
  const vIdSelect = document.getElementById('nbVehicleId');
  const dStartInput = document.getElementById('nbStartDate');
  const dEndInput = document.getElementById('nbEndDate');

  if (vIdSelect && dStartInput && dEndInput) {
    [vIdSelect, dStartInput, dEndInput].forEach(el => {
      el.addEventListener('change', () => nbCheckOverlapAvailability());
      el.addEventListener('input', () => nbCheckOverlapAvailability());
    });
  }

  // CPFs layout format masks
  const cpfEl = document.getElementById('nbDriverCpf');
  if (cpfEl) {
    cpfEl.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      target.value = maskCPF(target.value);
    });
  }

  const cpfEl2 = document.getElementById('ndCpf');
  if (cpfEl2) {
    cpfEl2.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      target.value = maskCPF(target.value);
    });
  }

  // Quick driver select listener
  const quickDriverSelect = document.getElementById('nbQuickDriverSelect') as HTMLSelectElement;
  if (quickDriverSelect) {
    quickDriverSelect.addEventListener('change', () => {
      const selectedId = quickDriverSelect.value;
      if (selectedId) {
        const found = drivers.find(d => d.id === selectedId);
        if (found) {
          (document.getElementById('nbDriverName') as HTMLInputElement).value = found.name;
          (document.getElementById('nbDriverCpf') as HTMLInputElement).value = maskCPF(found.cpf);
          (document.getElementById('nbDriverCnh') as HTMLInputElement).value = found.cnh;
          (document.getElementById('nbDriverCnhCategory') as HTMLSelectElement).value = found.cnhCategory || 'B';
        }
      } else {
        (document.getElementById('nbDriverName') as HTMLInputElement).value = '';
        (document.getElementById('nbDriverCpf') as HTMLInputElement).value = '';
        (document.getElementById('nbDriverCnh') as HTMLInputElement).value = '';
        (document.getElementById('nbDriverCnhCategory') as HTMLSelectElement).value = 'B';
      }
    });
  }

  // Plates layout format masks
  const plateEl = document.getElementById('nvPlate');
  if (plateEl) {
    plateEl.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      target.value = formatPlate(target.value);
    });
  }

  // Modal Closers
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('modalStartTrip')!.classList.add('hidden');
      document.getElementById('modalFinishTrip')!.classList.add('hidden');
      document.getElementById('modalMaint')!.classList.add('hidden');
    });
  });

  // Filters inputs for Bookings tab
  const bSearch = document.getElementById('bookingsSearchInput');
  const bFilter = document.getElementById('bookingsFilterStatus');
  if (bSearch && bFilter) {
    bSearch.addEventListener('input', (e) => {
      bookingsSearchQuery = (e.target as HTMLInputElement).value;
      renderBookings();
    });
    bFilter.addEventListener('change', (e) => {
      bookingsFilterStatus = (e.target as HTMLSelectElement).value;
      renderBookings();
    });
  }

  // Filters inputs for Fleet/Vehicles tab
  const fSearch = document.getElementById('fleetSearchInput');
  const fType = document.getElementById('fleetFilterType');
  const fStatus = document.getElementById('fleetFilterStatus');
  const fActive = document.getElementById('fleetFilterActive') as HTMLSelectElement;

  if (fSearch && fType && fStatus) {
    fSearch.addEventListener('input', (e) => {
      fleetSearchQuery = (e.target as HTMLInputElement).value;
      renderFleet();
    });
    fType.addEventListener('change', (e) => {
      fleetFilterType = (e.target as HTMLSelectElement).value;
      renderFleet();
    });
    fStatus.addEventListener('change', (e) => {
      fleetFilterStatus = (e.target as HTMLSelectElement).value;
      renderFleet();
    });
  }
  if (fActive) {
    fActive.addEventListener('change', (e) => {
      fleetFilterActive = (e.target as HTMLSelectElement).value;
      renderFleet();
    });
  }

  // Filters inputs for Drivers tab
  const dSearch = document.getElementById('driversSearchInput');
  const dActive = document.getElementById('driversFilterActive') as HTMLSelectElement;
  if (dSearch) {
    dSearch.addEventListener('input', (e) => {
      driversSearchQuery = (e.target as HTMLInputElement).value;
      renderDrivers();
    });
  }
  if (dActive) {
    dActive.addEventListener('change', (e) => {
      driversFilterActive = (e.target as HTMLSelectElement).value;
      renderDrivers();
    });
  }

  // Filters inputs for Maintenance tab
  const mFVId = document.getElementById('mFilterVehicleId');
  const mFStart = document.getElementById('mFilterStartDate');
  const mFEnd = document.getElementById('mFilterEndDate');
 
  if (mFVId) {
    mFVId.addEventListener('change', () => renderMaintenance());
  }
  if (mFStart) {
    mFStart.addEventListener('change', () => renderMaintenance());
    mFStart.addEventListener('input', () => renderMaintenance());
  }
  if (mFEnd) {
    mFEnd.addEventListener('change', () => renderMaintenance());
    mFEnd.addEventListener('input', () => renderMaintenance());
  }


  // --- START THE VIEW ---
  renderCurrentView();
});
