# 🏋️‍♂️ Alfa Gym — Workout Tracker & Gym Log Pro

**Alfa Gym** es una aplicación web / PWA estilo **Hevy** diseñada para registrar entrenamientos en vivo, construir rutinas, explorar ejercicios con mapa muscular anatómico, calcular discos olímpicos y sincronizar todos tus datos 100% con **GitHub**.

## ✨ Características Principales

- **Entrenamiento en Vivo (`LiveWorkoutLogger`)**:
  - Series normales (`1, 2, 3`), calentamiento (`W`), drop sets (`D`) y al fallo (`F`).
  - Columna **Anterior** (`Previous`) con autocompletado en 1 clic.
  - Selector de **RPE (6.0–10.0)**, notas fijadas por ejercicio y **Superseries (`A / B / C`)**.
  - **Cronómetro de Descanso Automático** con barra flotante (`-15s`, `+15s`, `Saltar`) y alerta sonora Web Audio.
  - **Detección de Récords Personales (`🏆 PR`) en tiempo real** (Peso Máximo y 1RM estimado).
- **Rutinas y Plantillas (`RoutinesView`)**:
  - Programas preinstalados (**Push / Pull / Legs**, **Torso / Pierna**, **Full Body**) y creador de rutinas personalizadas.
- **Biblioteca de Ejercicios + Mapa Muscular (`ExercisesLibraryView`)**:
  - Más de 50 ejercicios bilingües (`Español / English`) con diagrama anatómico interactivo frontal y posterior.
  - Gráfica de evolución de **1RM** e historial completo por ejercicio.
- **Progreso, Analíticas y Calendario (`AnalyticsHistoryView`)**:
  - Gráfica de volumen por sesión, distribución de series por grupo muscular, calendario de racha de 28 días y feed estilo Hevy.
- **Herramientas Pro y Medidas (`ToolsAndBodyView`)**:
  - **Calculadora Visual de Discos Olímpicos** (`lbs` y `kg`), generador de series de aproximación, tabla de porcentajes 1RM y registro de peso/medidas corporales.
- **100% GitHub Hosting & Cloud Sync**:
  - Despliegue automático en **GitHub Pages** vía `.github/workflows/deploy.yml`.
  - Sincronización en la nube mediante **GitHub Gist privado** + exportación/importación `.JSON`.
