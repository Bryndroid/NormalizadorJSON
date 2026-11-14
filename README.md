# Normalizador de transacciones

## Introducción

Desarrollé esta aplicación para recibir transacciones en JSON, normalizarlas a un formato común (definido en reglas.js), validar sus datos y exportar los registros válidos. El procesamiento se realiza en el navegador que cuenta con una interfaz donde puedes especificar un poco el formato de salida.

## Decisiones de diseño

Elegí HTML, CSS y JavaScript con módulos ES, sin frameworks ni dependencias externas. Separé las reglas declarativas en `reglas.js` y la lógica de la aplicación en `main.js`. La interfaz permite cargar un archivo o pegar JSON, elegir moneda y fuente, revisar errores y correcciones, consultar métricas y exportar el resultado.

## Uso de IA

Utilicé el agente de Copilot integrado en VScode como apoyo para generar y ajustar la estructura y la lógica de la aplicación. En base a un prompt estructurado ocupando la logica de few shots (integrarle ejemplos en el prompt) y apoyandome de la herramienta de Prompt Cowboy defini el codigo funcional del proyecto, luego fui testeando directamente la funcionalidad del codigo para detectar puntos de mejora.

## Ajustes realizados sobre sugerencias de IA

Solicité que, al procesar, se ocultara la etapa de carga y se mostraran los resultados en cartas JSON; añadí una opción para volver a cargar datos. También pedí mostrar los registros originales en cartas, marcar los válidos en verde claro y los inválidos en rojo claro, y colocar las transacciones válidas a la izquierda y las ingresadas a la derecha, con altura fija y scroll estilizado. Además, solicité detectar la moneda desde el importe cuando no se proporciona el campo `currency`. 

Cabe destacar que cada accion la IA lo corregio correctamente gracias a que fui directo, especifico en que parte del codigo fuera.
