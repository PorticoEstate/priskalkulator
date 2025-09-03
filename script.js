async function loadCSV(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Kunne ikke laste CSV: ${res.status}`);
  const text = await res.text();
  return text;
}

function normalizeToken(t) {
  return t.replace(/^\s+|\s+$/g, '');
}

function toInt(s) {
  const n = parseInt(String(s).replace(/\s/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

// Tolerant linje-parser for uregelmessig CSV med ekstra komma og tomme kolonner.
function parseLine(line) {
  // hopp tomme linjer
  if (!line || /^\s*$/.test(line)) return null;

  // Split grovt på komma
  let parts = line.split(',').map(normalizeToken);

  // Fjern tomme trailing kolonner
  while (parts.length && parts[parts.length - 1] === '') parts.pop();

  // Header håndteres separat
  if (parts[0] === 'Hvor' && parts[1] === 'Hva') return null;

  // Finn siste numeriske felt = Sats
  let idxSats = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (/^-?\d+(?:\s\d{3})*$/.test(parts[i]) || /^\d+$/.test(parts[i])) { idxSats = i; break; }
  }
  if (idxSats < 0) return null;

  const sats = toInt(parts[idxSats]);

  // Enhet er som regel feltet før sats
  const idxEnhet = idxSats - 1;
  const enhet = idxEnhet >= 0 ? parts[idxEnhet] : '';

  // Kjente formål
  const FORMAL_VALUES = new Set(['Alle', 'Andre', 'turneringer', 'barn 8-12 år']);

  // Finn formål ved å lete bakover før enhet
  let idxFormal = -1;
  for (let i = idxEnhet - 1; i >= 0; i--) {
    const token = parts[i];
    if (FORMAL_VALUES.has(token)) { idxFormal = i; break; }
  }

  // Hvis ikke funnet, prøv å anta at formål står i headerposisjon 2
  if (idxFormal === -1 && parts.length >= 3) {
    // Bruk heuristikk: korte ord og uten mellomrom kan være formål
    const cand = parts[2];
    if (FORMAL_VALUES.has(cand)) idxFormal = 2;
  }

  // Hvor er første felt
  const hvor = parts[0] || '';

  // Hva = alle felt mellom start (1) og før enhet, ekskluder formål hvis det finnes
  let hvaTokens = parts.slice(1, idxEnhet);
  if (idxFormal >= 1) {
    // Fjern selve formål-tokenet fra hvaTokens
    hvaTokens = hvaTokens.filter((_, j) => (j + 1) !== idxFormal);
  }
  const hva = normalizeToken(hvaTokens.join(', ').replace(/\s+,\s+/g, ', '));

  const formal = idxFormal >= 0 ? parts[idxFormal] : 'Alle';

  return { hvor, hva, formal, enhet, sats };
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    const r = parseLine(line);
    if (r) rows.push(r);
  }
  return rows;
}

function unique(arr) { return [...new Set(arr)]; }
function sortLocale(arr) { return [...arr].sort((a,b) => a.localeCompare(b, 'nb')); }

function formatCurrency(n) { return n.toLocaleString('nb-NO') + ',- kr'; }

(async function init() {
  const hvorSel = document.getElementById('hvor');
  const hvaSel = document.getElementById('hva');
  const formalSel = document.getElementById('formal');
  const antallInput = document.getElementById('antall');
  const enhetLabel = document.getElementById('enhet');
  const prisOut = document.getElementById('pris');
  const note = document.getElementById('note');
  const addBtn = document.getElementById('add-to-cart');
  const printBtn = document.getElementById('print-pdf');
  const kundeInput = document.getElementById('kunde');
  const ordreInput = document.getElementById('ordre');
  const printMeta = document.getElementById('print-meta');
  const cartTable = document.getElementById('cart-table');
  const cartTbody = cartTable.querySelector('tbody');
  const cartSum = document.getElementById('cart-sum');
  const cartEmpty = document.getElementById('cart-empty');
  const cartActions = document.querySelector('.cart-actions');

  let rows = [];
  let currentMatch = null;
  const cart = [];
  try {
    const csv = await loadCSV('gebyrregulativ_2025.csv');
  rows = parseCSV(csv);
  } catch (e) {
    note.textContent = String(e.message || e);
    return;
  }

  // Populer "Hvor"
  const hvorList = sortLocale(unique(rows.map(r => r.hvor).filter(Boolean)));
  hvorSel.innerHTML = ['<option value="" selected>Velg hvor</option>']
    .concat(hvorList.map(v => `<option value="${v}">${v}</option>`)).join('');

  function refreshHva() {
    const hvor = hvorSel.value;
    if (!hvor) {
      hvaSel.innerHTML = '<option value="" selected>Velg hvor først</option>';
      hvaSel.disabled = true;
  enhetLabel.textContent = '';
      return;
    }
  const hvaList = sortLocale(unique(rows.filter(r => r.hvor === hvor).map(r => r.hva).filter(Boolean)));
    hvaSel.innerHTML = ['<option value="" selected>Velg Hva</option>']
      .concat(hvaList.map(v => `<option value="${v}">${v}</option>`)).join('');
    hvaSel.disabled = false;
  }

  function refreshFormal() {
    const hvor = hvorSel.value;
    if (!hvor) {
      formalSel.innerHTML = '<option value="" selected>Velg hvor først</option>';
      formalSel.disabled = true;
      return;
    }
    const current = formalSel.value;
  const formalList = sortLocale(unique(rows.filter(r => r.hvor === hvor).map(r => r.formal).filter(Boolean)));
    formalSel.innerHTML = ['<option value="" selected>Velg Formål</option>']
      .concat(formalList.map(v => `<option value="${v}">${v}</option>`)).join('');
    formalSel.disabled = false;
    if (current && formalList.includes(current)) formalSel.value = current;
  }

  function calculate() {
  const hvor = hvorSel.value; const hva = hvaSel.value; const formal = formalSel.value;
    const antall = Math.max(1, parseInt(antallInput.value || '1', 10));
    if (!hvor || !formal) {
      prisOut.textContent = '0,- kr';
      enhetLabel.textContent = '';
      note.textContent = 'Velg Hvor og Formål.';
      return;
    }
  const hasHva = !!hva;
  let match = (hasHva ? rows.find(r => r.hvor === hvor && r.hva === hva && r.formal === formal) : null);
    let noteText = '';
    if (!match) {
      // Fallback: kalkuler per Hvor + Formål hvis spesifikk Hva ikke finnes
  const candidates = rows.filter(r => r.hvor === hvor && r.formal === formal);
      if (candidates.length) {
        match = candidates[0];
        noteText = 'Pris basert på Hvor + Formål (ikke spesifikt for valgt Hva).';
      } else {
        prisOut.textContent = '0,- kr';
        enhetLabel.textContent = '';
        note.textContent = 'Ingen match – sjekk valg eller CSV.';
        currentMatch = null;
        addBtn && (addBtn.disabled = true);
        return;
      }
    }
    const total = (match.sats || 0) * antall;
    prisOut.textContent = formatCurrency(total);
  // Vis enhet kun etter at 'Hva' er valgt
  enhetLabel.textContent = hasHva && match.enhet ? `(${match.enhet})` : '';
    const base = `Enhetssats: ${formatCurrency(match.sats)}${match.enhet ? ` per ${match.enhet}` : ''}`;
    note.textContent = noteText ? `${base}. ${noteText}` : base;
    currentMatch = { ...match, antall };
    addBtn && (addBtn.disabled = false);
  }

  // Første init
  refreshHva();
  refreshFormal();
  calculate();

  // Lyttere
  hvorSel.addEventListener('change', () => {
    antallInput.value = '1';
    enhetLabel.textContent = '';
    refreshHva();
    refreshFormal();
    calculate();
  });
  hvaSel.addEventListener('change', () => { calculate(); });
  formalSel.addEventListener('change', calculate);
  antallInput.addEventListener('input', calculate);

  // (Søkefelt fjernet)

  // Handlekurv
  function renderCart() {
    if (!cart.length) {
      cartTable.hidden = true;
      cartActions.hidden = true;
      cartEmpty.style.display = 'block';
      cartSum.textContent = '0,- kr';
      return;
    }
    cartTable.hidden = false;
    cartActions.hidden = false;
    cartEmpty.style.display = 'none';
    cartTbody.innerHTML = cart.map((item, idx) => {
      const line = item.sats * item.antall;
      return `<tr>
        <td data-label="Hvor">${item.hvor}</td>
        <td data-label="Hva">${item.hva || '<em>(ikke spesifikt)</em>'}</td>
        <td data-label="Formål">${item.formal}</td>
        <td data-label="Enhetssats">${formatCurrency(item.sats)}${item.enhet ? ` / ${item.enhet}` : ''}</td>
        <td data-label="Antall">
          <input type="number" min="1" value="${item.antall}" data-idx="${idx}" class="cart-qty" />
        </td>
        <td data-label="Linjetotal">${formatCurrency(line)}</td>
        <td data-label="Fjern"><button type="button" class="remove" data-idx="${idx}">Fjern</button></td>
      </tr>`;
    }).join('');
    const sum = cart.reduce((s, it) => s + it.sats * it.antall, 0);
    cartSum.textContent = formatCurrency(sum);

    // Bind events
    cartTbody.querySelectorAll('input.cart-qty').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const i = Number(e.target.getAttribute('data-idx'));
        const val = Math.max(1, parseInt(e.target.value || '1', 10));
        cart[i].antall = val;
        renderCart();
      });
    });
    cartTbody.querySelectorAll('button.remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = Number(e.target.getAttribute('data-idx'));
        cart.splice(i, 1);
        renderCart();
      });
    });
  }

  addBtn.addEventListener('click', () => {
    if (!currentMatch) return;
    // slå sammen like linjer (hvor+hva+formal+enhet+sats)
    const key = (x) => [x.hvor, x.hva || '', x.formal, x.enhet || '', x.sats].join('||');
    const existingIndex = cart.findIndex(it => key(it) === key(currentMatch));
    if (existingIndex >= 0) {
      cart[existingIndex].antall += Math.max(1, parseInt(antallInput.value || '1', 10));
    } else {
      cart.push({ ...currentMatch });
    }
    renderCart();
  });

  document.getElementById('clear-cart').addEventListener('click', () => {
    cart.splice(0, cart.length);
    renderCart();
  });

  // PDF nedlasting via utskriftsdialog
  if (printBtn) {
    printBtn.addEventListener('click', () => {
      // Sørg for at siste kalkyle er oppdatert før print
      calculate();
      // Sett referansefelt for PDF
      const kunde = (kundeInput?.value || '').trim();
      const ordre = (ordreInput?.value || '').trim();
      if (printMeta) {
        const now = new Date();
        const dato = now.toLocaleString('nb-NO');
        let html = '<strong>Oppsummering</strong>';
        if (kunde) html += `<div>Kundereferanse: ${kunde}</div>`;
        if (ordre) html += `<div>Ordrenummer: ${ordre}</div>`;
        html += `<div><small>Generert: ${dato}</small></div>`;
        printMeta.innerHTML = html;
      }
      window.print();
    });
  }
})();
