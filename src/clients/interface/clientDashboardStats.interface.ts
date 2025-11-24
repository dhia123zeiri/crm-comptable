export interface ClientDashboardStats {
  totalFactures: number;
  facturesValidees: number;
  dossiersEnAttente: number;
  montantCaisse: number; // Optional: you might want to calculate total from factures
}