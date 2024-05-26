<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Asistencias</title>
    <style>
        body {
            font-family: 'Arial', sans-serif;
            background-color: #f2f2f2;
            margin: 0;
            padding: 20px;
            color: #333;
        }
        .container {
            width: 100%;
            max-width: 1500px;
            margin: 0 auto;
            background-color: #fff;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            box-sizing: border-box;
            overflow-x: auto;
        }
        .container img {
            display: block;
            margin: 0 auto 20px;
            max-width: 20%;
            height: auto;
        }
        h2 {
            color: #444;
            text-align: center;
            margin-top: 0;
        }
        .legend {
            text-align: center;
            margin: 20px 0;
        }
        .legend span {
            display: inline-block;
            margin: 0 10px;
            padding: 5px 10px;
            border-radius: 4px;
            font-weight: bold;
        }
        .legend .A {
            background-color: red;
            color: white;
        }
        .legend .P {
            background-color: green;
            color: white;
        }
        .legend .L {
            background-color: #00FFFF;
            color: black;
        }
        .legend .C {
            background-color: blue;
            color: white;
        }
        form {
            margin-bottom: 20px;
        }
        label {
            font-weight: bold;
            display: block;
            margin-bottom: 5px;
        }
        input[type="text"], input[type="checkbox"] {
            width: 100%;
            padding: 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            margin-bottom: 10px;
            box-sizing: border-box;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            page-break-inside: auto;
            position: relative;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: center;
        }
        th {
            background-color: rgba(249, 249, 249, 0.9);
            font-weight: bold;
            position: sticky;
            top: 0;
            z-index: 2;
        }
        td:first-child, td:nth-child(2), th:first-child, th:nth-child(2) {
            position: sticky;
            left: 0;
            background-color: #fff;
            z-index: 1;
        }
        tbody tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        input[type="button"], button {
            padding: 10px 20px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            display: inline-block;
            margin-right: 10px;
            margin-top: 20px;
        }
        input[type="button"]:hover, button:hover {
            background-color: #45a049;
        }
        .clear {
            clear: both;
        }
        .mes {
            background-color: #f9f9f9;
            font-weight: bold;
        }
        .modal {
            display: none;
            position: fixed;
            z-index: 1;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0,0,0,0.4);
            padding-top: 60px;
        }
        .modal-content {
            background-color: #fefefe;
            margin: 5% auto;
            padding: 20px;
            border: 1px solid #888;
            width: 80%;
            max-width: 300px;
            text-align: center;
        }
        .modal-content img {
            width: 50px;
            height: auto;
        }
        .assistant-container {
            position: fixed;
            bottom: 80px;
            right: 10px;
            background-color: #fff;
            border: 1px solid #ccc;
            border-radius: 4px;
            padding: 10px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
            display: none;
        }

        .assistant-container ul {
            list-style-type: none;
            padding: 0;
            margin: 0;
        }

        .assistant-container ul li {
            margin-bottom: 5px;
        }

        .assistant-button {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            font-size: 24px;
            cursor: pointer;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
        }

        .search-input {
            margin-bottom: 10px;
            width: 100%;
            padding: 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            box-sizing: border-box;
        }

        .estado-A {
            background-color: red;
            color: white;
        }
        .estado-C {
            background-color: blue;
            color: white;
        }
        .estado-L {
            background-color: #00FFFF;
            color: black;
        }
        .estado-P {
            background-color: green;
            color: white;
        }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.9.2/html2pdf.bundle.min.js"></script>
</head>
<body>
    <div class="container" id="content">
        <img src="logomuni.jpg" alt="Logo">
        <h2>Registro De Asistencias</h2>
        <div class="legend">
            <span class="A">AUSENTE</span>
            <span class="P">PRESENTE</span>
            <span class="L">LICENCIA</span>
            <span class="C">CERTIFICADO MEDICO</span>
        </div>
        <form id="registroForm" action="#">
            <table id="tablaRegistros">
                <thead>
                    <tr>
                        <th>Legajo</th>
                        <th>Nombre</th>
                        <script>
                            const fechaInicio = new Date();
                            const fechaFin = new Date(fechaInicio.getFullYear(), fechaInicio.getMonth() + 1, 0);
                            const mesActual = fechaInicio.getMonth() + 1;
                            for (let i = 1; i <= fechaFin.getDate(); i++) {
                                const fecha = new Date(fechaInicio.getFullYear(), mesActual - 1, i);
                                const diaSemana = fecha.getDay();
                                if (diaSemana !== 0 && diaSemana !== 6) {
                                    document.write(`<th>${i}/${mesActual}</th>`);
                                }
                            }
                        </script>
                    </tr>
                </thead>
                <tbody>
                    <script>
                        const registros = [
                           { legajo: '998', nombre: 'LEFIHUALA JUAN' },
{ legajo: '1192', nombre: 'GALLARDO MANOLO' },
{ legajo: '1690', nombre: 'ESCOBAR NESTOR' },
{ legajo: '1797', nombre: 'ARGUELLO LUIS' },
{ legajo: '2098', nombre: 'PAEZ REGINO' },
{ legajo: '3933', nombre: 'VANCUPE FRANCISCO' },
{ legajo: '3647', nombre: 'HERMOSILLA EDUARDO' },
{ legajo: '4463', nombre: 'VAZQUEZ ROSA' },
{ legajo: '4528', nombre: 'GUTIERREZ MONICA' },
{ legajo: '5122', nombre: 'PAILLAO MARLENE' },
{ legajo: '5381', nombre: 'MUÑOZ LAURA' },
{ legajo: '5197', nombre: 'PAILLAO PAOLA' },
{ legajo: '6510', nombre: 'MORA TOMAS' },
{ legajo: '7193', nombre: 'FUENTES ANDREA' },
{ legajo: '7433', nombre: 'CACERES JESSICA' },
{ legajo: '7471', nombre: 'CARRASCO MAURO' },
{ legajo: '8168', nombre: 'QUIROGA CLAUDIA' },
{ legajo: '8438', nombre: 'RAMIREZ GERALDINE' },
{ legajo: '8448', nombre: 'BARRIA ROMINA' },
{ legajo: '8630', nombre: 'ARANGUIZ JAVIER' },
{ legajo: '8732', nombre: 'CONCHA TAMARA' },
{ legajo: '8744', nombre: 'MORA MARIA BELEN' },
{ legajo: '8870', nombre: 'VERA DEBORA' },
{ legajo: '8909', nombre: 'CARRASCO VERONICA' },
{ legajo: '8925', nombre: 'VIDAL FULVIA' },
{ legajo: '8939', nombre: 'BITAR MARIA NANCY' },
{ legajo: '8953', nombre: 'RETAMAL ANTONELLA' },
{ legajo: '75', nombre: 'CANALE OMAR' },
{ legajo: '110', nombre: 'JARA LUIS' },
{ legajo: '123', nombre: 'MERCADO MIGUEL' },
{ legajo: '497', nombre: 'ARRATIA EVARISTO' },
{ legajo: '1055', nombre: 'MUÑOZ EUSTAQUIO' },
{ legajo: '2222', nombre: 'RAMIREZ DANIEL' },
{ legajo: '2545', nombre: 'ESPINOZA CARLOS' },
{ legajo: '3480', nombre: 'PEZO IRMA' },
{ legajo: '3578', nombre: 'MORALES DARIO' },
{ legajo: '4064', nombre: 'MEDINA ROSA' },
{ legajo: '4700', nombre: 'SOLIS SERGIO' },
{ legajo: '4759', nombre: 'GARCIA SAMUEL' },
{ legajo: '5224', nombre: 'CARRASCO JUAN' },
{ legajo: '5479', nombre: 'MOLINA RODRIGO' },
{ legajo: '5482', nombre: 'VILLEGAS YAQUELIN' },
{ legajo: '5511', nombre: 'PEZO VIRGINIA' },
{ legajo: '5798', nombre: 'MONTIEL LUCIANO' },
{ legajo: '5901', nombre: 'DIOMEDI NESTOR' },
{ legajo: '5973', nombre: 'ORELLANA FRANCO' },
{ legajo: '6131', nombre: 'CERDA ANA MARIA' },
{ legajo: '6647', nombre: 'PEZO ESTHER' },
{ legajo: '7115', nombre: 'SRYLO MIRTHA' },
{ legajo: '7437', nombre: 'VEGA SOLEDAD' },
{ legajo: '7748', nombre: 'ACUÑA LAUTARO' },
{ legajo: '7782', nombre: 'LOISA ABEL' },
{ legajo: '8012', nombre: 'MARIN ANDRES' },
{ legajo: '8048', nombre: 'IGNACIO RIVAS' },
{ legajo: '8055', nombre: 'ALMENDRA PABLO' },
{ legajo: '8254', nombre: 'ALARCON RUBEN' },
{ legajo: '9071', nombre: 'HUGO VERA' },

];


                        registros.forEach(registro => {
                            document.write(`<tr id="fila-${registro.legajo}">`);
                            document.write(`<td><input type="text" name="legajo[]" value="${registro.legajo}" readonly></td>`);
                            document.write(`<td><input type="text" name="nombre[]" value="${registro.nombre}" readonly></td>`);
                            for (let i = 1; i <= fechaFin.getDate(); i++) {
                                const fecha = new Date(fechaInicio.getFullYear(), mesActual - 1, i);
                                const diaSemana = fecha.getDay();
                                if (diaSemana !== 0 && diaSemana !== 6) {
                                    document.write(`<td><input type="text" name="asistencia[${registro.legajo}][${i}]" value="" onchange="actualizarRegistro('${registro.legajo}', '${i}', this.value)" onclick="cambiarEstado(this)"></td>`);
                                }
                            }
                            document.write(`</tr>`);
                        });

                        function getEstadoClass(estado) {
                            switch (estado) {
                                case 'A': return 'estado-A';
                                case 'C': return 'estado-C';
                                case 'L': return 'estado-L';
                                case 'P': return 'estado-P';
                                default: return '';
                            }
                        }
                    </script>
                </tbody>
            </table>
            <div class="clear"></div>
            <button type="button" onclick="descargarPDF()">Descargar PDF</button>
            <input type="button" value="Limpiar" onclick="limpiarCasillas()">
        </form>
    </div>

    <button class="assistant-button" onclick="toggleAssistant()">&#128269;</button>

    <div class="assistant-container" id="assistantContainer">
        <input type="text" class="search-input" id="searchInput" placeholder="Buscar por legajo o nombre" onkeyup="buscarRegistro()">
        <ul id="searchResults"></ul>
    </div>
        </div>
    </div>

    <script>
        document.addEventListener("DOMContentLoaded", function() {
            cargarRegistros();
        });

        function cargarRegistros() {
            fetch('cargar_registros.php')
                .then(response => response.json())
                .then(data => {
                    const registros = data;
                    Object.keys(registros).forEach(legajo => {
                        Object.keys(registros[legajo]).forEach(dia => {
                            const input = document.querySelector(`input[name="asistencia[${legajo}][${dia}]"]`);
                            if (input) {
                                input.value = registros[legajo][dia];
                                input.className = getEstadoClass(registros[legajo][dia]);
                            }
                        });
                    });
                });
        }

        function actualizarRegistro(legajo, dia, valor) {
            fetch('cargar_registros.php')
                .then(response => response.json())
                .then(data => {
                    const registros = data;
                    if (!registros[legajo]) {
                        registros[legajo] = {};
                    }
                    registros[legajo][dia] = valor;
                    return fetch('guardar_registros.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(registros)
                    });
                })
                .then(() => {
                    mostrarModal();
                });
        }

        function mostrarModal() {
            var modal = document.getElementById("myModal");
            modal.style.display = "block";
            setTimeout(function(){
                modal.style.display = "none";
            }, 2000);
        }

        function cambiarEstado(input) {
            const estados = ['A', 'C', 'L', 'P'];
            const clases = ['estado-A', 'estado-C', 'estado-L', 'estado-P'];
            let estadoActual = input.value;
            let indice = estados.indexOf(estadoActual);

            indice = (indice + 1) % estados.length;

            input.value = estados[indice];
            input.className = clases[indice];

            const nameParts = input.name.match(/asistencia\[(\d+)\]\[(\d+)\]/);
            if (nameParts) {
                actualizarRegistro(nameParts[1], nameParts[2], input.value);
            }
        }

        function limpiarCasillas() {
            document.querySelectorAll('#tablaRegistros tbody tr input[type="text"]').forEach(input => {
                input.value = '';
                input.className = '';
            });
            fetch('guardar_registros.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
        }

        function descargarPDF() {
            const element = document.getElementById('content');
            const buttons = element.querySelectorAll('button, input[type="button"]');

            buttons.forEach(button => {
                button.style.display = 'none';
            });

            const opt = {
                margin: 0.5,
                filename: 'horas_extras.pdf',
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 1.2 },
                jsPDF: { unit: 'in', format: 'a3', orientation: 'landscape' }
            };

            html2pdf().from(element).set(opt).save().then(() => {
                buttons.forEach(button => {
                    button.style.display = '';
                });
            });
        }

        function toggleAssistant() {
            const assistantContainer = document.getElementById('assistantContainer');
            if (assistantContainer.style.display === 'none' || assistantContainer.style.display === '') {
                assistantContainer.style.display = 'block';
            } else {
                assistantContainer.style.display = 'none';
            }
        }

        function buscarRegistro() {
            const input = document.getElementById('searchInput').value.toLowerCase();
            const resultados = document.getElementById('searchResults');
            resultados.innerHTML = '';
            registros.forEach(registro => {
                if (registro.legajo.toLowerCase().includes(input) || registro.nombre.toLowerCase().includes(input)) {
                    const li = document.createElement('li');
                    li.textContent = `${registro.legajo} - ${registro.nombre}`;
                    li.onclick = () => {
                        document.getElementById(`fila-${registro.legajo}`).scrollIntoView({ behavior: 'smooth' });
                        const fila = document.getElementById(`fila-${registro.legajo}`);
                        fila.style.backgroundColor = 'yellow';
                        setTimeout(() => {
                            fila.style.backgroundColor = '';
                        }, 2000);
                    };
                    resultados.appendChild(li);
                }
            });
        }
    </script>
</body>
</html>
