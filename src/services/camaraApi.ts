/**
 * Serviço de integração com a API de Dados Abertos da Câmara dos Deputados
 * Docs: https://dadosabertos.camara.leg.br/swagger/api.html
 * Base: https://dadosabertos.camara.leg.br/api/v2
 */

const BASE = "https://dadosabertos.camara.leg.br/api/v2";

async function fetchJson<T>(url: string): Promise<T> {
  const sep = url.includes("?") ? "&" : "?";
  const res = await fetch(`${url}${sep}formato=json`);
  if (!res.ok) throw new Error(`API Câmara ${res.status}: ${url}`);
  const json = await res.json();
  return json.dados as T;
}

// --- Perfil do deputado ---
export interface DeputadoPerfil {
  id: number;
  nomeCivil: string;
  cpf: string;
  sexo: string;
  dataNascimento: string;
  ufNascimento: string;
  municipioNascimento: string;
  escolaridade: string;
  ultimoStatus: {
    nome: string;
    siglaPartido: string;
    siglaUf: string;
    situacao: string;
    condicaoEleitoral: string;
    nomeEleitoral: string;
    gabinete: {
      nome: string;
      predio: string;
      sala: string;
      telefone: string;
      email: string;
    };
  };
  redeSocial: string[];
}

export function getPerfil(id: number) {
  return fetchJson<DeputadoPerfil>(`${BASE}/deputados/${id}`);
}


// --- Despesas (Cota Parlamentar) ---
export interface Despesa {
  ano: number;
  mes: number;
  tipoDespesa: string;
  codDocumento: string;
  dataDocumento: string;
  valorDocumento: number;
  valorLiquido: number;
  valorGlosa: number;
  nomeFornecedor: string;
  cnpjCpfFornecedor: string;
  urlDocumento: string;
}

export async function getDespesas(id: number, ano?: number, pagina = 1, itens = 100) {
  let url = `${BASE}/deputados/${id}/despesas?itens=${itens}&pagina=${pagina}`;
  if (ano) url += `&ano=${ano}`;
  url += `&ordem=DESC&ordenarPor=ano`;
  return fetchJson<Despesa[]>(url);
}

// --- Eventos / Presença em sessões ---
export interface Evento {
  id: number;
  dataHoraInicio: string;
  dataHoraFim: string;
  situacao: string;
  descricaoTipo: string;
  descricao: string;
  urlRegistro: string;
  orgaos: { sigla: string; nome: string }[];
}

export async function getEventos(id: number, pagina = 1, itens = 50) {
  return fetchJson<Evento[]>(
    `${BASE}/deputados/${id}/eventos?itens=${itens}&pagina=${pagina}&ordem=DESC`
  );
}

// --- Proposições (Projetos de Lei) ---
export interface Proposicao {
  id: number;
  siglaTipo: string;
  numero: number;
  ano: number;
  ementa: string;
  dataApresentacao: string;
}

export async function getProposicoes(id: number, pagina = 1, itens = 20) {
  return fetchJson<Proposicao[]>(
    `${BASE}/proposicoes?idDeputadoAutor=${id}&itens=${itens}&pagina=${pagina}&ordem=DESC&ordenarPor=ano`
  );
}

// --- Frentes Parlamentares ---
export interface Frente {
  id: number;
  titulo: string;
  idLegislatura: number;
}

export async function getFrentes(id: number) {
  return fetchJson<Frente[]>(`${BASE}/deputados/${id}/frentes`);
}

// --- Órgãos (Comissões) ---
export interface Orgao {
  idOrgao: number;
  siglaOrgao: string;
  nomeOrgao: string;
  nomePublicacao: string;
  titulo: string;
  dataInicio: string;
  dataFim: string;
}

export async function getOrgaos(id: number) {
  return fetchJson<Orgao[]>(`${BASE}/deputados/${id}/orgaos`);
}

// --- Ocupações / Profissões ---
export interface Ocupacao {
  titulo: string;
  entidade: string;
  entidadeUF: string;
  entidadePais: string;
  anoInicio: number;
  anoFim: number;
}

export async function getOcupacoes(id: number) {
  return fetchJson<Ocupacao[]>(`${BASE}/deputados/${id}/ocupacoes`);
}
