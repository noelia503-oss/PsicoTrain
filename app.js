/**
 * PsicoTrain - Aplicación Interactiva de Psicotécnicos
 * Lógica principal de la aplicación
 */

// Estado global de la aplicación
const state = {
    exercises: {},           // Base de datos de ejercicios
    answers: {},            // Respuestas correctas
    currentCategory: null,   // Categoría actual
    currentExercise: null,   // Ejercicio actual
    currentPage: 1,          // Página actual
    zoomLevel: 1,           // Nivel de zoom
    stats: {
        correct: 0,
        incorrect: 0
    },
    answeredPages: {},       // Páginas ya respondidas {exerciseName: {page: answer}}
    // Estado de dibujo
    drawing: {
        enabled: false,
        tool: 'pen',          // 'pen', 'highlighter', 'eraser'
        color: '#ef4444',
        brushSize: 4,
        isDrawing: false,
        lastX: 0,
        lastY: 0,
        ctx: null,
        canvas: null,
        savedDrawings: {}     // Guardar dibujos por ejercicio/página
    },
    sidebarCollapsed: false,  // Estado de la barra lateral
    stopwatch: {
        seconds: 0,
        timerId: null,
        isRunning: false
    },
    exerciseNotes: {}      // Notas por ejercicio {exerciseName: "nota"}
};

// Iconos para categorías
const categoryIcons = {
    "Percepción": "👁️",
    "Razonamiento Abstracto": "🧩",
    "Razonamiento Espacial": "📐",
    "Verbal": "📝"
};

// Inicialización
document.addEventListener('DOMContentLoaded', async () => {
    console.log('PsicoTrain: Iniciando aplicación...');

    // Inicializar barra lateral inmediatamente
    initSidebar();

    await loadData();
    renderCategories();
    loadStats();
    loadPageAnswers();
    loadSavedDrawings();
    loadExerciseNotes(); // Cargar notas desde localStorage

    // Inicializar listeners de notas
    initNotesListeners();

    // Registrar Service Worker para modo offline
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => console.log('Service Worker registrado:', reg.scope))
                .catch(err => console.error('Error al registrar Service Worker:', err));
        });
    }
});


/**
 * Carga los datos de ejercicios y respuestas
 */
async function loadData() {
    try {
        // Cargar ejercicios
        const exercisesResponse = await fetch('data/exercises.json');
        if (exercisesResponse.ok) {
            state.exercises = await exercisesResponse.json();
        } else {
            console.warn('No se encontró exercises.json');
            showNotification('Ejecuta primero el script de extracción de PDFs', 'warning');
        }

        // Cargar respuestas
        const answersResponse = await fetch('data/answers.json');
        if (answersResponse.ok) {
            state.answers = await answersResponse.json();
        }
    } catch (error) {
        console.error('Error cargando datos:', error);
    }
}

/**
 * Renderiza las categorías en el sidebar
 */
function renderCategories() {
    const categoriesList = document.getElementById('categoriesList');
    categoriesList.innerHTML = '';

    Object.keys(state.exercises).forEach(category => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.innerHTML = `
            <span class="category-icon">${categoryIcons[category] || '📁'}</span>
            <span>${category}</span>
        `;
        button.onclick = () => selectCategory(category);
        li.appendChild(button);
        categoriesList.appendChild(li);
    });
}

/**
 * Selecciona una categoría
 */
function selectCategory(category) {
    state.currentCategory = category;
    state.currentExercise = null;

    // Actualizar navegación activa
    document.querySelectorAll('.categories-nav button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.includes(category)) {
            btn.classList.add('active');
        }
    });

    // Actualizar breadcrumb
    document.getElementById('breadcrumb').innerHTML = `
        <strong>${categoryIcons[category]} ${category}</strong>
    `;

    // Mostrar lista de ejercicios
    showScreen('exerciseListScreen');
    renderExerciseList();
}

/**
 * Vuelve a la lista de ejercicios de la categoría actual
 */
function goBackToList() {
    stopTimer(); // Parar cronómetro si está activo
    showScreen('exerciseListScreen');
}

/**
 * Renderiza la lista de ejercicios de la categoría actual
 */
function renderExerciseList() {
    const grid = document.getElementById('exerciseGrid');
    grid.innerHTML = '';

    const exercises = state.exercises[state.currentCategory] || [];

    exercises.forEach(exercise => {
        const card = document.createElement('div');
        card.className = 'exercise-card';

        // Calcular progreso
        const answered = state.answeredPages[exercise.name] || {};
        const answeredCount = Object.keys(answered).length;
        const progress = exercise.total_pages > 0
            ? Math.round((answeredCount / exercise.total_pages) * 100)
            : 0;

        card.innerHTML = `
            <h3>
                <span class="exercise-icon">📄</span>
                ${exercise.name}
            </h3>
            <p class="pages-count">${exercise.total_pages} páginas</p>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
        `;

        card.onclick = () => selectExercise(exercise);
        grid.appendChild(card);
    });
}

/**
 * Selecciona un ejercicio y muestra el visor
 */
function selectExercise(exercise) {
    state.currentExercise = exercise;
    state.currentPage = 1;
    state.zoomLevel = 1;

    // Actualizar breadcrumb
    document.getElementById('breadcrumb').innerHTML = `
        <span>${categoryIcons[state.currentCategory]} ${state.currentCategory}</span>
        <span> › </span>
        <strong>${exercise.name}</strong>
    `;

    showScreen('exerciseViewerScreen');

    // Reiniciar y empezar cronómetro
    state.stopwatch.seconds = 0;
    updateStopwatchDisplay();
    startTimer();

    // Cargar nota del ejercicio
    loadCurrentExerciseNote();

    loadPage();
}

/**
 * Carga la página actual del ejercicio
 */
function loadPage() {
    const exercise = state.currentExercise;
    if (!exercise) return;

    const page = exercise.pages[state.currentPage - 1];
    if (page) {
        const img = document.getElementById('exerciseImage');
        img.src = page.path;
        img.style.transform = `scale(${state.zoomLevel})`;
    }

    // Actualizar indicador de página
    document.getElementById('pageIndicator').textContent =
        `Página ${state.currentPage} de ${exercise.total_pages}`;

    // Actualizar botones de navegación
    document.getElementById('prevPageBtn').disabled = state.currentPage <= 1;
    document.getElementById('nextPageBtn').disabled = state.currentPage >= exercise.total_pages;

    // Renderizar panel de respuestas
    renderAnswersPanel();
}

/**
 * Renderiza el panel de respuestas con lista numerada
 * Las respuestas son GLOBALES para todo el ejercicio (no cambian entre páginas)
 */
function renderAnswersPanel() {
    const answersList = document.getElementById('answersList');
    if (!answersList) return;

    const exerciseName = state.currentExercise.name;

    // Obtener respuestas guardadas para este ejercicio (GLOBAL, no por página)
    const savedAnswers = getExerciseAnswers(exerciseName);

    // Obtener número de preguntas configuradas (default 10)
    const numQuestions = state.questionsPerPage || 10;

    let html = '';
    for (let i = 1; i <= numQuestions; i++) {
        const savedAnswer = savedAnswers[i] || null;
        html += `
            <div class="question-row">
                <span class="question-num">${i}:</span>
                <div class="question-options">
                    ${['A', 'B', 'C', 'D', 'E'].map(opt => `
                        <button class="option-btn ${savedAnswer === opt ? 'selected' : ''}" 
                                data-question="${i}" 
                                data-option="${opt}"
                                onclick="selectOption(${i}, '${opt}')">
                            ${opt}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    answersList.innerHTML = html;
    document.getElementById('questionCount').textContent = `${numQuestions} preguntas`;
}

/**
 * Selecciona una opción de respuesta (GLOBAL para todo el ejercicio)
 */
function selectOption(questionNum, option) {
    const exerciseName = state.currentExercise.name;

    // Inicializar estructura si no existe
    if (!state.pageAnswers) state.pageAnswers = {};
    if (!state.pageAnswers[exerciseName]) state.pageAnswers[exerciseName] = {};

    // Toggle: si ya está seleccionada, deseleccionar
    const currentAnswer = state.pageAnswers[exerciseName][questionNum];
    if (currentAnswer === option) {
        delete state.pageAnswers[exerciseName][questionNum];
    } else {
        state.pageAnswers[exerciseName][questionNum] = option;
    }

    // Actualizar UI
    updateOptionUI(questionNum, option, currentAnswer !== option);

    // Guardar
    savePageAnswers();
}

/**
 * Actualiza la UI de una opción
 */
function updateOptionUI(questionNum, option, isSelected) {
    // Quitar selección de todas las opciones de esta pregunta
    document.querySelectorAll(`.option-btn[data-question="${questionNum}"]`).forEach(btn => {
        btn.classList.remove('selected');
    });

    // Añadir selección si corresponde
    if (isSelected) {
        const btn = document.querySelector(`.option-btn[data-question="${questionNum}"][data-option="${option}"]`);
        if (btn) btn.classList.add('selected');
    }
}

/**
 * Obtiene respuestas guardadas para un ejercicio (GLOBAL)
 */
function getExerciseAnswers(exerciseName) {
    if (!state.pageAnswers) return {};
    return state.pageAnswers[exerciseName] || {};
}

/**
 * Guarda las respuestas en localStorage
 */
function savePageAnswers() {
    try {
        localStorage.setItem('psicotrain_page_answers', JSON.stringify(state.pageAnswers || {}));
    } catch (e) {
        console.warn('Error guardando respuestas');
    }
}

/**
 * Carga las respuestas desde localStorage
 */
function loadPageAnswers() {
    try {
        const saved = localStorage.getItem('psicotrain_page_answers');
        if (saved) {
            state.pageAnswers = JSON.parse(saved);
        }
    } catch (e) {
        console.warn('Error cargando respuestas');
    }
}

/**
 * Limpia todas las respuestas del ejercicio actual
 */
function clearPageAnswers() {
    const exerciseName = state.currentExercise?.name;

    if (state.pageAnswers?.[exerciseName]) {
        state.pageAnswers[exerciseName] = {};
        savePageAnswers();
        renderAnswersPanel();
        showNotification('Respuestas limpiadas', 'info');
    }
}

/**
 * Añade más preguntas al panel
 */
function addMoreQuestions() {
    state.questionsPerPage = (state.questionsPerPage || 10) + 5;
    renderAnswersPanel();
}

/**
 * Verifica si la página ya fue respondida
 */
function checkPreviousAnswer() {
    const exerciseName = state.currentExercise.name;
    const pageKey = String(state.currentPage);

    if (state.answeredPages[exerciseName] && state.answeredPages[exerciseName][pageKey]) {
        const previousAnswer = state.answeredPages[exerciseName][pageKey];
        const btn = document.querySelector(`.answer-btn[data-answer="${previousAnswer.selected}"]`);
        if (btn) {
            btn.classList.add(previousAnswer.wasCorrect ? 'correct' : 'incorrect');
        }

        // Si la respuesta fue incorrecta, mostrar la correcta
        if (!previousAnswer.wasCorrect && previousAnswer.correct) {
            const correctBtn = document.querySelector(`.answer-btn[data-answer="${previousAnswer.correct}"]`);
            if (correctBtn) {
                correctBtn.classList.add('correct');
            }
        }
    }
}

/**
 * Selecciona una respuesta
 */
function selectAnswer(answer) {
    const exerciseName = state.currentExercise.name;
    const categoryName = state.currentCategory;
    const pageKey = String(state.currentPage);

    // Verificar si ya se respondió
    if (state.answeredPages[exerciseName] && state.answeredPages[exerciseName][pageKey]) {
        showNotification('Ya has respondido esta pregunta', 'info');
        return;
    }

    // Obtener respuesta correcta
    let correctAnswer = null;
    if (state.answers[categoryName] &&
        state.answers[categoryName][exerciseName] &&
        state.answers[categoryName][exerciseName][pageKey]) {
        correctAnswer = state.answers[categoryName][exerciseName][pageKey].toUpperCase();
    }

    // Marcar el botón seleccionado
    const selectedBtn = document.querySelector(`.answer-btn[data-answer="${answer}"]`);

    // Determinar si es correcto
    const isCorrect = correctAnswer ? (answer === correctAnswer) : null;

    if (isCorrect === true) {
        selectedBtn.classList.add('correct');
        showFeedback(true, '¡Correcto! 🎉');
        state.stats.correct++;
    } else if (isCorrect === false) {
        selectedBtn.classList.add('incorrect');
        showFeedback(false, `Incorrecto. La respuesta era: ${correctAnswer}`);
        state.stats.incorrect++;

        // Mostrar la respuesta correcta
        const correctBtn = document.querySelector(`.answer-btn[data-answer="${correctAnswer}"]`);
        if (correctBtn) {
            correctBtn.classList.add('correct');
        }
    } else {
        // No hay respuesta registrada
        selectedBtn.classList.add('selected');
        showFeedback(null, 'Sin respuesta registrada para esta página');
    }

    // Guardar respuesta
    if (!state.answeredPages[exerciseName]) {
        state.answeredPages[exerciseName] = {};
    }
    state.answeredPages[exerciseName][pageKey] = {
        selected: answer,
        correct: correctAnswer,
        wasCorrect: isCorrect
    };

    // Actualizar estadísticas
    saveStats();
    updateStatsDisplay();
}

/**
 * Muestra el feedback de la respuesta
 */
function showFeedback(isCorrect, message) {
    const feedback = document.getElementById('feedback');
    feedback.classList.remove('hidden', 'correct', 'incorrect');

    if (isCorrect === true) {
        feedback.classList.add('correct');
        feedback.innerHTML = `<span class="feedback-icon">✅</span><span class="feedback-text">${message}</span>`;
    } else if (isCorrect === false) {
        feedback.classList.add('incorrect');
        feedback.innerHTML = `<span class="feedback-icon">❌</span><span class="feedback-text">${message}</span>`;
    } else {
        feedback.innerHTML = `<span class="feedback-icon">ℹ️</span><span class="feedback-text">${message}</span>`;
    }
}

/**
 * Muestra la solución
 */
function showSolution() {
    const exerciseName = state.currentExercise.name;
    const categoryName = state.currentCategory;
    const pageKey = String(state.currentPage);

    let correctAnswer = null;
    if (state.answers[categoryName] &&
        state.answers[categoryName][exerciseName] &&
        state.answers[categoryName][exerciseName][pageKey]) {
        correctAnswer = state.answers[categoryName][exerciseName][pageKey].toUpperCase();
    }

    if (correctAnswer) {
        const correctBtn = document.querySelector(`.answer-btn[data-answer="${correctAnswer}"]`);
        if (correctBtn) {
            correctBtn.classList.add('correct');
        }
        showNotification(`La respuesta correcta es: ${correctAnswer}`, 'success');
    } else {
        showNotification('No hay respuesta registrada para esta página', 'info');
    }
}

/**
 * Página anterior
 */
function prevPage() {
    if (state.currentPage > 1) {
        state.currentPage--;
        loadPage();
    }
}

/**
 * Página siguiente
 */
function nextPage() {
    if (state.currentPage < state.currentExercise.total_pages) {
        state.currentPage++;
        loadPage();
    }
}

/**
 * Control de zoom - Incrementos suaves
 */
function zoomIn() {
    state.zoomLevel = Math.min(state.zoomLevel + 0.1, 4);
    state.zoomLevel = Math.round(state.zoomLevel * 10) / 10; // Evitar decimales raros
    updateZoom();
}

function zoomOut() {
    state.zoomLevel = Math.max(state.zoomLevel - 0.1, 0.2);
    state.zoomLevel = Math.round(state.zoomLevel * 10) / 10;
    updateZoom();
}

function resetZoom() {
    state.zoomLevel = 1;
    updateZoom();
}

function updateZoom() {
    const img = document.getElementById('exerciseImage');
    const canvas = document.getElementById('drawingCanvas');
    const wrapper = document.getElementById('imageWrapper');

    if (img) {
        img.style.transform = `scale(${state.zoomLevel})`;
        img.style.transformOrigin = 'top left';
    }

    if (canvas) {
        canvas.style.transform = `scale(${state.zoomLevel})`;
        canvas.style.transformOrigin = 'top left';
    }

    // Ajustar tamaño del wrapper para scroll correcto
    if (wrapper && img.naturalWidth) {
        wrapper.style.width = (img.naturalWidth * state.zoomLevel) + 'px';
        wrapper.style.height = (img.naturalHeight * state.zoomLevel) + 'px';
    }
}

// Zoom con rueda del ratón - Con debounce para trackpad menos sensible
let zoomTimeout = null;
let zoomAccumulator = 0;

document.addEventListener('wheel', (e) => {
    const container = document.getElementById('imageContainer');
    if (container && container.contains(e.target)) {
        e.preventDefault();

        // Acumular el delta del scroll (para trackpads que envían muchos eventos pequeños)
        zoomAccumulator += e.deltaY;

        // Solo aplicar zoom si hay suficiente acumulación o después de un delay
        if (zoomTimeout) clearTimeout(zoomTimeout);

        zoomTimeout = setTimeout(() => {
            if (Math.abs(zoomAccumulator) > 30) { // Umbral de sensibilidad
                if (zoomAccumulator < 0) {
                    zoomIn();
                } else {
                    zoomOut();
                }
            }
            zoomAccumulator = 0;
        }, 50); // 50ms de debounce
    }
}, { passive: false });

/**
 * Volver a la lista de ejercicios
 */
function goBackToList() {
    state.currentExercise = null;
    selectCategory(state.currentCategory);
}

/**
 * Muestra una pantalla y oculta las demás
 */
function showScreen(screenId) {
    ['welcomeScreen', 'exerciseListScreen', 'exerciseViewerScreen'].forEach(id => {
        const el = document.getElementById(id);
        if (id === screenId) {
            el.classList.remove('hidden');
        } else {
            el.classList.add('hidden');
        }
    });
}

/**
 * Actualiza la visualización de estadísticas
 */
function updateStatsDisplay() {
    document.getElementById('correctCount').textContent = state.stats.correct;
    document.getElementById('incorrectCount').textContent = state.stats.incorrect;

    const total = state.stats.correct + state.stats.incorrect;
    const accuracy = total > 0
        ? Math.round((state.stats.correct / total) * 100)
        : 0;
    document.getElementById('accuracy').textContent = `${accuracy}%`;
}

/**
 * Guarda las estadísticas en localStorage
 */
function saveStats() {
    localStorage.setItem('psicotrain_stats', JSON.stringify(state.stats));
    localStorage.setItem('psicotrain_answered', JSON.stringify(state.answeredPages));
}

/**
 * Carga las estadísticas desde localStorage
 */
function loadStats() {
    const savedStats = localStorage.getItem('psicotrain_stats');
    if (savedStats) {
        state.stats = JSON.parse(savedStats);
    }

    const savedAnswered = localStorage.getItem('psicotrain_answered');
    if (savedAnswered) {
        state.answeredPages = JSON.parse(savedAnswered);
    }

    updateStatsDisplay();
}

/**
 * Reinicia las estadísticas
 */
function resetStats() {
    if (confirm('¿Estás seguro de que quieres reiniciar todas las estadísticas?')) {
        state.stats = { correct: 0, incorrect: 0 };
        state.answeredPages = {};
        saveStats();
        updateStatsDisplay();
        showNotification('Estadísticas reiniciadas', 'success');
    }
}

/**
 * Modo oscuro/claro
 */
function toggleDarkMode() {
    document.body.classList.toggle('light-mode');
    const isDark = !document.body.classList.contains('light-mode');
    localStorage.setItem('psicotrain_darkmode', isDark);
    showNotification(isDark ? 'Modo oscuro activado' : 'Modo claro activado', 'info');
}

// Cargar preferencia de modo
if (localStorage.getItem('psicotrain_darkmode') === 'false') {
    document.body.classList.add('light-mode');
}

/**
 * Modal de ayuda
 */
function showHelp() {
    document.getElementById('helpModal').classList.remove('hidden');
}

function closeHelp() {
    document.getElementById('helpModal').classList.add('hidden');
}

// Cerrar modal con Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeHelp();
    }
    // Navegación con flechas
    if (state.currentExercise) {
        if (e.key === 'ArrowLeft') prevPage();
        if (e.key === 'ArrowRight') nextPage();
    }
});

/**
 * Muestra una notificación temporal
 */
function showNotification(message, type = 'info') {
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? 'var(--correct)' : type === 'warning' ? 'var(--accent)' : 'var(--primary)'};
        color: white;
        border-radius: 0.75rem;
        font-weight: 500;
        box-shadow: var(--shadow-lg);
        z-index: 2000;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Eliminar después de 3 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Añadir estilos de animación
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// ============================================
// FUNCIONES DE DIBUJO
// ============================================

/**
 * Inicializa el canvas de dibujo
 */
function initDrawingCanvas() {
    const canvas = document.getElementById('drawingCanvas');
    const img = document.getElementById('exerciseImage');

    if (!canvas || !img) return;

    state.drawing.canvas = canvas;
    state.drawing.ctx = canvas.getContext('2d');

    // Esperar a que la imagen cargue
    img.onload = () => {
        resizeCanvas();
        restoreDrawing();
    };

    // Si la imagen ya está cargada
    if (img.complete) {
        resizeCanvas();
        restoreDrawing();
    }

    // Event listeners para dibujar
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Soporte táctil
    canvas.addEventListener('touchstart', handleTouchStart);
    canvas.addEventListener('touchmove', handleTouchMove);
    canvas.addEventListener('touchend', stopDrawing);
}

/**
 * Redimensiona el canvas al tamaño de la imagen
 */
function resizeCanvas() {
    const canvas = state.drawing.canvas;
    const img = document.getElementById('exerciseImage');

    if (!canvas || !img) return;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.style.width = img.offsetWidth + 'px';
    canvas.style.height = img.offsetHeight + 'px';
}

/**
 * Activa/desactiva el modo dibujo
 */
function toggleDrawingMode() {
    state.drawing.enabled = !state.drawing.enabled;
    const canvas = document.getElementById('drawingCanvas');
    const toggleBtn = document.getElementById('toggleDrawing');
    const toolbar = document.getElementById('drawingToolbar');

    if (state.drawing.enabled) {
        canvas.classList.add('drawing-active');
        toggleBtn.classList.add('drawing-enabled');
        if (toolbar) toolbar.classList.remove('hidden');

        // Inicializar canvas si no está listo
        if (!state.drawing.ctx) {
            initDrawingCanvas();
        }

        showNotification('Modo dibujo activado ✏️', 'success');
    } else {
        canvas.classList.remove('drawing-active');
        toggleBtn.classList.remove('drawing-enabled');
        if (toolbar) toolbar.classList.add('hidden');
        showNotification('Modo dibujo desactivado', 'info');
    }
}

/**
 * Establece la herramienta de dibujo
 */
function setTool(tool) {
    state.drawing.tool = tool;

    // Actualizar UI
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    const toolBtn = document.getElementById('tool' + tool.charAt(0).toUpperCase() + tool.slice(1));
    if (toolBtn) {
        toolBtn.classList.add('active');
    }
}

/**
 * Establece el color del pincel
 */
function setColor(color) {
    state.drawing.color = color;

    // Actualizar UI
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.style.background === color || btn.style.backgroundColor === color) {
            btn.classList.add('active');
        }
    });
}

/**
 * Establece el tamaño del pincel
 */
function setBrushSize(size) {
    state.drawing.brushSize = parseInt(size);
    // Actualizar indicador visual
    const sizeValue = document.getElementById('brushSizeValue');
    if (sizeValue) sizeValue.textContent = size;
}

/**
 * Inicia el dibujo
 */
function startDrawing(e) {
    if (!state.drawing.enabled) return;

    state.drawing.isDrawing = true;
    const coords = getCanvasCoords(e);
    state.drawing.lastX = coords.x;
    state.drawing.lastY = coords.y;
}

/**
 * Dibuja en el canvas
 */
function draw(e) {
    if (!state.drawing.isDrawing || !state.drawing.enabled) return;

    const ctx = state.drawing.ctx;
    const coords = getCanvasCoords(e);

    ctx.beginPath();
    ctx.moveTo(state.drawing.lastX, state.drawing.lastY);
    ctx.lineTo(coords.x, coords.y);

    // Configurar estilo según herramienta
    if (state.drawing.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = state.drawing.brushSize * 3;
    } else if (state.drawing.tool === 'highlighter') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = hexToRgba(state.drawing.color, 0.3);
        ctx.lineWidth = state.drawing.brushSize * 4;
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = state.drawing.color;
        ctx.lineWidth = state.drawing.brushSize;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    state.drawing.lastX = coords.x;
    state.drawing.lastY = coords.y;
}

/**
 * Detiene el dibujo y guarda
 */
function stopDrawing() {
    if (state.drawing.isDrawing) {
        state.drawing.isDrawing = false;
        saveDrawing();
    }
}

/**
 * Obtiene coordenadas del canvas
 */
function getCanvasCoords(e) {
    const canvas = state.drawing.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };
}

/**
 * Maneja touch start
 */
function handleTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    startDrawing(mouseEvent);
}

/**
 * Maneja touch move
 */
function handleTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    draw(mouseEvent);
}

/**
 * Limpia el dibujo actual
 */
function clearDrawing() {
    const canvas = state.drawing.canvas;
    const ctx = state.drawing.ctx;

    if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        saveDrawing();
        showNotification('Dibujo borrado', 'info');
    }
}

/**
 * Guarda el dibujo actual
 */
function saveDrawing() {
    if (!state.currentExercise || !state.drawing.canvas) return;

    const key = `${state.currentExercise.name}_${state.currentPage}`;
    state.drawing.savedDrawings[key] = state.drawing.canvas.toDataURL();

    // Guardar en localStorage
    try {
        localStorage.setItem('psicotrain_drawings', JSON.stringify(state.drawing.savedDrawings));
    } catch (e) {
        console.warn('No se pudo guardar el dibujo en localStorage');
    }
}

/**
 * Restaura el dibujo guardado
 */
function restoreDrawing() {
    if (!state.currentExercise || !state.drawing.canvas || !state.drawing.ctx) return;

    const key = `${state.currentExercise.name}_${state.currentPage}`;
    const savedData = state.drawing.savedDrawings[key];

    if (savedData) {
        const img = new Image();
        img.onload = () => {
            state.drawing.ctx.drawImage(img, 0, 0);
        };
        img.src = savedData;
    }
}

/**
 * Carga dibujos guardados desde localStorage
 */
function loadSavedDrawings() {
    try {
        const saved = localStorage.getItem('psicotrain_drawings');
        if (saved) {
            state.drawing.savedDrawings = JSON.parse(saved);
        }
    } catch (e) {
        console.warn('No se pudieron cargar los dibujos guardados');
    }
}

/**
 * Convierte hex a rgba
 */
function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Ajusta la imagen a la pantalla
 */
function fitToScreen() {
    const container = document.getElementById('imageContainer');
    const img = document.getElementById('exerciseImage');

    if (!container || !img) return;

    const containerWidth = container.clientWidth - 40;
    const containerHeight = container.clientHeight - 40;
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const containerRatio = containerWidth / containerHeight;

    if (imgRatio > containerRatio) {
        state.zoomLevel = containerWidth / img.naturalWidth;
    } else {
        state.zoomLevel = containerHeight / img.naturalHeight;
    }

    updateZoom();
}

// Actualizar la inicialización
const originalLoadData = loadData;
loadData = async function () {
    await originalLoadData();
    loadSavedDrawings();
};

// Observar cambios de página para reiniciar canvas
const originalLoadPage = loadPage;
loadPage = function () {
    originalLoadPage();

    // Reinicializar canvas después de cargar la página
    setTimeout(() => {
        initDrawingCanvas();
    }, 100);
};

// Observar cambios en el tamaño de la imagen para redimensionar canvas
window.addEventListener('resize', () => {
    if (state.drawing.canvas) {
        resizeCanvas();
    }
});


// ==========================================
// UPLOAD PDF FUNCTIONS
// ==========================================

function showUploadPanel() {
    document.getElementById('uploadModal').classList.remove('hidden');
}

function closeUploadPanel() {
    document.getElementById('uploadModal').classList.add('hidden');
}

function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('uploadZone').classList.add('dragover');
}

function handleDragLeave(e) {
    document.getElementById('uploadZone').classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    document.getElementById('uploadZone').classList.remove('dragover');

    const files = e.dataTransfer.files;
    handleFiles(files);
}

function handleFileSelect(e) {
    const files = e.target.files;
    handleFiles(files);
}

function handleFiles(files) {
    const uploadList = document.getElementById('uploadList');

    for (const file of files) {
        if (file.type === 'application/pdf') {
            const item = document.createElement('div');
            item.className = 'upload-item';
            item.innerHTML = `
                <span>📄 ${file.name}</span>
                <span style="color: var(--text-muted); font-size: 0.8rem;">${(file.size / 1024 / 1024).toFixed(2)} MB</span>
            `;
            uploadList.appendChild(item);
        }
    }

    showNotification('PDFs seleccionados. Para procesarlos, ejecuta el script de extracción.', 'info');
}

// ==========================================
// NOTES/TRUCOS FUNCTIONS
// ==========================================

let currentNoteCategory = 'general';

function showNotesPanel() {
    document.getElementById('notesModal').classList.remove('hidden');
    loadNotes();
}

function closeNotesPanel() {
    document.getElementById('notesModal').classList.add('hidden');
}

function selectNoteCategory(category) {
    // Guardar notas actuales antes de cambiar
    saveCurrentNotes();

    // Cambiar categoría
    currentNoteCategory = category;

    // Actualizar UI
    document.querySelectorAll('.note-cat-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(category.toLowerCase())) {
            btn.classList.add('active');
        }
    });

    // Cargar notas de la nueva categoría
    loadNotes();
}

function loadNotes() {
    const notes = JSON.parse(localStorage.getItem('psicotrain_notes') || '{}');
    const textarea = document.getElementById('notesTextarea');
    textarea.value = notes[currentNoteCategory] || '';
}

function saveCurrentNotes() {
    const notes = JSON.parse(localStorage.getItem('psicotrain_notes') || '{}');
    const textarea = document.getElementById('notesTextarea');
    notes[currentNoteCategory] = textarea.value;
    localStorage.setItem('psicotrain_notes', JSON.stringify(notes));
}

function saveNotes() {
    saveCurrentNotes();
    showNotification('Notas guardadas ✓', 'success');
}

function clearCurrentNotes() {
    document.getElementById('notesTextarea').value = '';
    saveCurrentNotes();
    showNotification('Notas limpiadas', 'info');
}

// ==========================================
// PDF.JS DIRECT VIEWING
// ==========================================

// Configurar worker de PDF.js
if (typeof pdfjsLib !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// Estado del PDF cargado
let loadedPDF = {
    document: null,
    currentPage: 1,
    totalPages: 0,
    fileName: ''
};

// Modificar handleFiles para procesar PDFs directamente
function handleFiles(files) {
    const uploadList = document.getElementById('uploadList');

    for (const file of files) {
        if (file.type === 'application/pdf') {
            const item = document.createElement('div');
            item.className = 'upload-item';
            item.innerHTML = `
                <span>📄 ${file.name}</span>
                <button class="btn-small" onclick="loadPDFFile(this.parentElement)" data-filename="${file.name}">Ver</button>
            `;
            item.pdfFile = file; // Guardar referencia al archivo
            uploadList.appendChild(item);

            // Cargar automáticamente el primer PDF
            if (uploadList.children.length === 1) {
                loadPDFFromFile(file);
            }
        }
    }
}

// Cargar PDF desde elemento de la lista
function loadPDFFile(element) {
    if (element.pdfFile) {
        loadPDFFromFile(element.pdfFile);
    }
}

// Cargar PDF desde archivo
async function loadPDFFromFile(file) {
    try {
        showNotification('Cargando PDF...', 'info');

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        loadedPDF.document = pdf;
        loadedPDF.totalPages = pdf.numPages;
        loadedPDF.currentPage = 1;
        loadedPDF.fileName = file.name;

        // Cerrar modal de upload
        closeUploadPanel();

        // Crear ejercicio temporal
        state.currentExercise = {
            name: file.name.replace('.pdf', ''),
            total_pages: pdf.numPages,
            pages: [],
            isPDF: true
        };
        state.currentPage = 1;
        state.zoomLevel = 1;

        // Mostrar visor
        document.getElementById('breadcrumb').innerHTML = `
            <span>📄 PDF Cargado</span>
            <span> › </span>
            <strong>${file.name}</strong>
        `;

        showScreen('exerciseViewerScreen');

        // Renderizar primera página
        await renderPDFPage(1);

        // Actualizar panel de respuestas
        renderAnswersPanel();

        showNotification(`PDF cargado: ${pdf.numPages} páginas`, 'success');

    } catch (error) {
        console.error('Error cargando PDF:', error);
        showNotification('Error al cargar el PDF', 'error');
    }
}

// Renderizar página del PDF
async function renderPDFPage(pageNum) {
    if (!loadedPDF.document) return;

    try {
        const page = await loadedPDF.document.getPage(pageNum);

        // Escala para buena calidad
        const scale = 2;
        const viewport = page.getViewport({ scale });

        // Crear canvas temporal para renderizar
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;

        // Convertir a imagen y mostrar
        const img = document.getElementById('exerciseImage');
        img.src = canvas.toDataURL('image/png');
        img.style.transform = `scale(${state.zoomLevel})`;

        // Actualizar indicador de página
        document.getElementById('pageIndicator').textContent =
            `Página ${pageNum} de ${loadedPDF.totalPages}`;

        // Actualizar botones de navegación
        document.getElementById('prevPageBtn').disabled = pageNum <= 1;
        document.getElementById('nextPageBtn').disabled = pageNum >= loadedPDF.totalPages;

        loadedPDF.currentPage = pageNum;
        state.currentPage = pageNum;

    } catch (error) {
        console.error('Error renderizando página:', error);
    }
}

// Sobrescribir funciones de navegación para soportar PDFs
const originalPrevPage = prevPage;
const originalNextPage = nextPage;

prevPage = function () {
    if (loadedPDF.document && state.currentExercise?.isPDF) {
        if (loadedPDF.currentPage > 1) {
            renderPDFPage(loadedPDF.currentPage - 1);
        }
    } else {
        originalPrevPage();
    }
};

nextPage = function () {
    if (loadedPDF.document && state.currentExercise?.isPDF) {
        if (loadedPDF.currentPage < loadedPDF.totalPages) {
            renderPDFPage(loadedPDF.currentPage + 1);
        }
    } else {
        originalNextPage();
    }
};

// ==========================================
// SIDEBAR COLLAPSE FUNCTIONS
// ==========================================

/**
 * Inicializa el estado de la barra lateral desde localStorage
 */
function initSidebar() {
    const savedState = localStorage.getItem('psicotrain_sidebar_collapsed');
    if (savedState === 'true') {
        state.sidebarCollapsed = true;
        document.querySelector('.sidebar').classList.add('collapsed');
    }

    // Añadir listener al botón de toggle (si no tiene ya el onclick de HTML)
    const toggleBtn = document.getElementById('toggleSidebar');
    if (toggleBtn && !toggleBtn.onclick) {
        toggleBtn.onclick = toggleSidebar;
    }
}

/**
 * Alterna el estado de la barra lateral
 */
function toggleSidebar() {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    const sidebar = document.querySelector('.sidebar');

    if (state.sidebarCollapsed) {
        sidebar.classList.add('collapsed');
    } else {
        sidebar.classList.remove('collapsed');
    }

    // Guardar estado
    localStorage.setItem('psicotrain_sidebar_collapsed', state.sidebarCollapsed);

    // Disparar evento de resize para recalcular el tamaño del visor si es necesario
    window.dispatchEvent(new Event('resize'));

    // Notificar al sistema de dibujo que el canvas puede necesitar redimensionarse
    if (state.drawing.enabled) {
        setTimeout(initDrawingCanvas, 350); // Esperar a que termine la animación
    }
}

// ==========================================
// STOPWATCH FUNCTIONS
// ==========================================

/**
 * Inicia el cronómetro
 */
function startTimer() {
    if (state.stopwatch.isRunning) return;
    state.stopwatch.isRunning = true;
    updateTimerBtnUI();

    state.stopwatch.timerId = setInterval(() => {
        state.stopwatch.seconds++;
        updateStopwatchDisplay();
    }, 1000);
}

/**
 * Detiene el cronómetro
 */
function stopTimer() {
    state.stopwatch.isRunning = false;
    if (state.stopwatch.timerId) {
        clearInterval(state.stopwatch.timerId);
        state.stopwatch.timerId = null;
    }
    updateTimerBtnUI();
}

/**
 * Alterna el cronómetro
 */
function toggleStopwatch() {
    if (state.stopwatch.isRunning) {
        stopTimer();
    } else {
        startTimer();
    }
}

/**
 * Reinicia el cronómetro
 */
function resetStopwatch() {
    stopTimer();
    state.stopwatch.seconds = 0;
    updateStopwatchDisplay();
    startTimer();
}

/**
 * Actualiza la visualización del cronómetro
 */
function updateStopwatchDisplay() {
    const display = document.getElementById('stopwatchDisplay');
    if (!display) return;

    const minutes = Math.floor(state.stopwatch.seconds / 60);
    const seconds = state.stopwatch.seconds % 60;

    const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    display.textContent = formatted;
}

/**
 * Actualiza el icono del botón de pausa/reinicio
 */
function updateTimerBtnUI() {
    const btn = document.getElementById('toggleStopwatch');
    if (btn) {
        btn.textContent = state.stopwatch.isRunning ? '⏸' : '▶';
    }
}

// ==========================================
// EXERCISE NOTES FUNCTIONS
// ==========================================

/**
 * Alterna la visibilidad del panel de notas del ejercicio
 */
function toggleExerciseNotes() {
    const panel = document.getElementById('exerciseNotesPanel');
    if (panel) {
        panel.classList.toggle('hidden');
    }
}

/**
 * Inicializa los listeners para el área de notas
 */
function initNotesListeners() {
    const notesArea = document.getElementById('exerciseNotesArea');
    if (notesArea) {
        notesArea.addEventListener('input', () => {
            if (state.currentExercise) {
                state.exerciseNotes[state.currentExercise.name] = notesArea.value;
                saveExerciseNotes();
            }
        });
    }
}

/**
 * Carga las notas de todos los ejercicios desde localStorage
 */
function loadExerciseNotes() {
    try {
        const saved = localStorage.getItem('psicotrain_exercise_notes');
        if (saved) {
            state.exerciseNotes = JSON.parse(saved);
        }
    } catch (e) {
        console.error('Error cargando notas de ejercicios:', e);
    }
}

/**
 * Guarda las notas de todos los ejercicios en localStorage
 */
function saveExerciseNotes() {
    localStorage.setItem('psicotrain_exercise_notes', JSON.stringify(state.exerciseNotes));
}

/**
 * Carga la nota específica del ejercicio actual en el textarea
 */
function loadCurrentExerciseNote() {
    const notesArea = document.getElementById('exerciseNotesArea');
    if (notesArea && state.currentExercise) {
        notesArea.value = state.exerciseNotes[state.currentExercise.name] || '';
    }
}
