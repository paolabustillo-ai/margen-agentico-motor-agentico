(function () {
  'use strict';

  var STORAGE_KEY = 'margen-agentico-v1';

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
  function fmt(n)         { return (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)); }
  function fmtPct(n)      { return n.toFixed(1) + '%'; }

  // ── Motor Agéntico — lectura local opcional (solo lectura) ────────────────
  // Si el Motor no está corriendo, la app continúa en modo manual sin errores.
  function obtenerDatosMotor() {
    var controller = new AbortController();
    var tid = setTimeout(function () { controller.abort(); }, 3000);
    return fetch('http://localhost:8081/_live-data', {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    })
      .then(function (res) {
        clearTimeout(tid);
        if (!res.ok) return null;
        return res.json()
          .then(function (data) {
            if (!data || typeof data !== 'object') return null;
            return data;
          })
          .catch(function () { return null; });
      })
      .catch(function () {
        clearTimeout(tid);
        return null;
      });
  }

  // ── Costo IA asignado al proyecto ─────────────────────────────────────────
  // Cuando el Motor entrega datos, distribuye el costo IA mensual
  // entre los proyectos estimados del mes.
  // Si no hay datos suficientes, devuelve el fallback (valor manual).
  function calcularCostoIAAsignadoProyecto(datos, proyectosMes, fallback) {
    if (!datos) return fallback;
    var suscripciones = parseFloat(datos.costoSuscripcionesMensuales) || 0;
    var tokens        = parseFloat(datos.costoAcumuladoTokensAPI)     || 0;
    var totalIA       = suscripciones + tokens;
    if (totalIA <= 0) return fallback;
    return totalIA / Math.max(proyectosMes, 1);
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

  // ── Estado de conexión con el Motor ──────────────────────────────────────
  function setMotorStatus(connected) {
    var s = el('v-motor-status');
    if (!s) return;
    if (connected) {
      s.className   = 'motor-status motor-online';
      s.textContent = '● Motor conectado';
    } else {
      s.className   = 'motor-status motor-offline';
      s.textContent = '○ Motor offline · modo manual';
    }
  }

  // ── Persistencia local (localStorage) ────────────────────────────────────
  function saveToStorage() {
    try {
      var vals = {};
      document.querySelectorAll('.input-panel input').forEach(function (node) {
        vals[node.id] = node.value;
      });
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
  function restaurarDemo() {
    clearStorage();
    loadPreset('principiante');
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.input-panel input').forEach(function (input) {
      input.addEventListener('input', function () {
        clearPreset();
        recalc();
      });
    });

    updateClock();
    setInterval(updateClock, 1000);

    // Restaurar última sesión desde localStorage; si no hay, usar valores por defecto del HTML
    var hadStoredValues = loadFromStorage();
    recalc();

    // Intentar conectar con Motor Agéntico (no bloquea, falla silenciosamente)
    obtenerDatosMotor().then(function (data) {
      motorData = data;
      setMotorStatus(!!data);

      // Si el Motor entrega datos de costo IA y no hay sesión guardada, sugerir valor
      if (data && !hadStoredValues) {
        var inpIA        = el('inp-costo-ia');
        var proyectosMes = parseFloat(el('inp-proyectos-mes').value) || 1;
        var sugerido     = calcularCostoIAAsignadoProyecto(data, proyectosMes, null);
        if (inpIA && sugerido !== null && sugerido > 0) {
          inpIA.value = sugerido.toFixed(2);
          recalc();
        }
      }
    });
  });

  // ── Exponer para onclick en HTML ──────────────────────────────────────────
  window.loadPreset                      = loadPreset;
  window.clearPreset                     = clearPreset;
  window.restaurarDemo                   = restaurarDemo;
  window.calcularCostoIAAsignadoProyecto = calcularCostoIAAsignadoProyecto;

}());
