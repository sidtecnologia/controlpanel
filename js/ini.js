/* Base y Tipografía */
:root {
    --primary-color: #007bff; /* Azul vibrante */
    --secondary-color: #28a745; /* Verde para hover */
    --text-color: #333;
    --bg-color: #f8f9fa;
    --card-bg: #fff;
    --shadow-light: rgba(0, 0, 0, 0.1);
    --shadow-strong: rgba(0, 0, 0, 0.2);
}

* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background-color: var(--bg-color);
    color: var(--text-color);
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    line-height: 1.6;
}

/* Encabezado */
.header {
    background-color: var(--primary-color);
    color: white;
    padding: 40px 20px;
    text-align: center;
    box-shadow: 0 4px 6px var(--shadow-light);
}

.header h1 {
    margin-bottom: 10px;
    font-size: 2.5em;
}

/* Contenido Principal (Uso de Flexbox para centrar) */
.main-content {
    flex-grow: 1; /* Permite que ocupe el espacio restante */
    display: flex;
    justify-content: center; /* Centrar horizontalmente */
    align-items: center; /* Centrar verticalmente */
    padding: 50px 20px;
}

/* Contenedor de Tarjetas */
.user-cards-container {
    display: flex;
    gap: 30px; /* Espacio entre las tarjetas/botones */
    max-width: 1200px;
    width: 100%;
    /* Efecto inicial de perspectiva para el contenedor */
    perspective: 1000px; 
}

/* Estilos de las Tarjetas/Botones */
.user-card {
    flex: 1; /* Ocupan igual espacio */
    background-color: var(--card-bg);
    border-radius: 12px;
    padding: 30px;
    text-align: center;
    text-decoration: none; /* Quitar subrayado del enlace */
    color: var(--text-color);
    
    /* Animación profesional: transiciones suaves */
    transition: transform 0.4s ease-out, box-shadow 0.4s ease-out, background-color 0.4s;
    
    /* Sombra inicial suave */
    box-shadow: 0 10px 20px var(--shadow-light);
    
    /* Configuración inicial para el efecto 3D */
    transform: translateZ(0); 
}

/* Animación: Efecto Hover (Dinámico y Profesional) */
.user-card:hover {
    /* Efecto "levantar" y 3D sutil (más dinámico) */
    transform: translateY(-10px) rotateX(2deg) scale(1.02) translateZ(50px); 
    
    /* Sombra más marcada */
    box-shadow: 0 25px 50px var(--shadow-strong);
    
    /* Cambio sutil de fondo */
    background-color: #e9ecef;
}

/* Icono dentro de la Tarjeta */
.card-icon {
    font-size: 4em;
    margin-bottom: 10px;
}

.card-title {
    font-size: 1.5em;
    margin-bottom: 5px;
    color: var(--primary-color);
}

.card-description {
    color: #6c757d;
    font-size: 0.9em;
}

/* Pie de Página */
.footer {
    padding: 15px 20px;
    text-align: center;
    background-color: #343a40;
    color: #adb5bd;
    font-size: 0.85em;
}

/* Media Queries para Responsividad (Esencial para una landing profesional) */
@media (max-width: 768px) {
    .user-cards-container {
        flex-direction: column; /* Apilar en pantallas pequeñas */
        gap: 20px;
    }

    .user-card {
        padding: 25px;
    }
    
    .user-card:hover {
        /* Simplificar el hover en móviles */
        transform: translateY(-5px); 
    }

    .header h1 {
        font-size: 2em;
    }
}