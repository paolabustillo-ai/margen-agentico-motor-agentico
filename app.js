(function () {
  'use strict';

  var STORAGE_KEY = 'margen-agentico-v1';

  // ── Multimoneda (v1.2 / v1.3) ─────────────────────────────────────────────
  // Solo afecta el FORMATO de los valores mostrados (símbolo/agrupación/locale).
  // No hay conversión de tasas: 1 unidad ingresada = 1 unidad mostrada.
  var CURRENCY_LOCALES = {
    USD: 'en-US',
    EUR: 'es-ES',
    COP: 'es-CO',
    MXN: 'es-MX',
    ARS: 'es-AR',
    CLP: 'es-CL',
    PEN: 'es-PE',
    BOB: 'es-BO',
    BRL: 'pt-BR',
    UYU: 'es-UY',
    PYG: 'es-PY',
    VES: 'es-VE',
    CRC: 'es-CR',
    GTQ: 'es-GT',
    HNL: 'es-HN',
    NIO: 'es-NI',
    PAB: 'es-PA',
    DOP: 'es-DO',
    CAD: 'en-CA',
    GBP: 'en-GB',
    CHF: 'de-CH',
    AUD: 'en-AU',
    NZD: 'en-NZ',
    JPY: 'ja-JP'
  };
  var DEFAULT_CURRENCY      = 'USD';
  var CUSTOM_CURRENCY_VALUE = 'OTRA'; // valor especial del <select> para "Otra moneda"
  var currentCurrency       = DEFAULT_CURRENCY;

  // ── Demo de soporte mensual (v1.2) ────────────────────────────────────────
  var DEMO_SOPORTE = { soporteCobrado: 80, soporteCosto: 30 };

  // ── Presets (modo demo) ───────────────────────────────────────────────────
  // principiante → pérdida  |  intermedio → revisar  |  avanzado → rentable
  var PRESETS = {
    principiante: {
      precioCobrado: 150,  costoIA: 8,  horas: 6,   tarifa: 15,
      costosFijos:   150,  proyectosMes: 3, otrosCostos: 0,
      comision: 10,  impuestos: 15,  margenDeseado: 20
    },
    intermedio: {
      precioCobrado: 800,  costoIA: 20, horas: 12,  tarifa: 30,
      costosFijos:   300,  proyectosMes: 4, otrosCostos: 20,
      comision: 5,   impuestos: 20,  margenDeseado: 30
    },
    avanzado: {
      precioCobrado: 3000, costoIA: 50, horas: 20,  tarifa: 50,
      costosFijos:   600,  proyectosMes: 5, otrosCostos: 30,
      comision: 5,   impuestos: 15,  margenDeseado: 30
    }
  };

  var activePreset = null;
  var motorData    = null;

  // ── DOM helpers ───────────────────────────────────────────────────────────
  function el(id)         { return document.getElementById(id); }
  function setText(id, t) { var n = el(id); if (n) n.textContent = t; }
  function fmtPct(n)      { return n.toFixed(1) + '%'; }

  // Formatea un monto en la moneda seleccionada (solo presentación).
  // Fallback simple "$codigo valor" si el navegador no soporta el código de moneda.
  function fmt(n) {
    try {
      return new Intl.NumberFormat(CURRENCY_LOCALES[currentCurrency] || 'en-US', {
        style: 'currency',
        currency: currentCurrency,
        maximumFractionDigits: 0
      }).format(n);
    } catch (e) {
      return (n < 0 ? '-' : '') + currentCurrency + ' ' + Math.round(Math.abs(n));
    }
  }

  // ── Moneda personalizada ("Otra moneda") ──────────────────────────────────
  // Nota: Intl.NumberFormat valida que el código tenga forma de moneda (3 letras),
  // no que exista realmente en el registro ISO 4217. Por eso NO se intenta "detectar"
  // códigos inválidos: cualquier código de 3 letras se acepta y se usa tal cual.
  // Si el código no tiene símbolo reconocido, Intl.NumberFormat ya cae por sí solo
  // a mostrar el propio código como prefijo (ej. "ZZZ 100"), sin lanzar error.

  // Solo letras, mayúsculas, máximo 3 caracteres (código ISO 4217).
  function sanitizeCurrencyCode(raw) {
    return (raw || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  }

  // Recalcula currentCurrency a partir del <select> + input personalizado,
  // y muestra/oculta el campo de código manual y su nota informativa.
  function syncCurrencySelection() {
    var sel    = el('inp-currency');
    var custom = el('inp-currency-custom');
    var note   = el('v-currency-note');
    if (!sel) return;

    var isCustom = sel.value === CUSTOM_CURRENCY_VALUE;
    if (custom) custom.classList.toggle('hidden', !isCustom);
    if (note)   note.classList.toggle('hidden', !isCustom);

    if (isCustom) {
      var code = sanitizeCurrencyCode(custom ? custom.value : '');
      if (custom && custom.value !== code) custom.value = code;
      currentCurrency = code.length === 3 ? code : DEFAULT_CURRENCY;
    } else {
      currentCurrency = sel.value || DEFAULT_CURRENCY;
    }
  }

  // ── Motor Agéntico — lectura local opcional (solo lectura) ────────────────
  // Si el Motor no está corriendo, la app continúa en modo manual sin errores.
  // Nunca colapsa todo a null: devuelve un estado explícito para que la UI
  // distinga "Motor inalcanzable" de "endpoint no expuesto" de "respondió con
  // datos inválidos" de "conectado".
  //
  // ESTADO CONFIRMADO EN ESTA INSTALACIÓN (verificado en navegador): las rutas
  // /_live-data, /api/live-data y /data devuelven 404. No hay endpoint público
  // estable confirmado hoy. Motor Agéntico sí muestra datos por run/workspace
  // en su propia UI — pero Margen Agéntico no tiene, hoy, una forma confirmada
  // de leerlos por HTTP. El código de mapeo de abajo queda preparado para
  // cuando el Motor exponga ese endpoint; hasta entonces, la integración
  // automática está inactiva y la app opera en modo manual.
  var MOTOR_ENDPOINT = 'http://localhost:8081/_live-data';

  function obtenerDatosMotor() {
    var controller = new AbortController();
    var tid = setTimeout(function () { controller.abort(); }, 3000);
    return fetch(MOTOR_ENDPOINT, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    })
      .then(function (res) {
        clearTimeout(tid);
        // 404 = el Motor respondió pero esta ruta no existe (caso confirmado
        // hoy). Se distingue de otros fallos porque no es "Motor apagado".
        if (res.status === 404) return { status: 'endpoint_no_expuesto', data: null };
        if (!res.ok) return { status: 'no_disponible', data: null };
        return res.json()
          .then(function (data) {
            if (!data || typeof data !== 'object') return { status: 'respuesta_invalida', data: null };
            return { status: 'conectado', data: data };
          })
          .catch(function () { return { status: 'respuesta_invalida', data: null }; });
      })
      .catch(function () {
        clearTimeout(tid);
        return { status: 'no_disponible', data: null };
      });
  }

  // ── Mapeo del schema real de /_live-data (confirmado, no inventado) ───────
  // Campos usados: subscriptions[].monthlyPrice, runs[].cost, runs[].workspace.
  // Campos que existen en el schema pero NO se usan en ningún cálculo:
  // usage, usage.claudeWindow, modelUsage, daily, recentProjects — son solo
  // informativos y se dejan fuera a propósito para no inventar lógica sobre
  // una forma de datos no confirmada, y para evitar doble conteo.
  //
  // costoSuscripcionesMensuales / costoAcumuladoTokensAPI NO existen en el
  // Motor real — eliminados (eran nombres de campo inventados en v1.x).

  // Suma subscriptions[].monthlyPrice. Soporta tanto array como objeto-mapa.
  // Alimenta "Costos mensuales de herramientas" — NUNCA el costo IA del proyecto.
  function extraerCostosFijosDeSubscripciones(datos) {
    if (!datos || !datos.subscriptions) return null;
    var subs = datos.subscriptions;
    var lista = Array.isArray(subs) ? subs : Object.keys(subs).map(function (k) { return subs[k]; });
    var total = 0;
    var encontrado = false;
    lista.forEach(function (s) {
      if (s && typeof s.monthlyPrice === 'number') {
        total += s.monthlyPrice;
        encontrado = true;
      }
    });
    return encontrado ? total : null;
  }

  // Suma runs[].cost cuyo runs[].workspace coincide con el workspace/carpeta
  // que el usuario indicó para este proyecto (Margen no tiene otra forma de
  // saber "cuál proyecto" es este). Alimenta "Costo IA asignado al proyecto"
  // — NUNCA "Costos mensuales de herramientas" (evita doble conteo).
  function extraerCostoIADeRuns(datos, workspaceNombre) {
    if (!datos || !Array.isArray(datos.runs) || !workspaceNombre) return null;
    var nombre = String(workspaceNombre).trim().toLowerCase();
    if (!nombre) return null;
    var total = 0;
    var encontrado = false;
    datos.runs.forEach(function (run) {
      if (!run || !run.workspace || typeof run.cost !== 'number') return;
      if (String(run.workspace).toLowerCase().indexOf(nombre) !== -1) {
        total += run.cost;
        encontrado = true;
      }
    });
    return encontrado ? total : null;
  }

  // ── Read all inputs ───────────────────────────────────────────────────────
  function getInputs() {
    return {
      precioCobrado : parseFloat(el('inp-precio').value)         || 0,
      costoIA       : parseFloat(el('inp-costo-ia').value)       || 0,
      horas         : parseFloat(el('inp-horas').value)          || 0,
      tarifa        : parseFloat(el('inp-tarifa').value)         || 0,
      costosFijos   : parseFloat(el('inp-costos-fijos').value)   || 0,
      proyectosMes  : parseFloat(el('inp-proyectos-mes').value)  || 1,
      otrosCostos   : parseFloat(el('inp-otros-costos').value)   || 0,
      comision      : parseFloat(el('inp-comision').value)       || 0,
      impuestos     : parseFloat(el('inp-impuestos').value)      || 0,
      margenDeseado : parseFloat(el('inp-margen-deseado').value) || 0
    };
  }

  // ── Core calculations ─────────────────────────────────────────────────────
  //
  // costoBase = costoIA + costoHumano + costoProporcional + otrosCostos
  // factor    = 1 − (comision + impuestos + margenDeseado) / 100
  // pmin      = costoBase / factor   [válido solo si factor > 0]
  //
  // Comisión e impuestos se calculan sobre el precio cobrado (no sobre el costo),
  // porque en la práctica se descuentan del ingreso, no se suman al costo.
  //
  function calculate(inp) {
    var costoHumano       = inp.horas * inp.tarifa;
    var proyectosMes      = Math.max(inp.proyectosMes, 1);
    var costoProporcional = inp.costosFijos / proyectosMes;
    var costoBase         = inp.costoIA + costoHumano + costoProporcional + inp.otrosCostos;

    var comisionValor  = inp.precioCobrado * (inp.comision  / 100);
    var impuestosValor = inp.precioCobrado * (inp.impuestos / 100);

    var margenReal           = inp.precioCobrado - costoBase - comisionValor - impuestosValor;
    var porcentajeMargenReal = inp.precioCobrado > 0 ? (margenReal / inp.precioCobrado) * 100 : 0;
    var iaPct                = inp.precioCobrado > 0 ? (inp.costoIA / inp.precioCobrado) * 100 : 0;

    var factor = 1 - (inp.comision + inp.impuestos + inp.margenDeseado) / 100;
    var pmin   = factor > 0 ? costoBase / factor : null;
    var diff   = pmin !== null ? inp.precioCobrado - pmin : null;

    var estado;
    if      (margenReal <= 0)                            estado = 'pérdida';
    else if (porcentajeMargenReal < inp.margenDeseado)   estado = 'revisar';
    else                                                 estado = 'rentable';

    return {
      inp,
      costoHumano,
      costoProporcional,
      costoBase,
      comisionValor,
      impuestosValor,
      margenReal,
      porcentajeMargenReal,
      iaPct,
      pmin,
      diff,
      estado,
      totalDeducible: costoBase + comisionValor + impuestosValor
    };
  }

  // ── Módulo independiente: soporte / mantenimiento mensual (v1.2) ──────────
  // NO se mezcla con costoBase ni con el precio mínimo rentable del proyecto.
  // Reutiliza los mismos % de comisión, impuestos y margen deseado configurados
  // en el panel de configuración, pero se evalúa por separado.
  function getSoporteInputs() {
    return {
      soporteCobrado: parseFloat(el('inp-soporte-cobrado').value) || 0,
      soporteCosto  : parseFloat(el('inp-soporte-costo').value)   || 0,
      comision      : parseFloat(el('inp-comision').value)        || 0,
      impuestos     : parseFloat(el('inp-impuestos').value)       || 0,
      margenDeseado : parseFloat(el('inp-margen-deseado').value)  || 0
    };
  }

  function calculateSoporte(s) {
    var comisionSoporte = s.soporteCobrado * (s.comision / 100);
    var impuestoSoporte = s.soporteCobrado * (s.impuestos / 100);

    var margenSoporteReal = s.soporteCobrado - s.soporteCosto - comisionSoporte - impuestoSoporte;
    var porcentajeMargenSoporte = s.soporteCobrado > 0 ? (margenSoporteReal / s.soporteCobrado) * 100 : 0;

    var estadoSoporte;
    if      (margenSoporteReal <= 0)                          estadoSoporte = 'pérdida en soporte';
    else if (porcentajeMargenSoporte < s.margenDeseado)       estadoSoporte = 'revisar soporte';
    else                                                      estadoSoporte = 'soporte rentable';

    return {
      s,
      comisionSoporte,
      impuestoSoporte,
      margenSoporteReal,
      porcentajeMargenSoporte,
      estadoSoporte
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function setBar(barId, pctId, value, total) {
    var pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
    var bar = el(barId);
    if (bar) bar.style.width = pct.toFixed(1) + '%';
    setText(pctId, Math.round(pct) + '%');
  }

  function render(r) {
    var inp = r.inp;

    // ── Metric cards ──────────────────────────────────────────────────────
    setText('v-precio', fmt(inp.precioCobrado));

    setText('v-ia',     fmt(inp.costoIA));
    setText('v-ia-sub', 'costo IA asignado al proyecto');

    var vm = el('v-margen');
    if (vm) {
      vm.textContent = fmt(r.margenReal);
      vm.className   = 'mc-val ' + (r.margenReal > 0 ? 'green' : 'red');
    }
    var vms = el('v-margen-sub');
    if (vms) {
      vms.textContent = fmtPct(r.porcentajeMargenReal) + ' del ingreso';
      vms.style.color = r.margenReal > 0 ? 'var(--green)' : 'var(--red)';
    }

    setText('v-iapct', fmtPct(r.iaPct));
    var sem = el('v-sem');
    if (sem) {
      if      (r.iaPct < 15) { sem.className = 'sem g'; sem.innerHTML = '<span class="sem-dot"></span> consumo sano'; }
      else if (r.iaPct < 30) { sem.className = 'sem y'; sem.innerHTML = '<span class="sem-dot"></span> revisar consumo'; }
      else                   { sem.className = 'sem r'; sem.innerHTML = '<span class="sem-dot"></span> consumo alto'; }
    }

    // ── Precio mínimo rentable ─────────────────────────────────────────────
    if (r.pmin !== null) {
      setText('v-pmin',     fmt(r.pmin));
      setText('v-pmin-pct', inp.margenDeseado.toFixed(0));
      var vd = el('v-diff');
      if (vd) {
        if (r.diff >= 0) {
          vd.style.color = 'var(--green)';
          vd.textContent = '✓ Cobrarías ' + fmt(r.diff) + ' por encima del mínimo';
        } else {
          vd.style.color = 'var(--red)';
          vd.textContent = '✗ Estarías ' + fmt(Math.abs(r.diff)) + ' por debajo del mínimo';
        }
      }
    } else {
      setText('v-pmin',     '—');
      setText('v-pmin-pct', '—');
      var vd2 = el('v-diff');
      if (vd2) {
        vd2.style.color = 'var(--red)';
        vd2.textContent = '⚠ La suma de comisión + impuestos + margen supera el 100%';
      }
    }

    var pill = el('v-pill');
    if (pill) {
      if      (r.estado === 'rentable') { pill.className = 'pill pv'; pill.textContent = '● Este precio sería rentable'; }
      else if (r.estado === 'revisar')  { pill.className = 'pill py'; pill.textContent = '● Este precio debería revisarse'; }
      else                              { pill.className = 'pill pr'; pill.textContent = '● Este precio generaría pérdida'; }
    }

    // ── Desglose de costos ─────────────────────────────────────────────────
    setText('v-costo-ia-b',     fmt(inp.costoIA));
    setText('v-costo-humano',   fmt(r.costoHumano));
    setText('v-costo-fijo',     fmt(r.costoProporcional));
    setText('v-otros-b',        fmt(inp.otrosCostos));
    setText('v-comision-real',  fmt(r.comisionValor));
    setText('v-impuestos-real', fmt(r.impuestosValor));
    setText('v-costo-base',     fmt(r.costoBase));
    setText('v-total-costos',   fmt(r.totalDeducible));

    var t = r.totalDeducible;
    setBar('bar-ia',        'pct-ia',        inp.costoIA,          t);
    setBar('bar-human',     'pct-human',     r.costoHumano,        t);
    setBar('bar-fixed',     'pct-fixed',     r.costoProporcional,  t);
    setBar('bar-otros',     'pct-otros',     inp.otrosCostos,      t);
    setBar('bar-comision',  'pct-comision',  r.comisionValor,      t);
    setBar('bar-impuestos', 'pct-impuestos', r.impuestosValor,     t);
  }

  function renderSoporte(rs) {
    setText('v-soporte-cobrado', fmt(rs.s.soporteCobrado));
    setText('v-soporte-costo',   fmt(rs.s.soporteCosto));

    var vm = el('v-soporte-margen');
    if (vm) {
      vm.textContent = fmt(rs.margenSoporteReal);
      vm.className   = 'pmin-val ' + (rs.margenSoporteReal > 0 ? 'green' : 'red');
    }
    setText('v-soporte-margen-pct', fmtPct(rs.porcentajeMargenSoporte));

    var pill = el('v-soporte-pill');
    if (pill) {
      if      (rs.estadoSoporte === 'soporte rentable') { pill.className = 'pill pv'; pill.textContent = '● Soporte rentable'; }
      else if (rs.estadoSoporte === 'revisar soporte')  { pill.className = 'pill py'; pill.textContent = '● Revisar soporte'; }
      else                                              { pill.className = 'pill pr'; pill.textContent = '● Pérdida en soporte'; }
    }
  }

  // ── Estado de conexión con el Motor ──────────────────────────────────────
  var MOTOR_STATUS_TEXT = {
    no_disponible           : '○ Motor no disponible: modo manual',
    endpoint_no_expuesto    : '○ Endpoint no expuesto: modo manual',
    respuesta_invalida      : '○ Respuesta inválida: modo manual',
    conectado_con_datos     : '● Motor conectado: usando datos del Motor',
    conectado_sin_workspace : '● Motor conectado: sin workspace claro, usando modo manual'
  };
  var MOTOR_STATUS_CLASS = {
    no_disponible           : 'motor-status motor-offline',
    endpoint_no_expuesto    : 'motor-status motor-offline',
    respuesta_invalida      : 'motor-status motor-offline',
    conectado_con_datos     : 'motor-status motor-online',
    conectado_sin_workspace : 'motor-status motor-partial'
  };

  function setMotorStatus(estado) {
    var s = el('v-motor-status');
    if (!s) return;
    s.className   = MOTOR_STATUS_CLASS[estado] || 'motor-status motor-offline';
    s.textContent = MOTOR_STATUS_TEXT[estado]  || '○ Motor offline · modo manual';
  }

  // ── Persistencia local (localStorage) ────────────────────────────────────
  function saveToStorage() {
    try {
      var vals = {};
      document.querySelectorAll('.input-panel input').forEach(function (node) {
        vals[node.id] = node.value;
      });
      var cur = el('inp-currency');
      if (cur) vals['inp-currency'] = cur.value;
      var curCustom = el('inp-currency-custom');
      if (curCustom) vals['inp-currency-custom'] = curCustom.value;
      var sc = el('inp-soporte-cobrado');
      if (sc) vals['inp-soporte-cobrado'] = sc.value;
      var sco = el('inp-soporte-costo');
      if (sco) vals['inp-soporte-costo'] = sco.value;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(vals));
    } catch (e) {}
  }

  function loadFromStorage() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var vals = JSON.parse(raw);
      var loaded = false;
      Object.keys(vals).forEach(function (id) {
        var node = el(id);
        if (node) { node.value = vals[id]; loaded = true; }
      });
      return loaded;
    } catch (e) {
      return false;
    }
  }

  function clearStorage() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // ── Status bar clock ──────────────────────────────────────────────────────
  function updateClock() {
    var now = new Date();
    var d   = now.toISOString().slice(0, 10).replace(/-/g, '.');
    var t   = now.toTimeString().slice(0, 8);
    setText('v-statusbar-right', d + ' · ' + t);
  }

  // ── Main recalc ───────────────────────────────────────────────────────────
  function recalc() {
    render(calculate(getInputs()));
    renderSoporte(calculateSoporte(getSoporteInputs()));
    saveToStorage();
  }

  // ── Preset loading ────────────────────────────────────────────────────────
  function loadPreset(name) {
    var p = PRESETS[name];
    if (!p) return;

    el('inp-precio').value         = p.precioCobrado;
    el('inp-costo-ia').value       = p.costoIA;
    el('inp-horas').value          = p.horas;
    el('inp-tarifa').value         = p.tarifa;
    el('inp-costos-fijos').value   = p.costosFijos;
    el('inp-proyectos-mes').value  = p.proyectosMes;
    el('inp-otros-costos').value   = p.otrosCostos;
    el('inp-comision').value       = p.comision;
    el('inp-impuestos').value      = p.impuestos;
    el('inp-margen-deseado').value = p.margenDeseado;

    ['principiante', 'intermedio', 'avanzado'].forEach(function (k) {
      var btn = el('btn-' + k);
      if (btn) btn.classList.toggle('active', k === name);
    });

    activePreset = name;
    recalc();
  }

  function clearPreset() {
    ['principiante', 'intermedio', 'avanzado'].forEach(function (k) {
      var btn = el('btn-' + k);
      if (btn) btn.classList.remove('active');
    });
    activePreset = null;
  }

  // Limpia valores guardados y carga el preset principiante como punto de partida.
  // También restaura moneda, valores demo del módulo de soporte, y las notas/campo
  // de integración con el Motor (workspace, notas dinámicas de costo IA/costos fijos).
  function restaurarDemo() {
    clearStorage();
    loadPreset('principiante');

    var sc  = el('inp-soporte-cobrado');
    var sco = el('inp-soporte-costo');
    if (sc)  sc.value  = DEMO_SOPORTE.soporteCobrado;
    if (sco) sco.value = DEMO_SOPORTE.soporteCosto;

    var cur    = el('inp-currency');
    var custom = el('inp-currency-custom');
    if (cur)    cur.value    = DEFAULT_CURRENCY;
    if (custom) custom.value = '';
    syncCurrencySelection();

    var wsField = el('inp-motor-workspace');
    if (wsField) wsField.value = '';
    var notaIA = el('v-costo-ia-note');
    if (notaIA) notaIA.textContent = 'MVP: manual/simulado · Futuro: leído desde Motor Agéntico cuando haya asignación clara';
    var notaFijos = el('v-costos-fijos-note');
    if (notaFijos) notaFijos.classList.add('hidden');

    recalc();
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    // Solo los campos del proyecto limpian el preset activo. El panel de
    // soporte (.input-panel-soporte) es un módulo independiente y no debe afectarlo.
    document.querySelectorAll('.input-panel:not(.input-panel-soporte) input').forEach(function (input) {
      input.addEventListener('input', function () {
        clearPreset();
        recalc();
      });
    });

    // Moneda: cambia el formato de los valores mostrados, no altera cálculos.
    var currencySelect = el('inp-currency');
    var currencyCustom = el('inp-currency-custom');
    if (currencySelect) {
      currencySelect.addEventListener('change', function () {
        syncCurrencySelection();
        recalc();
      });
    }
    if (currencyCustom) {
      currencyCustom.addEventListener('input', function () {
        syncCurrencySelection();
        recalc();
      });
    }

    // Soporte mensual: módulo independiente, no limpia el preset del proyecto.
    ['inp-soporte-cobrado', 'inp-soporte-costo'].forEach(function (id) {
      var node = el(id);
      if (node) node.addEventListener('input', recalc);
    });

    // Workspace del Motor: si ya llegaron datos del Motor, cada cambio re-evalúa
    // el match contra runs[].workspace en vivo (sin volver a pedir la red).
    var workspaceField = el('inp-motor-workspace');
    if (workspaceField) {
      workspaceField.addEventListener('input', function () {
        if (!motorData) return;
        var costoIASugerido = extraerCostoIADeRuns(motorData, workspaceField.value);
        if (costoIASugerido !== null && costoIASugerido > 0) {
          var inpIA = el('inp-costo-ia');
          if (inpIA) inpIA.value = costoIASugerido.toFixed(2);
          var notaIA = el('v-costo-ia-note');
          if (notaIA) notaIA.textContent = 'Costo IA asignado leído desde runs/workspace';
          setMotorStatus('conectado_con_datos');
          recalc();
        } else {
          setMotorStatus('conectado_sin_workspace');
        }
      });
    }

    updateClock();
    setInterval(updateClock, 1000);

    // Restaurar última sesión desde localStorage; si no hay, usar valores por defecto del HTML
    var hadStoredValues = loadFromStorage();
    syncCurrencySelection();
    recalc();

    // Intentar conectar con Motor Agéntico (no bloquea, nunca cae a null silencioso:
    // siempre resuelve con un estado explícito — conectado / no_disponible / respuesta_invalida).
    obtenerDatosMotor().then(function (resultado) {
      motorData = resultado.data;

      if (resultado.status !== 'conectado') {
        setMotorStatus(resultado.status);
        return;
      }

      var wsField          = el('inp-motor-workspace');
      var workspaceNombre  = wsField ? wsField.value : '';
      var costoIASugerido      = extraerCostoIADeRuns(resultado.data, workspaceNombre);
      var costosFijosSugeridos = extraerCostosFijosDeSubscripciones(resultado.data);

      // Nunca se sobreescribe una sesión ya restaurada desde localStorage:
      // el Motor solo autocompleta cuando el usuario parte de valores por defecto.
      if (!hadStoredValues) {
        if (costoIASugerido !== null && costoIASugerido > 0) {
          var inpIA = el('inp-costo-ia');
          if (inpIA) inpIA.value = costoIASugerido.toFixed(2);
          var notaIA = el('v-costo-ia-note');
          if (notaIA) notaIA.textContent = 'Costo IA asignado leído desde runs/workspace';
        }
        if (costosFijosSugeridos !== null && costosFijosSugeridos > 0) {
          var inpFijos = el('inp-costos-fijos');
          if (inpFijos) inpFijos.value = costosFijosSugeridos.toFixed(2);
          var notaFijos = el('v-costos-fijos-note');
          if (notaFijos) notaFijos.classList.remove('hidden');
        }
        recalc();
      }

      setMotorStatus(costoIASugerido !== null && costoIASugerido > 0 ? 'conectado_con_datos' : 'conectado_sin_workspace');
    });
  });

  // ── Exponer para onclick en HTML ──────────────────────────────────────────
  window.loadPreset    = loadPreset;
  window.clearPreset   = clearPreset;
  window.restaurarDemo = restaurarDemo;

}());
