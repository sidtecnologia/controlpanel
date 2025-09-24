// --- Configuración Supabase ---
const { createClient } = supabase;
const SUPABASE_URL = 'https://nqjekbyyvqrevbcehhob.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xamVrYnl5dnFyZXZiY2VoaG9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0MzE4MTEsImV4cCI6MjA3NDAwNzgxMX0.U-zb7wcX3qYeAoRH3MM2FVj9ZZzODsdvjj9wNWg_h74'; // reemplaza con tu clave real
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Referencias DOM ---
const navButtons = document.querySelectorAll('.nav-btn');
const orderCountBadge = document.getElementById('order-count-badge');
const ordersTableBody = document.getElementById('orders-table-body');
const orderModal = document.getElementById('order-modal');
const orderDetails = document.getElementById('order-details');
const printInvoiceBtn = document.getElementById('printInvoiceBtn');
const refreshOrdersBtn = document.getElementById('refreshOrdersBtn');

// --- Estado ---
let orders = [];
let selectedOrder = null;

// --- Helpers ---
const money = (v) => {
  if (v === null || v === undefined) return '0';
  const n = Math.floor(Number(v) || 0);
  return n.toLocaleString('es-CO');
};

const show = (el) => {
    if (el) {
        if (el.classList.contains('modal')) {
            el.style.display = 'flex';
        } else {
            el.style.display = 'block';
        }
    }
};

const hide = (el) => el && (el.style.display = 'none');

const showView = (viewId) => {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(viewId);
  if (el) el.classList.add('active');
  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view + '-view' === viewId));
};

// --- Render pedidos ---
const renderOrders = (list = orders) => {
  ordersTableBody.innerHTML = '';
  list.forEach(o => {
    const idShort = (o.id || '').slice(0, 5) + '...';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${idShort}</td>
      <td>${o.customer_name || ''}</td>
      <td>${o.customer_address || ''}</td>
      <td>$${money(o.total_amount)}</td>
      <td><span class="order-status ${String(o.order_status || '').toLowerCase()}">${o.order_status || 'Pendiente'}</span></td>
      <td>${o.created_at ? new Date(o.created_at).toLocaleString() : ''}</td>
      <td>
        <button class="view-order-btn" data-id="${o.id}" title="Ver Detalle">
          <i class="fa-solid fa-eye"></i>
        </button>
        <button class="update-order-status-btn" data-id="${o.id}" data-status="Despachado" title="Marcar Despachado">
          <i class="fa-solid fa-truck"></i>
        </button>
      </td>
    `;
    ordersTableBody.appendChild(row);
  });
};

// --- Fetchers ---
const fetchOrders = async () => {
  const { data, error } = await supabaseClient
    .from('orders')
    .select('*')
    .eq('payment_status', 'Confirmado')
    .eq('order_status', 'Pendiente')
    .order('created_at', { ascending: false });
  if (error) return console.error('Error cargar pedidos:', error.message || error);
  orders = data || [];
  renderOrders();
  updateOrderCountBadge();
};

// --- Realtime ---
const setupRealtimeListener = () => {
  supabaseClient
    .channel('public:orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
      const ev = payload.eventType;
      if (ev === 'INSERT') {
        if (payload.new.payment_status === 'Confirmado' && payload.new.order_status === 'Pendiente') {
          orders.unshift(payload.new);
          try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Nuevo pedido para despacho', { body: `¡Nuevo pedido de ${payload.new.customer_name || 'cliente'} listo para despachar!` }); } catch(e){}
        }
      } else if (ev === 'UPDATE') {
        const idx = orders.findIndex(o => o.id === payload.new.id);
        if (idx !== -1) {
            if (payload.new.order_status === 'Despachado' || payload.new.order_status === 'Entregado') {
                orders.splice(idx, 1);
            } else {
                orders[idx] = payload.new;
            }
        } else if (payload.new.payment_status === 'Confirmado' && payload.new.order_status === 'Pendiente') {
          orders.unshift(payload.new);
        }
      } else if (ev === 'DELETE') {
        orders = orders.filter(o => o.id !== payload.old.id);
      }
      renderOrders();
      updateOrderCountBadge();
    })
    .subscribe();
};

// --- Delegación eventos ---
document.addEventListener('click', async (e) => {
  // actualizar estado de despacho
  const statusBtn = e.target.closest('.update-order-status-btn');
  if (statusBtn) {
    const orderId = statusBtn.dataset.id;
    const newStatus = statusBtn.dataset.status;

    // Actualiza el estado en la base de datos
    await supabaseClient.from('orders').update({ order_status: newStatus }).eq('id', orderId);
    
    // MODIFICACIÓN: Eliminar del listado y renderizar inmediatamente
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex !== -1) {
      orders.splice(orderIndex, 1);
      renderOrders();
      updateOrderCountBadge();
    }
    return;
  }

  // ver detalle pedido
  const viewOrderBtn = e.target.closest('.view-order-btn');
  if (viewOrderBtn) {
    const id = viewOrderBtn.dataset.id;
    selectedOrder = orders.find(x => x.id === id);
    if (!selectedOrder) return alert('Pedido no encontrado.');

    const itemsRaw = Array.isArray(selectedOrder.order_items) ? selectedOrder.order_items : [];
    const items = itemsRaw.map(p => ({
      name: p?.name || p?.product_name || 'Producto',
      quantity: Number(p?.qty ?? p?.quantity ?? 1),
      price: Number(p?.price ?? p?.unit_price ?? 0)
    }));
    const totalItems = items.reduce((sum, it) => sum + it.quantity, 0);
    const itemsHtml = items.length === 0
      ? '<p>No hay productos registrados en este pedido.</p>'
      : `<ul>${items.map(it => `<li>${it.name} (x${it.quantity}) - $${money(it.price * it.quantity)}</li>`).join('')}</ul>`;

    orderDetails.innerHTML = `
      <p><strong>Cliente:</strong> ${selectedOrder.customer_name || ''}</p>
      <p><strong>Dirección:</strong> ${selectedOrder.customer_address || ''}</p>
      <p><strong>Método de pago:</strong> ${selectedOrder.payment_method || 'N/A'}</p>
      <p><strong>Total:</strong> $${money(selectedOrder.total_amount)}</p>
      <h4>Productos:</h4>
      ${itemsHtml}
      <p><strong>Cantidad total de items:</strong> ${totalItems}</p>
    `;
    show(orderModal);
    return;
  }

  // cerrar modal
  if (e.target.closest('.close-btn')) {
    hide(orderModal);
    return;
  }
});

// --- Imprimir factura térmica ---
printInvoiceBtn?.addEventListener('click', () => {
  if (!selectedOrder) return;
  const raw = Array.isArray(selectedOrder.order_items) ? selectedOrder.order_items : [];
  const items = raw.map(p => ({
    name: p?.name || p?.product_name || 'Producto',
    quantity: Number(p?.qty ?? p?.quantity ?? 1),
    price: Number(p?.price ?? p?.unit_price ?? 0)
  }));
  const itemsHtml = items.map(it => `<li><span>${it.name} x${it.quantity}</span><span>$${money(it.price * it.quantity)}</span></li>`).join('');
  const invoiceWindow = window.open('', '', 'width=400,height=600');
  invoiceWindow.document.write(`
    <html><head><meta charset="utf-8"><style>
      body{font-family:monospace;font-size:12px;width:280px;margin:0 auto}
      h2{text-align:center;font-size:14px;margin:6px 0}
      .line{border-top:1px dashed #000;margin:6px 0}
      ul{list-style:none;padding:0;margin:0}
      li{display:flex;justify-content:space-between;margin:2px 0}
      .tot{font-weight:bold;margin-top:8px}
    </style></head><body>
    <h2>FACTURA</h2>
    <div>Cliente: ${selectedOrder.customer_name || ''}</div>
    <div>Dir: ${selectedOrder.customer_address || ''}</div>
    <div>Método de pago: ${selectedOrder.payment_method || 'N/A'}</div>
    <div>Fecha: ${selectedOrder.created_at ? new Date(selectedOrder.created_at).toLocaleString() : ''}</div>
    <div class="line"></div>
    <ul>${itemsHtml}</ul>
    <div class="line"></div>
    <div class="tot">TOTAL: $${money(selectedOrder.total_amount)}</div>
    <div class="line"></div>
    <div style="text-align:center;margin-top:8px;">Gracias por su compra</div>
    </body></html>
  `);
  invoiceWindow.print();
});

// --- Badge pedidos pendientes de despacho ---
const updateOrderCountBadge = () => {
  const pending = orders.length;
  if (pending > 0) {
    orderCountBadge.textContent = pending;
    orderCountBadge.classList.remove('hidden');
  } else orderCountBadge.classList.add('hidden');
};

// Event listeners
refreshOrdersBtn?.addEventListener('click', fetchOrders);

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  navButtons.forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view + '-view')));
  await fetchOrders();
  setupRealtimeListener();
  try { if ('Notification' in window) Notification.requestPermission(); } catch (e) {}
  setInterval(fetchOrders, 3000);
});
(function(){
  const emojiMap = {
    'eye':'👁️','clock':'🕒','truck':'🚚','check':'✅',
    'pen-to-square':'✏️','trash':'🗑️','rotate':'🔁','plus':'➕',
    'boxes-stacked':'📦','box':'📦','boxes':'📦','receipt':'🧾',
    'calculator':'🧮','print':'🖨️','save':'💾','box-open':'📦',
    'file-export':'📤','file-arrow-up':'📤','xmark':'❌'
  };

  function faLoaded(){
    try {
      const el = document.createElement('i');
      el.className = 'fa-solid fa-eye';
      el.style.position = 'absolute';
      el.style.visibility = 'hidden';
      document.body.appendChild(el);
      const fam = window.getComputedStyle(el).fontFamily || '';
      document.body.removeChild(el);
      return /font ?awesome/i.test(fam) || fam.toLowerCase().includes('fontawesome');
    } catch (e) { return false; }
  }

  function replaceIcons(root = document){
    const nodes = root.querySelectorAll('i[class*="fa-"]');
    nodes.forEach(i => {
      const cls = Array.from(i.classList).find(c => c.startsWith('fa-') && !['fa-solid','fa-regular','fa-brands','fa-light','fa','fas','far','fab'].includes(c));
      const raw = cls ? cls.replace(/^fa-/, '') : null;
      const key = raw || Array.from(i.classList).find(c=>/fa-[a-z0-9-]+/i.test(c))?.replace(/^fa-/,'');
      const emoji = (key && (emojiMap[key] || emojiMap[key.split('-')[0]])) || '🔘';
      const span = document.createElement('span');
      span.className = 'icon-fallback';
      span.setAttribute('aria-hidden','true');
      span.textContent = emoji;
      if(i.title) span.title = i.title;
      Array.from(i.attributes).forEach(attr=>{
        if(attr.name.startsWith('data-')) span.setAttribute(attr.name, attr.value);
      });
      i.replaceWith(span);
    });
  }

  function init(){
    if(faLoaded()) return;
    replaceIcons();
    const mo = new MutationObserver(muts => {
      muts.forEach(m => {
        m.addedNodes.forEach(n => {
          if(n.nodeType === 1) replaceIcons(n);
        });
      });
    });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();