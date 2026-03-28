/**
 * Serviço de integração com a API do Portal da Transparência
 * Docs: https://portaldatransparencia.gov.br/api-de-dados
 * 
 * Endpoints úteis para servidores públicos (deputados são servidores da Câmara):
 * - /servidores: remuneração mensal, auxílios
 * 
 * NOTA: A API do Portal da Transparência requer cadastro para obter chave de API.
 * Cadastre-se em: https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email
 * Após cadastro, a chave é enviada por email.
 */

const BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";

// Chave de API - configure via variável de ambiente
const API_KEY = process.env.TRANSPARENCIA_API_KEY || "";

async function fetchTransparencia<T>(endpoint: string): Promise<T | null> {
  if (!API_KEY) {
    console.warn("[Transparência] API_KEY não configurada. Configure TRANSPARENCIA_API_KEY.");
    return null;
  }

  const res = await fetch(`${BASE}${endpoint}`, {
    headers: {
      "chave-api-dados": API_KEY,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    console.error(`[Transparência] ${res.status}: ${endpoint}`);
    return null;
  }

  return res.json() as Promise<T>;
}

// --- Remuneração de Servidores ---
export interface Remuneracao {
  mesAno: { mes: number; ano: number };
  remuneracaoBasicaBruta: number;
  abatesTeto: number;
  gratificacaoNatalina: number;
  ferias: number;
  outrasRemuneracoesEventuais: number;
  irrf: number;
  pss: number;
  demaisDeducoes: number;
  remuneracaoAposDeducoes: number;
}

export async function getRemuneracao(cpf: string) {
  return fetchTransparencia<Remuneracao[]>(
    `/servidores/remuneracao?cpf=${cpf}`
  );
}

// --- Viagens a Serviço ---
export interface Viagem {
  codigoProponente: string;
  nomeProponente: string;
  cpfBeneficiario: string;
  nomeBeneficiario: string;
  dataInicio: string;
  dataFim: string;
  destino: string;
  motivo: string;
  valor: number;
}

export async function getViagens(cpf: string) {
  return fetchTransparencia<Viagem[]>(
    `/viagens?cpfBeneficiario=${cpf}`
  );
}
