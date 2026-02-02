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
        brushSizes: {         // Grosor individual por herramienta
            pen: 4,
            highlighter: 12,
            eraser: 20
        },
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
    loadBrushSizes(); // Cargar grosores de pincel guardados

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
    if (wrapper && img.naturalWidth && img.naturalHeight) {
        const scaledWidth = img.naturalWidth * state.zoomLevel;
        const scaledHeight = img.naturalHeight * state.zoomLevel;
        wrapper.style.width = scaledWidth + 'px';
        wrapper.style.height = scaledHeight + 'px';
    }

    // Actualizar display del nivel de zoom
    updateZoomDisplay();
}

/**
 * Actualiza el display del nivel de zoom (si existe)
 */
function updateZoomDisplay() {
    const zoomDisplay = document.getElementById('zoomDisplay');
    if (zoomDisplay) {
        zoomDisplay.textContent = `${Math.round(state.zoomLevel * 100)}%`;
    }
}

// Zoom con rueda del ratón - Mejorado para modo dibujo y scroll con trackpad
let zoomTimeout = null;
let zoomAccumulator = 0;

document.addEventListener('wheel', (e) => {
    const container = document.getElementById('imageContainer');
    const drawingCanvas = document.getElementById('drawingCanvas');

    // Verificar si el evento es sobre el contenedor de imagen o el canvas de dibujo
    if (container && (container.contains(e.target) || e.target === drawingCanvas)) {
        // Solo hacer zoom si se usa Ctrl+wheel o Cmd+wheel (zoom intencional)
        // Permitir scroll normal del trackpad cuando no se presiona Ctrl/Cmd
        const isZoomGesture = e.ctrlKey || e.metaKey;

        if (isZoomGesture) {
            // Prevenir solo cuando es un gesto de zoom intencional
            e.preventDefault();
            e.stopPropagation();

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
        // Si no es un gesto de zoom (Ctrl/Cmd), permitir el scroll normal del trackpad
        // No hacemos preventDefault(), por lo que el scroll funcionará naturalmente
    }
}, { passive: false });

// Soporte para pinch-to-zoom en dispositivos táctiles
let initialPinchDistance = 0;
let initialZoomLevel = 1;

document.addEventListener('touchstart', (e) => {
    const container = document.getElementById('imageContainer');
    if (container && container.contains(e.target) && e.touches.length === 2) {
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        initialPinchDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        );
        initialZoomLevel = state.zoomLevel;
    }
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    const container = document.getElementById('imageContainer');
    if (container && container.contains(e.target) && e.touches.length === 2) {
        e.preventDefault();
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const currentDistance = Math.hypot(
            touch2.clientX - touch1.clientX,
            touch2.clientY - touch1.clientY
        );

        if (initialPinchDistance > 0) {
            const scale = currentDistance / initialPinchDistance;
            state.zoomLevel = Math.max(0.2, Math.min(4, initialZoomLevel * scale));
            state.zoomLevel = Math.round(state.zoomLevel * 10) / 10;
            updateZoom();
        }
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
        if (toolbar) {
            toolbar.classList.remove('hidden');
            // Hacer la barra arrastrable cuando se activa
            makeDrawingToolbarDraggable();
        }

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

    // Restaurar el grosor guardado de esta herramienta
    const savedSize = state.drawing.brushSizes[tool];
    if (savedSize !== undefined) {
        const brushSizeInput = document.getElementById('brushSize');
        const brushSizeValue = document.getElementById('brushSizeValue');
        if (brushSizeInput) brushSizeInput.value = savedSize;
        if (brushSizeValue) brushSizeValue.textContent = savedSize;
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
    const sizeInt = parseInt(size);

    // Guardar el grosor en la herramienta actual
    state.drawing.brushSizes[state.drawing.tool] = sizeInt;

    // Actualizar indicador visual
    const sizeValue = document.getElementById('brushSizeValue');
    if (sizeValue) sizeValue.textContent = size;

    // Guardar en localStorage
    saveBrushSizes();
}

/**
 * Guarda los grosores de pincel en localStorage
 */
function saveBrushSizes() {
    try {
        localStorage.setItem('psicotrain_brush_sizes', JSON.stringify(state.drawing.brushSizes));
    } catch (e) {
        console.warn('Error guardando grosores de pincel');
    }
}

/**
 * Carga los grosores de pincel desde localStorage
 */
function loadBrushSizes() {
    try {
        const saved = localStorage.getItem('psicotrain_brush_sizes');
        if (saved) {
            const sizes = JSON.parse(saved);
            state.drawing.brushSizes = { ...state.drawing.brushSizes, ...sizes };
        }
    } catch (e) {
        console.warn('Error cargando grosores de pincel');
    }
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
 * Hace la barra de herramientas de dibujo arrastrable
 */
let toolbarDragInitialized = false;

function makeDrawingToolbarDraggable() {
    // Evitar inicializar múltiples veces
    if (toolbarDragInitialized) return;

    const toolbar = document.getElementById('drawingToolbar');
    if (!toolbar) return;

    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    // Event listeners para mouse
    toolbar.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    // Event listeners para touch (iPad / Apple Pencil)
    toolbar.addEventListener('touchstart', dragStartTouch);
    document.addEventListener('touchmove', dragTouch);
    document.addEventListener('touchend', dragEndTouch);

    function dragStart(e) {
        // Solo permitir arrastre si no se está haciendo clic en un botón o control
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' ||
            e.target.closest('button') || e.target.closest('input')) {
            return;
        }

        initialX = e.clientX - toolbar.offsetLeft;
        initialY = e.clientY - toolbar.offsetTop;
        isDragging = true;
        toolbar.style.cursor = 'grabbing';
    }

    function dragStartTouch(e) {
        // Solo permitir arrastre si no se está tocando un botón o control
        if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' ||
            e.target.closest('button') || e.target.closest('input')) {
            return;
        }

        const touch = e.touches[0];
        initialX = touch.clientX - toolbar.offsetLeft;
        initialY = touch.clientY - toolbar.offsetTop;
        isDragging = true;
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();

            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            // Limitar a los bordes de la ventana
            const maxX = window.innerWidth - toolbar.offsetWidth;
            const maxY = window.innerHeight - toolbar.offsetHeight;

            currentX = Math.max(0, Math.min(currentX, maxX));
            currentY = Math.max(0, Math.min(currentY, maxY));

            toolbar.style.left = currentX + 'px';
            toolbar.style.top = currentY + 'px';
            toolbar.style.bottom = 'auto';
        }
    }

    function dragTouch(e) {
        if (isDragging) {
            e.preventDefault();

            const touch = e.touches[0];
            currentX = touch.clientX - initialX;
            currentY = touch.clientY - initialY;

            // Limitar a los bordes de la ventana
            const maxX = window.innerWidth - toolbar.offsetWidth;
            const maxY = window.innerHeight - toolbar.offsetHeight;

            currentX = Math.max(0, Math.min(currentX, maxX));
            currentY = Math.max(0, Math.min(currentY, maxY));

            toolbar.style.left = currentX + 'px';
            toolbar.style.top = currentY + 'px';
            toolbar.style.bottom = 'auto';
        }
    }

    function dragEnd() {
        if (isDragging) {
            isDragging = false;
            toolbar.style.cursor = 'move';
        }
    }

    function dragEndTouch() {
        if (isDragging) {
            isDragging = false;
        }
    }

    // Cambiar cursor para indicar que se puede arrastrar
    toolbar.style.cursor = 'move';
    toolbarDragInitialized = true;
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

    // Obtener el grosor actual de la herramienta
    const currentBrushSize = state.drawing.brushSizes[state.drawing.tool] || 4;

    // Configurar estilo según herramienta
    if (state.drawing.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = currentBrushSize;
    } else if (state.drawing.tool === 'highlighter') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = hexToRgba(state.drawing.color, 0.3);
        ctx.lineWidth = currentBrushSize;
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = state.drawing.color;
        ctx.lineWidth = currentBrushSize;
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
 * Obtiene coordenadas del canvas teniendo en cuenta el zoom
 * Soporta tanto eventos de mouse como touch (Apple Pencil y dedos)
 */
function getCanvasCoords(e) {
    const canvas = state.drawing.canvas;
    const rect = canvas.getBoundingClientRect();

    let clientX, clientY;

    // Determinar si es un evento touch o mouse
    if (e.touches && e.touches.length > 0) {
        // Es un evento touch (puede ser Apple Pencil o dedo)
        const touch = e.touches[0];
        clientX = touch.clientX;
        clientY = touch.clientY;
    } else if (e.clientX !== undefined && e.clientY !== undefined) {
        // Es un evento mouse o MouseEvent sintético
        clientX = e.clientX;
        clientY = e.clientY;
    } else {
        // Fallback por si acaso
        return { x: 0, y: 0 };
    }

    // El canvas tiene las dimensiones naturales de la imagen
    // pero se escala visualmente con transform: scale()
    // Por lo tanto, necesitamos ajustar las coordenadas según el zoom
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

/**
 * Maneja touch start (Apple Pencil o dedo)
 */
function handleTouchStart(e) {
    e.preventDefault();

    // Detectar si es Apple Pencil
    const touch = e.touches[0];
    const isApplePencil = touch.touchType === 'stylus';

    // Si es Apple Pencil, podríamos ajustar el grosor o comportamiento
    // Por ahora, simplemente iniciamos el dibujo normalmente
    if (!state.drawing.enabled) return;

    state.drawing.isDrawing = true;
    const coords = getCanvasCoords(e);
    state.drawing.lastX = coords.x;
    state.drawing.lastY = coords.y;
}

/**
 * Maneja touch move (Apple Pencil o dedo)
 */
function handleTouchMove(e) {
    e.preventDefault();

    if (!state.drawing.isDrawing || !state.drawing.enabled) return;

    const ctx = state.drawing.ctx;
    const coords = getCanvasCoords(e);

    ctx.beginPath();
    ctx.moveTo(state.drawing.lastX, state.drawing.lastY);
    ctx.lineTo(coords.x, coords.y);

    // Obtener el grosor actual de la herramienta
    const currentBrushSize = state.drawing.brushSizes[state.drawing.tool] || 4;

    // Configurar estilo según herramienta
    if (state.drawing.tool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = currentBrushSize;
    } else if (state.drawing.tool === 'highlighter') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = hexToRgba(state.drawing.color, 0.3);
        ctx.lineWidth = currentBrushSize;
    } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = state.drawing.color;
        ctx.lineWidth = currentBrushSize;
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    state.drawing.lastX = coords.x;
    state.drawing.lastY = coords.y;
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
    fileName: '',
    pageCache: {} // Caché de páginas renderizadas
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
        loadedPDF.pageCache = {}; // Limpiar caché

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

        // Precargar páginas adyacentes
        preloadAdjacentPages(1);

        // Actualizar panel de respuestas
        renderAnswersPanel();

        showNotification(`PDF cargado: ${pdf.numPages} páginas`, 'success');

    } catch (error) {
        console.error('Error cargando PDF:', error);
        showNotification('Error al cargar el PDF', 'error');
    }
}

// Renderizar página del PDF con mejor calidad y caché
async function renderPDFPage(pageNum) {
    if (!loadedPDF.document) return;

    try {
        // Verificar si la página ya está en caché
        if (loadedPDF.pageCache[pageNum]) {
            const img = document.getElementById('exerciseImage');
            img.src = loadedPDF.pageCache[pageNum];
            img.style.transform = `scale(${state.zoomLevel})`;
            updatePageIndicator(pageNum);
            return;
        }

        const page = await loadedPDF.document.getPage(pageNum);

        // Escala mejorada para mejor calidad (3 en lugar de 2)
        const scale = 3;
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

        // Convertir a imagen
        const imageData = canvas.toDataURL('image/png');

        // Guardar en caché
        loadedPDF.pageCache[pageNum] = imageData;

        // Mostrar
        const img = document.getElementById('exerciseImage');
        img.src = imageData;
        img.style.transform = `scale(${state.zoomLevel})`;

        updatePageIndicator(pageNum);

        loadedPDF.currentPage = pageNum;
        state.currentPage = pageNum;

    } catch (error) {
        console.error('Error renderizando página:', error);
    }
}

/**
 * Actualiza el indicador de página
 */
function updatePageIndicator(pageNum) {
    document.getElementById('pageIndicator').textContent =
        `Página ${pageNum} de ${loadedPDF.totalPages}`;

    // Actualizar botones de navegación
    document.getElementById('prevPageBtn').disabled = pageNum <= 1;
    document.getElementById('nextPageBtn').disabled = pageNum >= loadedPDF.totalPages;
}

/**
 * Precarga páginas adyacentes para navegación más suave
 */
async function preloadAdjacentPages(currentPage) {
    if (!loadedPDF.document) return;

    const pagesToPreload = [];

    // Precargar página anterior
    if (currentPage > 1 && !loadedPDF.pageCache[currentPage - 1]) {
        pagesToPreload.push(currentPage - 1);
    }

    // Precargar página siguiente
    if (currentPage < loadedPDF.totalPages && !loadedPDF.pageCache[currentPage + 1]) {
        pagesToPreload.push(currentPage + 1);
    }

    // Renderizar páginas en segundo plano
    for (const pageNum of pagesToPreload) {
        try {
            const page = await loadedPDF.document.getPage(pageNum);
            const scale = 3;
            const viewport = page.getViewport({ scale });

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            loadedPDF.pageCache[pageNum] = canvas.toDataURL('image/png');
        } catch (e) {
            console.warn(`No se pudo precargar página ${pageNum}`);
        }
    }
}

// Sobrescribir funciones de navegación para soportar PDFs
const originalPrevPage = prevPage;
const originalNextPage = nextPage;

prevPage = async function () {
    if (loadedPDF.document && state.currentExercise?.isPDF) {
        if (loadedPDF.currentPage > 1) {
            await renderPDFPage(loadedPDF.currentPage - 1);
            preloadAdjacentPages(loadedPDF.currentPage);
        }
    } else {
        originalPrevPage();
    }
};

nextPage = async function () {
    if (loadedPDF.document && state.currentExercise?.isPDF) {
        if (loadedPDF.currentPage < loadedPDF.totalPages) {
            await renderPDFPage(loadedPDF.currentPage + 1);
            preloadAdjacentPages(loadedPDF.currentPage);
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
// QUICK NOTES PANEL FUNCTIONS (New Enhanced Version)
// ==========================================

// Estado del panel de notas
const quickNotesState = {
    mode: 'text', // 'text' o 'draw'
    isDrawing: false,
    lastX: 0,
    lastY: 0,
    ctx: null,
    canvas: null
};

/**
 * Alterna la visibilidad del panel de notas rápidas
 */
function toggleQuickNotes() {
    const panel = document.getElementById('quickNotesPanel');
    if (panel) {
        panel.classList.toggle('hidden');

        if (!panel.classList.contains('hidden')) {
            // Cargar contenido guardado
            loadQuickNotesContent();

            // Inicializar canvas si es la primera vez
            if (!quickNotesState.canvas) {
                initQuickNotesCanvas();
            }

            // Hacer el panel arrastrable y redimensionable
            makeNotesPanelDraggable();
            makeNotesPanelResizable();

            // Restaurar posición y tamaño guardados
            restoreNotesPanelSizeAndPosition();
        } else {
            // Guardar contenido al cerrar
            saveQuickNotesContent();
        }
    }
}

/**
 * Cambia entre modo texto y dibujo
 */
function switchNotesMode(mode) {
    quickNotesState.mode = mode;

    const textarea = document.getElementById('quickNotesTextarea');
    const canvas = document.getElementById('quickNotesCanvas');
    const buttons = document.querySelectorAll('.notes-mode-btn');

    // Actualizar UI de botones
    buttons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Alternar visibilidad
    if (mode === 'text') {
        textarea.classList.remove('hidden');
        canvas.classList.add('hidden');
    } else {
        textarea.classList.add('hidden');
        canvas.classList.remove('hidden');

        // Asegurar que el canvas está inicializado
        if (!quickNotesState.canvas) {
            initQuickNotesCanvas();
        }
    }
}

/**
 * Inicializa el canvas de notas
 */
function initQuickNotesCanvas() {
    const canvas = document.getElementById('quickNotesCanvas');
    const contentArea = document.getElementById('notesContentArea');

    if (!canvas || !contentArea) return;

    // Ajustar tamaño del canvas al contenedor
    canvas.width = contentArea.offsetWidth;
    canvas.height = contentArea.offsetHeight;

    quickNotesState.canvas = canvas;
    quickNotesState.ctx = canvas.getContext('2d');

    // Restaurar dibujo guardado
    restoreNotesDrawing();

    // Event listeners para dibujar
    canvas.addEventListener('mousedown', startNotesDrawing);
    canvas.addEventListener('mousemove', drawOnNotes);
    canvas.addEventListener('mouseup', stopNotesDrawing);
    canvas.addEventListener('mouseout', stopNotesDrawing);

    // Soporte táctil
    canvas.addEventListener('touchstart', handleNotesTouchStart);
    canvas.addEventListener('touchmove', handleNotesTouchMove);
    canvas.addEventListener('touchend', stopNotesDrawing);
}

/**
 * Inicia el dibujo en el canvas de notas
 */
function startNotesDrawing(e) {
    if (quickNotesState.mode !== 'draw') return;

    quickNotesState.isDrawing = true;
    const coords = getNotesCanvasCoords(e);
    quickNotesState.lastX = coords.x;
    quickNotesState.lastY = coords.y;
}

/**
 * Dibuja en el canvas de notas
 */
function drawOnNotes(e) {
    if (!quickNotesState.isDrawing || quickNotesState.mode !== 'draw') return;

    const ctx = quickNotesState.ctx;
    const coords = getNotesCanvasCoords(e);

    ctx.beginPath();
    ctx.moveTo(quickNotesState.lastX, quickNotesState.lastY);
    ctx.lineTo(coords.x, coords.y);

    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    quickNotesState.lastX = coords.x;
    quickNotesState.lastY = coords.y;
}

/**
 * Detiene el dibujo en notas
 */
function stopNotesDrawing() {
    if (quickNotesState.isDrawing) {
        quickNotesState.isDrawing = false;
        saveNotesDrawing();
    }
}

/**
 * Obtiene coordenadas del canvas de notas
 */
function getNotesCanvasCoords(e) {
    const canvas = quickNotesState.canvas;
    const rect = canvas.getBoundingClientRect();

    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

/**
 * Manejo de touch en notas
 */
function handleNotesTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousedown', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    startNotesDrawing(mouseEvent);
}

function handleNotesTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    drawOnNotes(mouseEvent);
}

/**
 * Limpia el canvas de notas
 */
function clearNotesCanvas() {
    if (quickNotesState.ctx && quickNotesState.canvas) {
        quickNotesState.ctx.clearRect(0, 0, quickNotesState.canvas.width, quickNotesState.canvas.height);
        saveNotesDrawing();
        showNotification('Dibujo de notas borrado', 'info');
    }
}

/**
 * Guarda el dibujo de notas
 */
function saveNotesDrawing() {
    if (!quickNotesState.canvas) return;

    try {
        const drawingData = quickNotesState.canvas.toDataURL();
        localStorage.setItem('psicotrain_quick_notes_drawing', drawingData);
    } catch (e) {
        console.warn('Error guardando dibujo de notas');
    }
}

/**
 * Restaura el dibujo de notas
 */
function restoreNotesDrawing() {
    if (!quickNotesState.canvas || !quickNotesState.ctx) return;

    try {
        const saved = localStorage.getItem('psicotrain_quick_notes_drawing');
        if (saved) {
            const img = new Image();
            img.onload = () => {
                quickNotesState.ctx.drawImage(img, 0, 0);
            };
            img.src = saved;
        }
    } catch (e) {
        console.warn('Error restaurando dibujo de notas');
    }
}

/**
 * Guarda el contenido del texto de notas
 */
function saveQuickNotesContent() {
    const textarea = document.getElementById('quickNotesTextarea');
    if (textarea) {
        localStorage.setItem('psicotrain_quick_notes_text', textarea.value);
    }
    saveNotesDrawing();
    saveNotesPanelSizeAndPosition();
}

/**
 * Carga el contenido de notas
 */
function loadQuickNotesContent() {
    const textarea = document.getElementById('quickNotesTextarea');
    if (textarea) {
        const saved = localStorage.getItem('psicotrain_quick_notes_text');
        textarea.value = saved || '';

        // Auto-save cuando el usuario escribe
        textarea.addEventListener('input', () => {
            saveQuickNotesContent();
        });
    }
}

/**
 * Hace el panel arrastrable
 */
function makeNotesPanelDraggable() {
    const panel = document.getElementById('quickNotesPanel');
    const titlebar = document.getElementById('notesTitlebar');

    if (!panel || !titlebar) return;

    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    titlebar.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    function dragStart(e) {
        initialX = e.clientX - panel.offsetLeft;
        initialY = e.clientY - panel.offsetTop;

        if (e.target === titlebar || titlebar.contains(e.target)) {
            isDragging = true;
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();

            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            panel.style.left = currentX + 'px';
            panel.style.top = currentY + 'px';
            panel.style.right = 'auto'; // Desactivar right para usar left
        }
    }

    function dragEnd() {
        if (isDragging) {
            isDragging = false;
            saveNotesPanelSizeAndPosition();
        }
    }
}

/**
 * Hace el panel redimensionable
 */
function makeNotesPanelResizable() {
    const panel = document.getElementById('quickNotesPanel');
    const handle = document.getElementById('notesResizeHandle');

    if (!panel || !handle) return;

    let isResizing = false;
    let startX, startY, startWidth, startHeight;

    handle.addEventListener('mousedown', resizeStart);
    document.addEventListener('mousemove', resize);
    document.addEventListener('mouseup', resizeEnd);

    function resizeStart(e) {
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = panel.offsetWidth;
        startHeight = panel.offsetHeight;
        e.preventDefault();
    }

    function resize(e) {
        if (!isResizing) return;

        const width = startWidth + (e.clientX - startX);
        const height = startHeight + (e.clientY - startY);

        if (width > 250) panel.style.width = width + 'px';
        if (height > 200) panel.style.height = height + 'px';

        // Redimensionar canvas si existe
        if (quickNotesState.canvas) {
            const contentArea = document.getElementById('notesContentArea');
            if (contentArea) {
                const savedDrawing = quickNotesState.canvas.toDataURL();
                quickNotesState.canvas.width = contentArea.offsetWidth;
                quickNotesState.canvas.height = contentArea.offsetHeight;

                // Restaurar dibujo después de redimensionar
                const img = new Image();
                img.onload = () => {
                    quickNotesState.ctx.drawImage(img, 0, 0);
                };
                img.src = savedDrawing;
            }
        }
    }

    function resizeEnd() {
        if (isResizing) {
            isResizing = false;
            saveNotesPanelSizeAndPosition();
        }
    }
}

/**
 * Guarda posición y tamaño del panel
 */
function saveNotesPanelSizeAndPosition() {
    const panel = document.getElementById('quickNotesPanel');
    if (!panel) return;

    // Solo guardar si el panel tiene dimensiones válidas (no está oculto)
    if (panel.offsetWidth > 0 && panel.offsetHeight > 0) {
        const state = {
            width: panel.offsetWidth,
            height: panel.offsetHeight,
            left: panel.offsetLeft,
            top: panel.offsetTop
        };

        localStorage.setItem('psicotrain_notes_panel_state', JSON.stringify(state));
    }
}

/**
 * Restaura posición y tamaño del panel
 */
function restoreNotesPanelSizeAndPosition() {
    const panel = document.getElementById('quickNotesPanel');
    if (!panel) return;

    // Valores por defecto
    const defaults = {
        width: 400,
        height: 500,
        left: window.innerWidth - 450,
        top: 100
    };

    try {
        const saved = localStorage.getItem('psicotrain_notes_panel_state');
        if (saved) {
            const state = JSON.parse(saved);
            // Solo aplicar si las dimensiones son válidas (mayores que 0)
            if (state.width > 0 && state.height > 0) {
                panel.style.width = state.width + 'px';
                panel.style.height = state.height + 'px';
                panel.style.left = state.left + 'px';
                panel.style.top = state.top + 'px';
                panel.style.right = 'auto';
            } else {
                // Usar valores por defecto si se guardaron dimensiones inválidas
                panel.style.width = defaults.width + 'px';
                panel.style.height = defaults.height + 'px';
                panel.style.left = defaults.left + 'px';
                panel.style.top = defaults.top + 'px';
                panel.style.right = 'auto';
            }
        } else {
            // Primera vez, usar valores por defecto
            panel.style.width = defaults.width + 'px';
            panel.style.height = defaults.height + 'px';
            panel.style.left = defaults.left + 'px';
            panel.style.top = defaults.top + 'px';
            panel.style.right = 'auto';
        }
    } catch (e) {
        // Si hay error parseando, usar valores por defecto
        console.warn('Error restaurando posición del panel de notas, usando valores por defecto');
        panel.style.width = defaults.width + 'px';
        panel.style.height = defaults.height + 'px';
        panel.style.left = defaults.left + 'px';
        panel.style.top = defaults.top + 'px';
        panel.style.right = 'auto';
    }
}
