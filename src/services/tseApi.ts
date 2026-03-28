/**
 * Serviço de integração com dados do TSE (Tribunal Superior Eleitoral)
 * Portal: https://dadosabertos.tse.jus.br
 * 
 * O TSE disponibiliza datasets em CSV/JSON para download, não uma REST API tradicional.
 * Datasets relevantes:
 * - Candidatos: dados cadastrais, bens declarados, filiação partidária
 * - Resultados: votação por candidato/município
 * - Prestação de contas: receitas e despesas de campanha
 * 
 * Para o MVP, usamos a API de resultados de eleição do TSE (divulgação):
 * https://resultados.tse.jus.br/oficial/ele2022/...
 * 
 * E também o endpoint CKAN do portal de dados abertos:
 * https://dadosabertos.tse.jus.br/api/3/action/package_list
 */

const TSE_CKAN = "https://dadosabertos.tse.jus.br/api/3/action";

export interface TseDataset {
  name: string;
  title: string;
  notes: string;
}

export async function listarDatasets(): Promise<string[] | null> {
  try {
    const res = await fetch(`${TSE_CKAN}/package_list`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.result as string[];
  } catch {
    return null;
  }
}

export async function getDatasetInfo(name: string): Promise<TseDataset | null> {
  try {
    const res = await fetch(`${TSE_CKAN}/package_show?id=${name}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.result as TseDataset;
  } catch {
    return null;
  }
}

/**
 * URLs de download direto dos datasets mais relevantes para o MVP:
 * Estes arquivos CSV podem ser baixados e processados offline.
 */
export const DATASETS_ELEICOES_2022 = {
  candidatos:
    "https://dadosabertos.tse.jus.br/dataset/candidatos-2022",
  bensCandidatos:
    "https://dadosabertos.tse.jus.br/dataset/bens-de-candidatos-2022",
  resultados:
    "https://dadosabertos.tse.jus.br/dataset/resultados-2022",
  prestacaoContas:
    "https://dadosabertos.tse.jus.br/dataset/prestacao-de-contas-eleitorais-2022",
  filiacaoPartidaria:
    "https://dadosabertos.tse.jus.br/dataset/filiados-partidarios",
};
