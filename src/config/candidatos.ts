// IDs obtidos da API dadosabertos.camara.leg.br/api/v2
export interface Candidato {
  id: number;
  nome: string;
  partido: string;
  espectro: string;
  votos2022: string;
  // Glauber foi cassado em dez/2024, precisa de idLegislatura=57 para buscar dados históricos
  cassado?: boolean;
}

export const CANDIDATOS: Candidato[] = [
  {
    id: 204464,
    nome: "Talíria Petrone",
    partido: "PSOL",
    espectro: "Esquerda",
    votos2022: "198.548",
  },
  {
    id: 204459,
    nome: "Daniela do Waguinho",
    partido: "UNIÃO",
    espectro: "Centro-direita",
    votos2022: "213.706",
  },
  {
    id: 152605,
    nome: "Glauber Braga",
    partido: "PSOL",
    espectro: "Esquerda",
    votos2022: "78.048",
    cassado: true,
  },
  {
    id: 204450,
    nome: "Doutor Luizinho",
    partido: "PP",
    espectro: "Centro-direita",
    votos2022: "Top 5 RJ",
  },
];
