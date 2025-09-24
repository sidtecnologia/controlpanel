// --- Configuración Supabase ---
const { createClient } = supabase;
const SUPABASE_URL = 'https://nqjekbyyvqrevbcehhob.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xamVrYnl5dnFyZXZiY2VoaG9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0MzE4MTEsImV4cCI6MjA3NDAwNzgxMX0.U-zb7wcX3qYeAoRH3MM2FVj9ZZzODsdvjj9wNWg_h74'; // reemplaza con tu clave real
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Referencias DOM ---
const navButtons = document.querySelectorAll('.nav-btn');
const accountingTableBody = document.getElementById('accounting-table-body');
const accountingStatus = document.getElementById('accounting-status');
const accountingPayment = document.getElementById('accounting-payment');
const accountingStart = document.getElementById('accounting-start');
const accountingEnd = document.getElementById('accounting-end');
const accountingMin = document.getElementById('accounting-min');
const accountingMax = document.getElementById('accounting-max');
const exportAccountingBtn = document.getElementById('exportAccountingBtn');
const refreshOrdersBtn = document.getElementById('refreshOrdersBtn');
// NUEVA REFERENCIA: Elemento para mostrar el total
const confirmedTotalDisplay = document.getElementById('confirmed-total-display');

// --- Estado ---
let orders = [];
let filteredOrders = [];

// --- Helpers ---
const money = (v) => {
    if (v === null || v === undefined) return '0';
    const n = Math.floor(Number(v) || 0);
    return n.toLocaleString('es-CO');
};

const show = (el) => el && (el.style.display = 'block');
const hide = (el) => el && (el.style.display = 'none');

// --- Vistas ---
const showView = (viewId) => {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(viewId);
    if (el) el.classList.add('active');
    navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view + '-view' === viewId));
};

// --- Render contabilidad ---
const renderAccounting = () => {
    let list = [...orders];
    if (accountingStatus && accountingStatus.value) list = list.filter(o => o.payment_status === accountingStatus.value);
    if (accountingPayment && accountingPayment.value) list = list.filter(o => o.payment_method === accountingPayment.value);
    if (accountingStart && accountingStart.value) {
        const start = new Date(accountingStart.value);
        list = list.filter(o => new Date(o.created_at) >= start);
    }
    if (accountingEnd && accountingEnd.value) {
        const end = new Date(accountingEnd.value);
        list = list.filter(o => new Date(o.created_at) <= end);
    }
    const minVal = parseInt(accountingMin?.value, 10) || 0;
    const maxVal = parseInt(accountingMax?.value, 10) || 0;
    if (minVal) list = list.filter(o => Number(o.total_amount || 0) >= minVal);
    if (maxVal) list = list.filter(o => Number(o.total_amount || 0) <= maxVal);

    filteredOrders = list;
    accountingTableBody.innerHTML = '';

    // NUEVA LÓGICA: Calcula el total de pedidos "confirmados" en la lista filtrada
    const confirmedTotal = filteredOrders
        .filter(o => o.payment_status && o.payment_status.toLowerCase() === 'confirmado')
        .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

    // Muestra el total
    if (confirmedTotalDisplay) {
        confirmedTotalDisplay.textContent = `$${money(confirmedTotal)}`;
    }

    list.forEach(o => {
        const row = document.createElement('tr');
        row.innerHTML = `
        <td>${o.customer_name || ''}</td>
        <td>${o.created_at ? new Date(o.created_at).toLocaleDateString() : ''}</td>
        <td>${o.payment_method || 'N/A'}</td>
        <td>$${money(o.total_amount)}</td>
        <td>${o.payment_status || ''}</td>
        `;
        accountingTableBody.appendChild(row);
    });
};

// --- Export contabilidad CSV ---
const exportAccounting = () => {
    const header = ['ID', 'Cliente', 'Fecha', 'MetodoPago', 'Total', 'Estado'];
    const rows = filteredOrders.map(o => {
        const date = o.created_at ? new Date(o.created_at).toLocaleString() : '';
        const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;
        return [esc(o.id), esc(o.customer_name), esc(date), esc(o.payment_method), esc(o.total_amount), esc(o.payment_status)].join(',');
    });
    const csv = [header.join(','), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'contabilidad.csv';
    link.click();
};

// --- Fetchers ---
const fetchOrders = async () => {
    const { data, error } = await supabaseClient.from('orders').select('*').order('created_at', { ascending: false });
    if (error) return console.error('Error cargar pedidos:', error.message || error);
    orders = data || [];
    renderAccounting();
};

// --- Realtime ---
const setupRealtimeListener = () => {
    supabaseClient
        .channel('public:orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
            const ev = payload.eventType;
            if (ev === 'INSERT') {
                orders.unshift(payload.new);
            } else if (ev === 'UPDATE') {
                const idx = orders.findIndex(o => o.id === payload.new.id);
                if (idx !== -1) orders[idx] = payload.new;
            } else if (ev === 'DELETE') {
                orders = orders.filter(o => o.id !== payload.old.id);
            }
            renderAccounting();
        })
        .subscribe();
};

// Event listeners
[accountingStatus, accountingPayment, accountingStart, accountingEnd, accountingMin, accountingMax].forEach(el => {
    el?.addEventListener('change', renderAccounting);
});
exportAccountingBtn?.addEventListener('click', exportAccounting);

// --- Refresh pedidos ---
refreshOrdersBtn?.addEventListener('click', fetchOrders);


// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
    navButtons.forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view + '-view')));
    await fetchOrders();
    setupRealtimeListener();
});
(function() {
    const emojiMap = {
        'eye': '👁️',
        'clock': '🕒',
        'truck': '🚚',
        'check': '✅',
        'pen-to-square': '✏️',
        'trash': '🗑️',
        'rotate': '🔁',
        'plus': '➕',
        'boxes-stacked': '📦',
        'box': '📦',
        'boxes': '📦',
        'receipt': '🧾',
        'calculator': '🧮',
        'print': '🖨️',
        'save': '💾',
        'box-open': '📦',
        'file-export': '📤',
        'file-arrow-up': '📤'
    };

    function faLoaded() {
        try {
            const el = document.createElement('i');
            el.className = 'fa-solid fa-eye';
            el.style.position = 'absolute';
            el.style.visibility = 'hidden';
            document.body.appendChild(el);
            const fam = window.getComputedStyle(el).fontFamily || '';
            document.body.removeChild(el);
            return /font ?awesome/i.test(fam) || fam.toLowerCase().includes('fontawesome');
        } catch (e) {
            return false;
        }
    }

    function replaceIcons(root = document) {
        const nodes = root.querySelectorAll('i[class*="fa-"]');
        nodes.forEach(i => {
            // elegir clase fa-* que no sea fa-solid/fa-regular/fa-brands/fa/fas/far/fab
            const cls = Array.from(i.classList).find(c => c.startsWith('fa-') && !['fa-solid', 'fa-regular', 'fa-brands', 'fa-light', 'fa', 'fas', 'far', 'fab'].includes(c));
            const raw = cls ? cls.replace(/^fa-/, '') : null;
            const key = raw || Array.from(i.classList).find(c => /fa-[a-z0-9-]+/i.test(c))?.replace(/^fa-/, '');
            const emoji = (key && (emojiMap[key] || emojiMap[key.split('-')[0]])) || '🔘';
            const span = document.createElement('span');
            span.className = 'icon-fallback';
            span.setAttribute('aria-hidden', 'true');
            span.textContent = emoji;
            // preservar atributos útiles
            if (i.title) span.title = i.title;
            // transferir data-* attrs
            Array.from(i.attributes).forEach(attr => {
                if (attr.name.startsWith('data-')) span.setAttribute(attr.name, attr.value);
            });
            i.replaceWith(span);
        });
    }

    function init() {
        // si FA cargó, no hacemos nada
        if (faLoaded()) return;
        replaceIcons();
        // observar nodos nuevos (para tablas dinámicas)
        const mo = new MutationObserver(muts => {
            muts.forEach(m => {
                m.addedNodes.forEach(n => {
                    if (n.nodeType === 1) replaceIcons(n);
                });
            });
        });
        mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();