
        // --- CONFIGURACIÓN DE SUPABASE ---
        const SUPABASE_URL = "https://nqjekbyyvqrevbcehhob.supabase.co"; // ¡Reemplaza con tu URL!
        const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xamVrYnl5dnFyZXZiY2VoaG9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg0MzE4MTEsImV4cCI6MjA3NDAwNzgxMX0.U-zb7wcX3qYeAoRH3MM2FVj9ZZzODsdvjj9wNWg_h74";
        const BASE_API_URL = `${SUPABASE_URL}/rest/v1`;
        const AUTH_API_URL = `${SUPABASE_URL}/auth/v1`;
        // Nombre del Bucket de Storage (Asume que existe uno llamado 'products')
        const STORAGE_BUCKET = "products";
        const STORAGE_API_URL = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}`;

        // --- ESTADO GLOBAL ---
        let currentUserId = null;
        let currentUserRole = null;
        let authToken = null;
        let productsData = []; 
        let carteraData = []; 
        let fileToUpload = null; // Archivo seleccionado para subir
        
        const DEFAULT_IMG_URL = "https://placehold.co/40x40/cccccc/000000?text=IMG";

        // --- FUNCIONES DE UTILIDAD ---

        const setView = (viewId, show) => {
            const element = document.getElementById(viewId);
            if (element) {
                element.style.display = show ? 'block' : 'none';
            }
        };

        // Se elimina la función showError ya que no debe haber alertas
        const logError = (message) => {
            const errorElement = document.getElementById('login-error');
            errorElement.textContent = message;
            errorElement.style.display = 'block';
            console.error("ERROR:", message);
            setTimeout(() => errorElement.style.display = 'none', 5000);
        };

        const convertToCSV = (data) => {
            if (data.length === 0) return '';
            
            const exportFields = ['id', 'customer_name', 'total_amount', 'created_at', 'order_status', 'payment_status'];
            const headersMap = {
                id: 'ID Orden',
                customer_name: 'Cliente',
                total_amount: 'Total',
                created_at: 'Fecha',
                order_status: 'Estado Orden',
                payment_status: 'Estado Pago'
            };
            
            const headers = exportFields.map(field => headersMap[field]).join(',');
            
            const rows = data.map(obj => exportFields.map(field => {
                let val = obj[field];
                if (field === 'total_amount') val = val.toLocaleString('es-CO');
                if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) return `"${val.replace(/"/g, '""')}"`;
                return val;
            }).join(','));
            
            return [headers, ...rows].join('\n');
        };

        // --- FUNCIÓN DE PETICIÓN GENÉRICA CON BACKOFF ---
        const makeRequest = async (url, options = {}, retries = 3) => {
            const headers = {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                ...options.headers
            };

            if (authToken) {
                headers['Authorization'] = `Bearer ${authToken}`;
            }

            const config = { ...options, headers };

            for (let i = 0; i < retries; i++) {
                try {
                    const response = await fetch(url, config);

                    if (response.ok) {
                        const contentType = response.headers.get("content-type");
                        if (contentType && contentType.includes("application/json")) {
                            return response.json();
                        }
                        return response.text().then(text => (text ? JSON.parse(text) : {}));
                    }

                    if (response.status === 401 || response.status === 403) {
                        throw new Error("Acceso denegado o sesión expirada.");
                    }

                    const errorText = await response.text();
                    throw new Error(`Error ${response.status}: ${errorText}`);

                } catch (error) {
                    if (i === retries - 1) {
                        throw error;
                    }
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
                }
            }
        };

        // --- FUNCIONES DE AUTENTICACIÓN Y VISTAS ---

        const handleLogin = async (role) => {
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            currentUserRole = role; 

            try {
                const response = await fetch(`${AUTH_API_URL}/token?grant_type=password`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_ANON_KEY,
                    },
                    body: JSON.stringify({ email, password })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error_description || "Credenciales incorrectas.");
                }

                const data = await response.json();
                authToken = data.access_token;
                currentUserId = data.user.id;
                localStorage.setItem('authToken', authToken);

                initUserView(role);

            } catch (error) {
                console.error("Fallo de autenticación:", error);
                logError(error.message || "Fallo en la conexión. Revisa las credenciales.");
                currentUserRole = null;
            }
        };

        const handleLogout = () => {
            authToken = null;
            currentUserId = null;
            currentUserRole = null;
            localStorage.removeItem('authToken');
            setView('header-nav', false);
            setView('content-views', false);
            document.querySelectorAll('.user-view').forEach(el => el.style.display = 'none');
            setView('login-view', true);
        };
        
        const initUserView = (role) => {
            setView('login-view', false);
            setView('header-nav', true);
            setView('content-views', true);
            
            const userInfo = document.getElementById('user-info');
            userInfo.textContent = `Rol: ${role.toUpperCase()}`;
            
            document.querySelectorAll('.user-view').forEach(el => el.style.display = 'none');
            const viewId = `${role}-view`;
            setView(viewId, true);

            switch (role) {
                case 'caja':
                    showCajaSection('productos');
                    document.getElementById('caja-btn-productos').onclick = () => showCajaSection('productos');
                    document.getElementById('caja-btn-pedidos').onclick = () => showCajaSection('pedidos');
                    break;
                case 'despacho':
                    loadOrdersDespacho();
                    break;
                case 'cartera':
                    loadOrdersCartera();
                    break;
            }
        };

        // --- FUNCIONES DE CAJA (products) ---

        const showCajaSection = (section) => {
            const prodSection = document.getElementById('caja-section-productos');
            const pedSection = document.getElementById('caja-section-pedidos');
            const btnProd = document.getElementById('caja-btn-productos');
            const btnPed = document.getElementById('caja-btn-pedidos');

            if (section === 'productos') {
                setView(prodSection.id, true);
                setView(pedSection.id, false);
                btnProd.classList.replace('bg-gray-200', 'bg-blue-500');
                btnProd.classList.replace('text-gray-800', 'text-white');
                btnPed.classList.replace('bg-blue-500', 'bg-gray-200');
                btnPed.classList.replace('text-white', 'text-gray-800');
                loadProducts(); 
            } else if (section === 'pedidos') {
                setView(prodSection.id, false);
                setView(pedSection.id, true);
                btnPed.classList.replace('bg-gray-200', 'bg-blue-500');
                btnPed.classList.replace('text-gray-800', 'text-white');
                btnProd.classList.replace('bg-blue-500', 'bg-gray-200');
                btnProd.classList.replace('text-white', 'text-gray-800');
                loadOrdersCaja(); 
            }
        };

        const loadProducts = async () => {
            const filters = [];
            const stockFilter = document.getElementById('stock-filter').value;
            const searchTerm = document.getElementById('product-search').value.toLowerCase();

            if (stockFilter === 'in_stock') filters.push('stock=gt.0');
            if (stockFilter === 'out_stock') filters.push('stock=eq.0');

            const selectFields = 'id,name,price,stock,isOffer,image,featured,bestSeller';
            const filterQuery = filters.length > 0 ? '&' + filters.join('&') : '';
            const url = `${BASE_API_URL}/products?select=${selectFields}${filterQuery}`;

            try {
                productsData = await makeRequest(url);

                let filteredData = productsData;
                if (searchTerm) {
                    filteredData = productsData.filter(p =>
                        p.name.toLowerCase().includes(searchTerm)
                    );
                }

                const tableHTML = generateProductTable(filteredData);
                document.getElementById('products-list').innerHTML = tableHTML;
                attachProductListeners();
            } catch (e) {
                document.getElementById('products-list').innerHTML = `<p class="text-red-500">Error al cargar productos: ${e.message}</p>`;
                console.error("Error al cargar productos:", e.message);
            }
        };

        const generateProductTable = (data) => {
            let html = `
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Imagen</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Precio</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Oferta</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
            `;
            data.forEach(p => {
                const imgUrl = (Array.isArray(p.image) && p.image.length > 0) ? p.image[0] : DEFAULT_IMG_URL;
                html += `
                    <tr class="hover:bg-gray-50">
                        <td class="px-3 py-4 whitespace-nowrap text-sm font-medium">
                            <img src="${imgUrl}" alt="Miniatura" class="w-10 h-10 object-cover rounded-md" onerror="this.src='${DEFAULT_IMG_URL}'">
                        </td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${p.name}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500">$${p.price}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm ${p.stock > 0 ? 'text-green-600' : 'text-red-600' }">${p.stock}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500">${p.isOffer ? 'Sí' : 'No'}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm font-medium">
                            <button data-id="${p.id}" data-action="edit" class="text-indigo-600 hover:text-indigo-900 mr-2">Editar</button>
                            <button data-id="${p.id}" data-action="delete" class="text-red-600 hover:text-red-900">Eliminar</button>
                        </td>
                    </tr>
                `;
            });
            html += `</tbody></table>`;
            return html;
        };

        const attachProductListeners = () => {
            document.querySelectorAll('#products-list button[data-action]').forEach(button => {
                button.onclick = async () => {
                    const id = button.getAttribute('data-id');
                    const action = button.getAttribute('data-action');
                    const [product] = await makeRequest(`${BASE_API_URL}/products?id=eq.${id}&select=*`);

                    if (action === 'delete') {
                        await deleteProduct(id);
                        loadProducts();
                    } else if (action === 'edit') {
                        showProductModal(product);
                    }
                };
            });
            document.getElementById('add-product-btn').onclick = () => showProductModal(null);
            document.getElementById('stock-filter').onchange = loadProducts;
            document.getElementById('product-search').oninput = loadProducts;
        };

        const deleteProduct = async (id) => {
            try {
                await makeRequest(`${BASE_API_URL}/products?id=eq.${id}`, { method: 'DELETE' });
                console.log(`Producto ${id} eliminado con éxito.`); 
            } catch (e) {
                console.error(`Error al eliminar producto ${id}: ${e.message}`);
                logError(`Error al eliminar producto.`);
            }
        };

        const showProductModal = (product) => {
            fileToUpload = null; // Reiniciar archivo
            const isNew = !product;
            document.getElementById('modal-title').textContent = isNew ? 'Añadir Nuevo Producto' : `Editar Producto: ${product.name}`;
            
            const currentImageUrl = (Array.isArray(product?.image) && product.image.length > 0) ? product.image[0] : '';

            document.getElementById('modal-body').innerHTML = `
                <div class="space-y-4">
                    <label class="block"><span class="text-gray-700">Nombre</span><input id="modal-name" value="${product?.name || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2"></label>
                    <label class="block"><span class="text-gray-700">Descripción</span><textarea id="modal-description" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2">${product?.description || ''}</textarea></label>
                    <label class="block"><span class="text-gray-700">Categoría</span><input id="modal-category" value="${product?.category || ''}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2"></label>
                    <label class="block"><span class="text-gray-700">Precio</span><input type="number" id="modal-price" value="${product?.price || 0}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2"></label>
                    <label class="block"><span class="text-gray-700">Stock</span><input type="number" id="modal-stock" value="${product?.stock || 0}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2"></label>
                    
                    <div class="pt-2 border-t">
                        <span class="text-gray-700 font-medium">Imagen del Producto:</span>
                        <p class="text-xs text-gray-500 mb-2" id="current-image-status">URL Actual: ${currentImageUrl || 'N/A'}</p>
                        <div class="flex items-center gap-3">
                            <input type="file" id="image-upload-input" accept="image/*" class="hidden">
                            <button id="select-image-btn" class="px-3 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600">Examinar</button>
                            <span id="selected-file-name" class="text-sm text-gray-600">Ningún archivo seleccionado.</span>
                        </div>
                    </div>

                    <div class="flex flex-wrap gap-4 pt-2 border-t">
                        <label class="flex items-center">
                            <input type="checkbox" id="modal-featured" ${product?.featured ? 'checked' : ''} class="mr-2 rounded border-gray-300 text-indigo-600 shadow-sm">
                            <span class="text-gray-700 font-medium">Destacado</span>
                        </label>
                        <label class="flex items-center">
                            <input type="checkbox" id="modal-isOffer" ${product?.isOffer ? 'checked' : ''} class="mr-2 rounded border-gray-300 text-indigo-600 shadow-sm">
                            <span class="text-gray-700 font-medium">En Oferta</span>
                        </label>
                        <label class="flex items-center">
                            <input type="checkbox" id="modal-bestSeller" ${product?.bestSeller ? 'checked' : ''} class="mr-2 rounded border-gray-300 text-indigo-600 shadow-sm">
                            <span class="text-gray-700 font-medium">Más Vendido</span>
                        </label>
                    </div>
                </div>
            `;
            document.getElementById('modal-actions').innerHTML = `
                <button id="save-product-btn" class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition duration-150">Guardar</button>
            `;
            
            // Event Listeners para la subida de imagen
            document.getElementById('select-image-btn').onclick = () => document.getElementById('image-upload-input').click();
            document.getElementById('image-upload-input').onchange = (e) => {
                fileToUpload = e.target.files[0];
                document.getElementById('selected-file-name').textContent = fileToUpload ? fileToUpload.name : 'Ningún archivo seleccionado.';
            };

            document.getElementById('save-product-btn').onclick = () => saveProduct(isNew, product?.id, currentImageUrl);
            setView('modal', true);
        };

        // Simulación de subida de imagen a Supabase Storage
        const uploadImage = async (file, id) => {
            if (!file) return null;

            const fileExt = file.name.split('.').pop();
            const filePath = `${id}-${Date.now()}.${fileExt}`;
            
            try {
                const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filePath}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'apikey': SUPABASE_ANON_KEY,
                        'Content-Type': file.type || 'image/jpeg',
                        'x-upsert': 'true'
                    },
                    body: file
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || "Fallo en la subida de imagen (Verifica las políticas de Storage).");
                }

                // URL pública del archivo
                return `${STORAGE_API_URL}/${filePath}`;

            } catch (e) {
                console.error("Error de subida:", e.message);
                throw new Error("Error al subir la imagen. Revisa el Bucket y las políticas de Storage.");
            }
        };

        const saveProduct = async (isNew, id, oldImageUrl) => {
            let imageUrl = oldImageUrl;

            // 1. Subir la nueva imagen si existe
            if (fileToUpload) {
                try {
                    // Usamos un ID temporal o el ID existente para el path del archivo
                    const tempId = id || crypto.randomUUID();
                    imageUrl = await uploadImage(fileToUpload, tempId);
                    if (!id) id = tempId;
                } catch (e) {
                    return logError(e.message);
                }
            }

            // 2. Preparar datos para la base de datos
            const data = {
                name: document.getElementById('modal-name').value,
                description: document.getElementById('modal-description').value,
                category: document.getElementById('modal-category').value,
                price: parseInt(document.getElementById('modal-price').value),
                stock: parseInt(document.getElementById('modal-stock').value),
                isOffer: document.getElementById('modal-isOffer').checked,
                featured: document.getElementById('modal-featured').checked,
                bestSeller: document.getElementById('modal-bestSeller').checked,
                image: imageUrl ? [imageUrl] : [] 
            };
            
            if (!data.name || isNaN(data.price) || isNaN(data.stock)) {
                return logError("Faltan campos obligatorios o los números son inválidos.");
            }

            // 3. Guardar en la tabla products
            try {
                if (isNew) {
                    await makeRequest(`${BASE_API_URL}/products`, { 
                        method: 'POST', 
                        body: JSON.stringify({...data, id: id})
                    });
                    console.log('Producto creado con éxito.');
                } else {
                    await makeRequest(`${BASE_API_URL}/products?id=eq.${id}`, { 
                        method: 'PATCH', 
                        body: JSON.stringify(data) 
                    });
                    console.log('Producto actualizado con éxito.');
                }
                setView('modal', false);
                loadProducts();
            } catch (e) {
                console.error(`Error al guardar producto: ${e.message}`);
                logError(`Error al guardar producto.`);
            }
        };

        // --- GESTIÓN DE ÓRDENES EN CAJA (orders) ---

        const loadOrdersCaja = async () => {
            const url = `${BASE_API_URL}/orders?select=*&order=created_at.desc&payment_status=eq.Pendiente`;

            try {
                const orders = await makeRequest(url);
                const tableHTML = generateOrderTableCaja(orders);
                document.getElementById('orders-list-caja').innerHTML = tableHTML;
                attachOrderCajaListeners();
            } catch (e) {
                document.getElementById('orders-list-caja').innerHTML = `<p class="text-red-500">Error al cargar órdenes pendientes: ${e.message}</p>`;
                console.error("Error al cargar órdenes pendientes:", e.message);
            }
        };

        const generateOrderTableCaja = (data) => {
            let html = `
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Orden</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado Pago</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
            `;
            data.forEach(o => {
                html += `
                    <tr class="hover:bg-gray-50">
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-900">${o.id.substring(0, 8)}...</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500">${o.customer_name}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm font-medium">$${o.total_amount}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500">${new Date(o.created_at).toLocaleDateString()}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-yellow-600">${o.payment_status}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm font-medium">
                            <button data-id="${o.id}" data-action="view" class="text-blue-600 hover:text-blue-800 mr-2">Detalle</button>
                            <button data-id="${o.id}" data-action="confirm" class="text-green-600 hover:text-green-800 mr-2">Confirmar</button>
                            <button data-id="${o.id}" data-action="reject" class="text-red-600 hover:text-red-800">Rechazar</button>
                        </td>
                    </tr>
                `;
            });
            html += `</tbody></table>`;
            return html;
        };

        const attachOrderCajaListeners = () => {
            document.querySelectorAll('#orders-list-caja button[data-action]').forEach(button => {
                button.onclick = async () => {
                    const id = button.getAttribute('data-id');
                    const action = button.getAttribute('data-action');
                    
                    // Se obtiene la orden al inicio para reutilizar en todas las acciones
                    const [order] = await makeRequest(`${BASE_API_URL}/orders?id=eq.${id}&select=*`);
                    
                    if (!order) {
                        console.error(`Orden ${id} no encontrada.`);
                        logError(`Orden no encontrada.`);
                        loadOrdersCaja();
                        return;
                    }

                    if (action === 'view') {
                        showOrderDetailModal(order);
                        return; // No se recarga la lista al solo ver el detalle
                    }

                    if (action === 'confirm') {
                         await updateProductStock(order.order_items, 'subtract');
                         await confirmOrder(id);
                    } else if (action === 'reject') {
                        await rejectOrder(id);
                    }
                    
                    loadOrdersCaja(); // Recargar solo si se confirma o rechaza
                };
            });
        };
        
        // Nueva función para actualizar stock
        const updateProductStock = async (items, operation) => {
            for (const item of items) {
                const quantity = item.quantity || 1;
                const productId = item.id;
                
                // Obtener el stock actual del producto
                const [product] = await makeRequest(`${BASE_API_URL}/products?id=eq.${productId}&select=stock`);
                if (!product) {
                    console.warn(`Producto ${productId} no encontrado, stock no actualizado.`);
                    continue;
                }

                let newStock;
                if (operation === 'subtract') {
                    newStock = Math.max(0, product.stock - quantity);
                } else if (operation === 'add') {
                    newStock = product.stock + quantity;
                } else {
                    continue;
                }

                try {
                    await makeRequest(`${BASE_API_URL}/products?id=eq.${productId}`, {
                        method: 'PATCH',
                        body: JSON.stringify({ stock: newStock })
                    });
                    console.log(`Stock de producto ${productId} actualizado a ${newStock}.`);
                } catch (e) {
                    console.error(`Fallo al actualizar stock de ${productId}: ${e.message}`);
                    logError(`Fallo al actualizar stock.`);
                }
            }
        };


        // Función de confirmación modificada para usar el trigger
        const confirmOrder = async (orderId) => {
            try {
                const updateData = {
                    payment_status: "Confirmado",
                    order_status: "Pendiente"
                };
                
                await makeRequest(`${BASE_API_URL}/orders?id=eq.${orderId}`, {
                    method: 'PATCH',
                    body: JSON.stringify(updateData)
                });
                
                console.log(`Orden ${orderId.substring(0, 8)}... confirmada y movida (por el trigger SQL).`);
            } catch (e) {
                console.error(`Error al confirmar la orden: ${e.message}`);
                logError(`Error al confirmar la orden.`);
            }
        };

        const rejectOrder = async (orderId) => {
            try {
                await makeRequest(`${BASE_API_URL}/orders?id=eq.${orderId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ payment_status: "Rechazado" })
                });
                console.log(`Orden ${orderId.substring(0, 8)}... rechazada.`);
            } catch (e) {
                console.error(`Error al rechazar la orden: ${e.message}`);
                logError(`Error al rechazar la orden.`);
            }
        };


        // --- FUNCIONES DE DESPACHO (orders_confirmed) ---

        const loadOrdersDespacho = async () => {
            const url = `${BASE_API_URL}/orders_confirmed?select=*&order=created_at.asc&order_status=neq.Despachado`;

            try {
                const orders = await makeRequest(url);
                const tableHTML = generateOrderTableDespacho(orders);
                document.getElementById('orders-list-despacho').innerHTML = tableHTML;
                attachOrderDespachoListeners(orders);
            } catch (e) {
                document.getElementById('orders-list-despacho').innerHTML = `<p class="text-red-500">Error al cargar órdenes para despacho: ${e.message}</p>`;
                console.error("Error al cargar órdenes para despacho:", e.message);
            }
        };

        const generateOrderTableDespacho = (data) => {
            let html = `
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Orden</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado Orden</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
            `;
            data.forEach(o => {
                html += `
                    <tr class="hover:bg-gray-50" data-id="${o.id}">
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-900">${o.id.substring(0, 8)}...</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500">${o.customer_name}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm font-medium">$${o.total_amount}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500">${new Date(o.created_at).toLocaleDateString()}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-orange-600">${o.order_status}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm font-medium">
                            <button data-id="${o.id}" data-action="view" class="text-blue-600 hover:text-blue-800 mr-2">Detalle</button>
                            <button data-id="${o.id}" data-action="dispatch" class="text-green-600 hover:text-green-800">Despachar</button>
                        </td>
                    </tr>
                `;
            });
            html += `</tbody></table>`;
            return html;
        };

        const attachOrderDespachoListeners = (orders) => {
            document.querySelectorAll('#orders-list-despacho button[data-action]').forEach(button => {
                button.onclick = async () => {
                    const id = button.getAttribute('data-id');
                    const action = button.getAttribute('data-action');
                    const order = orders.find(o => o.id === id);

                    if (action === 'dispatch') {
                        await dispatchOrder(id);
                    } else if (action === 'view') {
                        showOrderDetailModal(order);
                    }
                };
            });
        };

        const dispatchOrder = async (orderId) => {
            try {
                await makeRequest(`${BASE_API_URL}/orders_confirmed?id=eq.${orderId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ order_status: "Despachado" })
                });
                console.log(`Orden ${orderId.substring(0, 8)}... marcada como Despachada.`);
                loadOrdersDespacho();
            } catch (e) {
                console.error(`Error al despachar orden ${orderId}: ${e.message}`);
                logError(`Error al despachar la orden.`);
            }
        };

        const showOrderDetailModal = (order) => {
            document.getElementById('modal-title').textContent = `Detalle de Orden #${order.id.substring(0, 8)}`;

            let totalItemsCount = 0;
            let subtotalItemsPrice = 0;

            let itemsHtml = order.order_items.map(item => {
                const itemQuantity = item.quantity || 1; 
                const itemPrice = item.price || 0;
                const itemTotal = itemPrice * itemQuantity;
                totalItemsCount += itemQuantity;
                subtotalItemsPrice += itemTotal;

                return `
                    <li class="py-1 border-b border-gray-100">
                        <div class="flex justify-between">
                            <span class="text-gray-700 font-medium">(${itemQuantity}x) ${item.name}</span>
                            <span class="font-semibold">$${itemTotal}</span>
                        </div>
                    </li>
                `;
            }).join('');
            
            const finalTotal = order.total_amount || subtotalItemsPrice;


            document.getElementById('modal-body').innerHTML = `
                <div class="space-y-2">
                    <p><span class="font-semibold">Cliente:</span> ${order.customer_name}</p>
                    <p><span class="font-semibold">Dirección:</span> ${order.customer_address}</p>
                
                <h4 class="font-bold mt-4 mb-2 text-lg border-b">Productos: Total ${totalItemsCount} ítems</h4>
                <ul class="list-none pl-0 mb-4">${itemsHtml}</ul>
                
                <div class="text-right font-extrabold text-xl pt-2 border-t mt-4">
                    <p class="text-sm font-normal text-gray-600">Total de ítems: $${subtotalItemsPrice}</p>
                    <p class="mt-1">Total Final: <span class="text-red-600">$${finalTotal}</span></p>
                </div>
            `;
            document.getElementById('modal-actions').innerHTML = `
                <button id="print-order-btn" class="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition duration-150">Imprimir Factura</button>
            `;
            document.getElementById('print-order-btn').onclick = () => printOrder(order);
            setView('modal', true);
        };
        
        // --- FUNCIONES DE CARTERA (Histórico) ---

        const printOrder = (order) => {
            const printArea = document.getElementById('print-area');
            let itemsText = order.order_items.map(item =>
                `<div>(${item.quantity || 1}x) ${item.name} -> $${(item.price || 0) * (item.quantity || 1)}</div>`
            ).join('');

            printArea.innerHTML = `
                <div class="text-center font-bold mb-2">FACTURA DE VENTA</div>
                <div class="mb-2">--------------------------------</div>
                <div>Orden ID: ${order.id.substring(0, 8)}</div>
                <div>Fecha: ${new Date(order.created_at).toLocaleString()}</div>
                <div>Cliente: ${order.customer_name}</div>
                <div>Pago: ${order.payment_method}</div>
                <div>--------------------------------</div>
                <div class="font-bold">DETALLE:</div>
                ${itemsText}
                <div>--------------------------------</div>
                <div class="text-right font-bold">TOTAL: $${order.total_amount}</div>
                <div class="mt-4 text-center">¡Gracias por su compra!</div>
            `;
            printArea.classList.remove('hidden');
            window.print();
            printArea.classList.add('hidden');
        };

        const loadOrdersCartera = async () => {
            const url = `${BASE_API_URL}/orders_confirmed?select=*&order=created_at.desc`;

            try {
                carteraData = await makeRequest(url);
                renderOrdersCartera(carteraData);
            } catch (e) {
                document.getElementById('orders-list-cartera').innerHTML = `<p class="text-red-500">Error al cargar datos contables: ${e.message}</p>`;
                console.error("Error al cargar datos contables:", e.message);
            }
        };

        const renderOrdersCartera = (data) => {
            const tableHTML = generateOrderTableCartera(data);
            document.getElementById('orders-list-cartera').innerHTML = tableHTML;
            
            const totalVendido = data.reduce((sum, order) => sum + (order.total_amount || 0), 0);
            document.getElementById('cartera-total').textContent = `Costo Total Vendido: $${totalVendido.toLocaleString('es-CO')}`;
        };

        const generateOrderTableCartera = (data) => {
            let html = `
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID Orden</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado Orden</th>
                            <th class="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado Pago</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
            `;
            data.forEach(o => {
                html += `
                    <tr class="hover:bg-gray-50">
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-900">${o.id.substring(0, 8)}...</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500">${o.customer_name}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm font-medium">$${o.total_amount.toLocaleString('es-CO')}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-gray-500">${new Date(o.created_at).toLocaleDateString()}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-orange-600">${o.order_status}</td>
                        <td class="px-3 py-4 whitespace-nowrap text-sm text-green-600">${o.payment_status}</td>
                    </tr>
                `;
            });
            html += `</tbody></table>`;
            return html;
        };

        const applyCarteraFilters = () => {
            const dateFromStr = document.getElementById('date-from').value;
            const dateToStr = document.getElementById('date-to').value;
            const searchTerm = document.getElementById('cartera-search').value.toLowerCase();

            let filteredData = carteraData;

            if (dateFromStr) {
                const dateFrom = new Date(dateFromStr);
                filteredData = filteredData.filter(o => new Date(o.created_at) >= dateFrom);
            }
            if (dateToStr) {
                const dateTo = new Date(dateToStr);
                dateTo.setDate(dateTo.getDate() + 1);
                filteredData = filteredData.filter(o => new Date(o.created_at) < dateTo);
            }

            if (searchTerm) {
                filteredData = filteredData.filter(o =>
                    o.customer_name.toLowerCase().includes(searchTerm) ||
                    o.id.toLowerCase().includes(searchTerm) ||
                    o.customer_address.toLowerCase().includes(searchTerm)
                );
            }

            renderOrdersCartera(filteredData);
        };

        const exportCarteraToCSV = () => {
            const dataToExport = carteraData;
            
            const totalVendido = dataToExport.reduce((sum, order) => sum + (order.total_amount || 0), 0);
            
            let csv = convertToCSV(dataToExport);
            csv += `\n\nTotal Vendido:,${totalVendido}`;

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.setAttribute('download', 'reporte_cartera.csv');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };


        // --- EVENT LISTENERS GENERALES ---

        document.addEventListener('DOMContentLoaded', () => {
            document.querySelectorAll('.login-button').forEach(button => {
                button.onclick = () => handleLogin(button.getAttribute('data-role'));
            });

            document.getElementById('logout-button').onclick = handleLogout;
            document.getElementById('apply-cartera-filters').onclick = applyCarteraFilters;
            document.getElementById('export-cartera-btn').onclick = exportCarteraToCSV;
            document.getElementById('close-modal').onclick = () => setView('modal', false);

            if (localStorage.getItem('authToken')) {
                handleLogout();
            } else {
                setView('login-view', true);
            }
        });
