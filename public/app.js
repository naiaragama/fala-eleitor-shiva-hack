const API = "/api/deputados";

async function init() {
  const res = await fetch(API);
  const candidatos = await res.json();
  const container = document.getElementById("cards");

  for (const c of candidatos) {
    const foto = `/api/fotos/${c.id}.jpg`;
    const espectroClass = c.espectro.toLowerCase().includes("esquerda")
      ? "badge-esquerda"
      : "badge-centro-direita";

    const card = document.createElement("div");
    card.className = `card${c.cassado ? " cassado" : ""}`;
    card.innerHTML = `
      <div class="card-header">
        <img src="${foto}" alt="${c.nome}" loading="lazy">
        <div>
          <h2>${c.nome}</h2>
          <span class="badge ${espectroClass}">${c.partido} · ${c.espectro}</span>
          ${c.cassado ? '<span class="badge" style="background:#7f1d1d;margin-left:4px">Cassado</span>' : ""}
        </div>
      </div>
      <div class="card-stats">
        <div class="stat"><div class="stat-label">Votos 2022</div><div class="stat-value">${c.votos2022}</div></div>
        <div class="stat"><div class="stat-label">UF</div><div class="stat-value">RJ</div></div>
      </div>
    `;
    card.onclick = () => loadDeputado(c.id, c.nome);
    container.appendChild(card);
  }
}

async function loadDeputado(id, nome) {
  const modal = document.getElementById("modal");
  const content = document.getElementById("modal-content");
  modal.style.display = "block";
  content.innerHTML = `<h2 style="color:#38bdf8;margin-bottom:1rem">${nome}</h2><p>Carregando dados...</p>`;

  try {
    const res = await fetch(`${API}/${id}/completo`);
    const d = await res.json();
    content.innerHTML = renderDeputado(d);
  } catch (e) {
    content.innerHTML = `<p style="color:#ef4444">Erro ao carregar: ${e.message}</p>`;
  }
}

function renderDeputado(d) {
  const p = d.perfil;
  const nome = p?.ultimoStatus?.nome || d.candidato?.nome || "—";
  const foto = p ? `/api/fotos/${p.id}.jpg` : "";

  let html = `
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem">
      ${foto ? `<img src="${foto}" style="width:80px;height:80px;border-radius:50%;border:2px solid #38bdf8">` : ""}
      <div>
        <h2 style="color:#38bdf8">${nome}</h2>
        <p style="color:#94a3b8">${p?.ultimoStatus?.siglaPartido || ""} · ${p?.ultimoStatus?.siglaUf || ""}</p>
        <p style="color:#64748b;font-size:0.85rem">${p?.nomeCivil || ""}</p>
        <p style="color:#64748b;font-size:0.85rem">Escolaridade: ${p?.escolaridade || "—"}</p>
        <p style="color:#64748b;font-size:0.85rem">Situação: ${p?.ultimoStatus?.situacao || "—"}</p>
      </div>
    </div>`;

  // Gabinete
  if (p?.ultimoStatus?.gabinete) {
    const g = p.ultimoStatus.gabinete;
    html += section("Gabinete", `Sala ${g.sala}, Prédio ${g.predio} · Tel: ${g.telefone} · ${g.email}`);
  }

  // Despesas
  if (d.despesas?.length) {
    const total = d.despesas.reduce((s, x) => s + x.valorLiquido, 0);
    const rows = d.despesas.slice(0, 10).map(x =>
      `<tr><td>${x.mes}/${x.ano}</td><td>${x.tipoDespesa}</td><td>R$ ${x.valorLiquido.toFixed(2)}</td><td style="font-size:0.75rem">${x.nomeFornecedor}</td></tr>`
    ).join("");
    html += section("Despesas (Cota Parlamentar)",
      `<p style="color:#38bdf8;font-size:1.1rem;margin-bottom:0.5rem">Total: R$ ${total.toFixed(2)}</p>
       <table style="width:100%;font-size:0.8rem;border-collapse:collapse">
         <tr style="color:#64748b"><th>Mês</th><th>Tipo</th><th>Valor</th><th>Fornecedor</th></tr>
         ${rows}
       </table>`
    );
  }

  // Proposições
  if (d.proposicoes?.length) {
    const items = d.proposicoes.slice(0, 10).map(x =>
      `<li>${x.siglaTipo} ${x.numero}/${x.ano} — ${x.ementa || "<em>sem ementa</em>"}</li>`
    ).join("");
    html += section("Projetos Apresentados", `<ul style="padding-left:1rem;font-size:0.85rem">${items}</ul>`);
  }

  // Eventos (presença)
  if (d.eventos?.length) {
    const items = d.eventos.slice(0, 8).map(x =>
      `<li>${x.dataHoraInicio?.split("T")[0]} — ${x.descricaoTipo}: ${x.descricao?.substring(0, 80)}</li>`
    ).join("");
    html += section("Presença em Sessões (recentes)", `<ul style="padding-left:1rem;font-size:0.85rem">${items}</ul>`);
  }

  // Frentes
  if (d.frentes?.length) {
    const items = d.frentes.slice(0, 15).map(x => `<li>${x.titulo}</li>`).join("");
    html += section(`Frentes Parlamentares (${d.frentes.length})`, `<ul style="padding-left:1rem;font-size:0.85rem">${items}</ul>`);
  }

  // Comissões
  if (d.orgaos?.length) {
    const items = d.orgaos.slice(0, 10).map(x =>
      `<li><strong>${x.siglaOrgao}</strong> — ${x.titulo || x.nomeOrgao} (${x.dataInicio || ""})</li>`
    ).join("");
    html += section("Comissões / Órgãos", `<ul style="padding-left:1rem;font-size:0.85rem">${items}</ul>`);
  }

  // Fontes
  html += section("Fontes de Dados", `
    <ul style="padding-left:1rem;font-size:0.8rem;color:#64748b">
      <li><a href="https://dadosabertos.camara.leg.br/api/v2/deputados/${p?.id}" target="_blank" style="color:#38bdf8">API Câmara dos Deputados</a></li>
      <li><a href="https://portaldatransparencia.gov.br/api-de-dados" target="_blank" style="color:#38bdf8">Portal da Transparência</a></li>
      <li><a href="https://dadosabertos.tse.jus.br" target="_blank" style="color:#38bdf8">TSE Dados Abertos</a></li>
    </ul>
  `);

  return html;
}

function section(title, content) {
  return `
    <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid #334155">
      <h3 style="color:#f1f5f9;font-size:1rem;margin-bottom:0.5rem">${title}</h3>
      ${content}
    </div>`;
}

init();
