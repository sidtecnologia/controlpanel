// --- Configuración Supabase ---
const { createClient } = supabase;
const SUPABASE_URL = 'https://nqjekbyyvqrevbcehhob.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xamVrYnl5dnFyZXZiY2VoaG9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0MzE4MTEsImV4cCI6MjA3NDAwNzgxMX0.U-zb7wcX3qYeAoRH3MM2FVj9ZZzODsdvjj9wNWg_h74'; // reemplaza con tu clave real
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Referencias DOM ---
const navButtons = document.querySelectorAll('.nav-btn');
const orderCountBadge = document.getElementById('order-count-badge');

const productsTableBody = document.getElementById('products-table-body');
const ordersTableBody = document.getElementById('orders-table-body');
const accountingTableBody = document.getElementById('accounting-table-body');

const addProductBtn = document.getElementById('addProductBtn');
const productModal = document.getElementById('product-modal');
const productForm = document.getElementById('product-form');
const productImageInput = document.getElementById('product-image');
const imagePreview = document.getElementById('image-preview');
const currentImageUrlInput = document.getElementById('current-image-url');
const productModalTitle = productModal.querySelector('h3');

const productSearch = document.getElementById('product-search');
const productStockFilter = document.getElementById('product-stock-filter');

const orderModal = document.getElementById('order-modal');
const orderDetails = document.getElementById('order-details');
const printInvoiceBtn = document.getElementById('printInvoiceBtn');
const refreshOrdersBtn = document.getElementById('refreshOrdersBtn');

const accountingStatus = document.getElementById('accounting-status');
const accountingPayment = document.getElementById('accounting-payment');
const accountingStart = document.getElementById('accounting-start');
const accountingEnd = document.getElementById('accounting-end');
const accountingMin = document.getElementById('accounting-min');
const accountingMax = document.getElementById('accounting-max');
const exportAccountingBtn = document.getElementById('exportAccountingBtn');

// --- Nuevas referencias DOM para autenticación ---
const loginView = document.getElementById('login-view');
const mainView = document.getElementById('main-view');
const loginForm = document.getElementById('login-form');
const authStatusMessage = document.getElementById('auth-status-message');
const logoutBtn = document.getElementById('logout-btn');

// --- Estado ---
let products = [];
let orders = [];
let filteredOrders = [];
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

// --- Vistas ---
const showView = (viewId) => {
  document.querySelectorAll('#main-view .view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(viewId);
  if (el) el.classList.add('active');
  navButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.view + '-view' === viewId));
};

// --- Funciones de Autenticación ---
const handleLogin = async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
        authStatusMessage.textContent = 'Error: ' + error.message;
        console.error('Error de login:', error.message);
    } else {
        authStatusMessage.textContent = 'Inicio de sesión exitoso.';
        checkAuth(); // Vuelve a verificar el estado para mostrar el panel
    }
};

const handleLogout = async () => {
    await supabaseClient.auth.signOut();
    location.reload(); // Recarga la página para volver a la pantalla de login
};

const checkAuth = async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        // Usuario autenticado, muestra el panel de admin
        show(mainView);
        hide(loginView);
        // Llama a las funciones para cargar los datos
        await fetchProducts();
        await fetchOrders();
        setupRealtimeListener();
        showView('products-view'); // Muestra la vista de productos por defecto
    } else {
        // No hay sesión, muestra el formulario de login
        show(loginView);
        hide(mainView);
    }
};

// --- Render productos (con acciones) ---
const renderProducts = (list = products) => {
  productsTableBody.innerHTML = '';
  if (list.length === 0) {
    productsTableBody.innerHTML = '<tr><td colspan="7" class="no-results-message">No se encontraron productos.</td></tr>';
    return;
  }
  list.forEach(p => {
    const row = document.createElement('tr');
    if ((p.stock || 0) <= 0) row.classList.add('out-of-stock-row');
    const img = (p.image && Array.isArray(p.image) && p.image.length > 0) ? p.image[0] : 'https://placehold.co/50x50';
    row.innerHTML = `
      <td>${(p.id || '').slice(0,5)}...</td>
      <td><img src="${img}" alt="${(p.name||'')}" width="40" height="40"></td>
      <td>${p.name || ''}</td>
      <td>${p.category || ''}</td>
      <td>$${money(p.price)}</td>
      <td>${p.stock || 0}</td>
      <td>
        <button class="edit-product-btn" data-id="${p.id}" title="Modificar">
          <i class="fa-solid fa-pen-to-square"></i>
        </button>
        <button class="delete-product-btn" data-id="${p.id}" title="Eliminar">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    `;
    productsTableBody.appendChild(row);
  });
};

// --- Render pedidos (con iconos fa-solid) ---
const renderOrders = () => {
  ordersTableBody.innerHTML = '';
  orders.forEach(o => {
    const idShort = (o.id || '').slice(0,5) + '...';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${idShort}</td>
      <td>${o.customer_name || ''}</td>
      <td>${o.customer_address || ''}</td>
      <td>$${money(o.total_amount)}</td>
      <td><span class="order-status ${String(o.payment_status || '').toLowerCase()}">${o.payment_status || ''}</span></td>
      <td>${o.created_at ? new Date(o.created_at).toLocaleString() : ''}</td>
      <td>
        <button class="view-order-btn" data-id="${o.id}" title="Ver Detalle">
          <i class="fa-solid fa-eye"></i>
        </button>
      </td>
    `;
    ordersTableBody.appendChild(row);
  });
};

// --- Render contabilidad ---
const renderAccounting = () => {
  let list = [...orders];
  if (accountingStatus && accountingStatus.value) list = list.filter(o => o.order_status === accountingStatus.value);
  if (accountingPayment && accountingPayment.value) list = list.filter(o => o.payment_method === accountingPayment.value);
  if (accountingStart && accountingStart.value) {
    const start = new Date(accountingStart.value);
    list = list.filter(o => new Date(o.created_at) >= start);
  }
  if (accountingEnd && accountingEnd.value) {
    const end = new Date(accountingEnd.value);
    list = list.filter(o => new Date(o.created_at) <= end);
  }
  const minVal = parseInt(accountingMin?.value,10) || 0;
  const maxVal = parseInt(accountingMax?.value,10) || 0;
  if (minVal) list = list.filter(o => Number(o.total_amount || 0) >= minVal);
  if (maxVal) list = list.filter(o => Number(o.total_amount || 0) <= maxVal);

  filteredOrders = list;
  accountingTableBody.innerHTML = '';
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
  const header = ['ID','Cliente','Fecha','MetodoPago','Total','Estado'];
  const rows = filteredOrders.map(o => {
    const date = o.created_at ? new Date(o.created_at).toLocaleString() : '';
    const esc = v => `"${String(v || '').replace(/"/g,'""')}"`;
    return [esc(o.id), esc(o.customer_name), esc(date), esc(o.payment_method), esc(o.total_amount), esc(o.payment_status)].join(',');
  });
  const csv = [header.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'contabilidad.csv';
  link.click();
};

// --- Upload imagen ---
const uploadImage = async (file, category) => {
  try {
    const folder = (category || 'misc').toLowerCase().replace(/\s+/g,'-');
    const fileName = `${folder}/${Date.now()}-${file.name}`;
    const { error: upError } = await supabaseClient.storage.from('images').upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (upError) {
      console.error('Upload error', upError);
      return null;
    }
    const { data: publicUrlData } = supabaseClient.storage.from('images').getPublicUrl(fileName);
    return publicUrlData?.publicUrl || publicUrlData?.publicURL || null;
  } catch (err) {
    console.error(err);
    return null;
  }
};

// --- Fetchers ---
const fetchProducts = async () => {
  const { data, error } = await supabaseClient.from('products').select('*').order('name', { ascending: true });
  if (error) return console.error('Error cargar productos:', error.message || error);
  products = data || [];
  filterAndRenderProducts();
};

const fetchOrders = async () => {
  const { data, error } = await supabaseClient.from('orders').select('*').order('created_at', { ascending: false });
  if (error) return console.error('Error cargar pedidos:', error.message || error);
  orders = data || [];
  renderOrders();
  renderAccounting();
  updateOrderCountBadge();
};

// --- Realtime ---
const setupRealtimeListener = () => {
  // Escuchador para la tabla de productos
  supabaseClient
    .channel('public:products')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, payload => {
      const ev = payload.eventType;
      if (ev === 'INSERT') products.push(payload.new);
      else if (ev === 'UPDATE') {
        const i = products.findIndex(p => p.id === payload.new.id);
        if (i !== -1) products[i] = payload.new;
      } else if (ev === 'DELETE') {
        products = products.filter(p => p.id !== payload.old.id);
      }
      filterAndRenderProducts();
    })
    .subscribe();

  // Escuchador para la tabla de pedidos
  supabaseClient
    .channel('public:orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, payload => {
      const ev = payload.eventType;
      if (ev === 'INSERT') {
        // En el panel de administrador, solo queremos ver pedidos pendientes, por lo que solo los agregamos si el estado de pago es 'Confirmado'
        if (payload.new.payment_status === 'Confirmado') {
          orders.unshift(payload.new);
        }
      } else if (ev === 'UPDATE') {
        const idx = orders.findIndex(o => o.id === payload.new.id);
        // Si el estado de pago ya no es 'Confirmado' o el estado de la orden es 'Entregado', el pedido debe ser eliminado de la lista de pendientes.
        if (payload.new.payment_status !== 'Confirmado' || payload.new.order_status === 'Entregado') {
          if (idx !== -1) {
            orders.splice(idx, 1);
          }
        } else if (idx !== -1) {
          // Si el estado sigue siendo 'Confirmado', simplemente actualizamos el pedido en la lista.
          orders[idx] = payload.new;
        } else {
          // Si el pedido no estaba en la lista y ahora está confirmado, lo añadimos.
          if (payload.new.payment_status === 'Confirmado') {
            orders.unshift(payload.new);
          }
        }
      } else if (ev === 'DELETE') {
        orders = orders.filter(o => o.id !== payload.old.id);
      }
      renderOrders();
      renderAccounting();
      updateOrderCountBadge();
    })
    .subscribe();
};


// --- Abrir modal producto ---
addProductBtn?.addEventListener('click', () => {
  productForm.reset();
  productModalTitle.textContent = 'Agregar Nuevo Producto';
  document.getElementById('product-id').value = '';
  if (currentImageUrlInput) currentImageUrlInput.value = '';
  if (imagePreview) imagePreview.style.display = 'none';
  show(productModal);
});

// --- Previsualizar imagen ---
productImageInput?.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (!f) { if (imagePreview) imagePreview.style.display = 'none'; return; }
  const reader = new FileReader();
  reader.onload = (ev) => {
    if (imagePreview) { imagePreview.src = ev.target.result; imagePreview.style.display = 'block'; }
  };
  reader.readAsDataURL(f);
});

// --- Guardar producto ---
productForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('product-id').value || null;
  const name = document.getElementById('product-name').value.trim();
  const description = document.getElementById('product-description').value.trim();
  const category = document.getElementById('product-category').value.trim() || 'general';
  const price = parseInt(document.getElementById('product-price').value, 10) || 0;
  const stock = parseInt(document.getElementById('product-stock').value, 10) || 0;
  const featured = document.getElementById('product-featured').checked;
  const isOffer = document.getElementById('product-isOffer').checked;
  const bestSeller = document.getElementById('product-bestSeller').checked;
  let imageUrl = currentImageUrlInput?.value || null;

  const file = productImageInput.files?.[0];
  if (file) {
    const uploaded = await uploadImage(file, category);
    if (uploaded) imageUrl = uploaded;
    else return alert('Error subiendo imagen');
  }

  const productData = { name, description, category, price, stock, featured, isOffer, bestSeller, image: imageUrl ? [imageUrl] : [] };

  try {
    if (id) {
      await supabaseClient.from('products').update(productData).eq('id', id);
      alert('Producto actualizado.');
    } else {
      await supabaseClient.from('products').insert([productData]);
      alert('Producto creado.');
    }
    hide(productModal);
    fetchProducts();
  } catch (err) {
    console.error(err);
    alert('Error al guardar producto.');
  }
});

// --- Delegación eventos ---
document.addEventListener('click', async (e) => {
  // actualizar estado pedido
  const statusBtn = e.target.closest('.update-status-btn');
  if (statusBtn) {
    const orderId = statusBtn.dataset.id;
    const newStatus = statusBtn.dataset.status;
    await supabaseClient.from('orders').update({ order_status: newStatus }).eq('id', orderId);
    fetchOrders();
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
      price: Number(p?.price ?? p?.unit_price ?? 0),
      image: p?.image || null
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

  // cerrar modales
  if (e.target.closest('.close-btn')) {
    hide(productModal);
    hide(orderModal);
    return;
  }

  // editar producto
  const editBtn = e.target.closest('.edit-product-btn');
  if (editBtn) {
    const id = editBtn.dataset.id;
    const prod = products.find(p => p.id === id);
    if (!prod) return alert('Producto no encontrado.');
    productModalTitle.textContent = 'Modificar Producto';
    document.getElementById('product-id').value = prod.id;
    document.getElementById('product-name').value = prod.name || '';
    document.getElementById('product-description').value = prod.description || '';
    document.getElementById('product-category').value = prod.category || '';
    document.getElementById('product-price').value = prod.price || 0;
    document.getElementById('product-stock').value = prod.stock || 0;
    document.getElementById('product-featured').checked = !!prod.featured;
    document.getElementById('product-isOffer').checked = !!prod.isOffer;
    document.getElementById('product-bestSeller').checked = !!prod.bestSeller;
    currentImageUrlInput.value = (prod.image && prod.image[0]) || '';
    if (prod.image && prod.image[0]) {
      imagePreview.src = prod.image[0];
      imagePreview.style.display = 'block';
    } else {
      imagePreview.style.display = 'none';
    }
    show(productModal);
    return;
  }

  // eliminar producto
  const deleteBtn = e.target.closest('.delete-product-btn');
  if (deleteBtn) {
    const id = deleteBtn.dataset.id;
    if (!confirm('¿Seguro que deseas eliminar este producto?')) return;
    try {
      await supabaseClient.from('products').delete().eq('id', id);
      fetchProducts();
    } catch (err) {
      console.error(err);
      alert('Error eliminando producto.');
    }
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

// --- Buscador y filtros de productos ---
const filterAndRenderProducts = () => {
  let filtered = [...products];
  const stockFilter = productStockFilter.value;
  const searchQuery = productSearch.value.toLowerCase().trim();

  if (stockFilter === 'in_stock') {
    filtered = filtered.filter(p => (p.stock || 0) > 0);
  } else if (stockFilter === 'out_of_stock') {
    filtered = filtered.filter(p => (p.stock || 0) <= 0);
  }

  if (searchQuery) {
    filtered = filtered.filter(p =>
      (p.name || '').toLowerCase().includes(searchQuery) ||
      (p.description || '').toLowerCase().includes(searchQuery) ||
      (p.category || '').toLowerCase().includes(searchQuery) ||
      (p.id || '').toLowerCase().includes(searchQuery)
    );
  }

  renderProducts(filtered);
};

// Event listeners
productSearch?.addEventListener('input', filterAndRenderProducts);
productStockFilter?.addEventListener('change', filterAndRenderProducts);

// --- Contabilidad filtros ---
[accountingStatus, accountingPayment, accountingStart, accountingEnd, accountingMin, accountingMax].forEach(el => {
  el?.addEventListener('change', renderAccounting);
});
exportAccountingBtn?.addEventListener('click', exportAccounting);

// --- Refresh pedidos ---
refreshOrdersBtn?.addEventListener('click', fetchOrders);

// --- Badge pedidos ---
const updateOrderCountBadge = () => {
  const pending = orders.filter(o => (o.order_status||'').toLowerCase() !== 'despachado' && (o.order_status||'').toLowerCase() !== 'entregado').length;
  if (pending > 0) {
    orderCountBadge.textContent = pending;
    orderCountBadge.classList.remove('hidden');
  } else orderCountBadge.classList.add('hidden');
};

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  // Maneja el formulario de login y logout
  if(loginForm) loginForm.addEventListener('submit', handleLogin);
  if(logoutBtn) logoutBtn.addEventListener('click', handleLogout);
  navButtons.forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view + '-view')));

  // Revisa el estado de la autenticación al cargar
  checkAuth();
  
  try { if ('Notification' in window) Notification.requestPermission(); } catch (e) {}
});
(function(){
  const emojiMap = {
    'eye':'👁️','clock':'🕒','truck':'🚚','check':'✅',
    'pen-to-square':'✏️','trash':'🗑️','rotate':'🔁','plus':'➕',
    'boxes-stacked':'📦','box':'📦','boxes':'📦','receipt':'🧾',
    'calculator':'🧮','print':'🖨️','save':'💾','box-open':'📦',
    'file-export':'📤','file-arrow-up':'📤'
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
      // elegir clase fa-* que no sea fa-solid/fa-regular/fa-brands/fa/fas/far/fab
      const cls = Array.from(i.classList).find(c => c.startsWith('fa-') && !['fa-solid','fa-regular','fa-brands','fa-light','fa','fas','far','fab'].includes(c));
      const raw = cls ? cls.replace(/^fa-/, '') : null;
      const key = raw || Array.from(i.classList).find(c=>/fa-[a-z0-9-]+/i.test(c))?.replace(/^fa-/,'');
      const emoji = (key && (emojiMap[key] || emojiMap[key.split('-')[0]])) || '🔘';
      const span = document.createElement('span');
      span.className = 'icon-fallback';
      span.setAttribute('aria-hidden','true');
      span.textContent = emoji;
      // preservar atributos útiles
      if(i.title) span.title = i.title;
      // transferir data-* attrs
      Array.from(i.attributes).forEach(attr=>{
        if(attr.name.startsWith('data-')) span.setAttribute(attr.name, attr.value);
      });
      i.replaceWith(span);
    });
  }

  function init(){
    // si FA cargó, no hacemos nada
    if(faLoaded()) return;
    replaceIcons();
    // observar nodos nuevos (para tablas dinámicas)
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